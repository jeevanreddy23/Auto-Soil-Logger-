/* STS GeoFlow — Cloudflare Worker
   Serves the geologger/ static app and stores all project data in Workers KV
   (namespace binding: GEOFLOW). The Worker IS the backend — no third-party API.

   Data model (mirrors the original API exactly, so web + field apps are untouched):
     GET  /api/v1/geologger/logs            → { boreholes: { <location>: { rows:[...] } } }
     POST /api/v1/geologger/logs {location, rows} → upsert one location

   KV keys: "log:<location>" → JSON rows array.
   First GET on an empty namespace lazily migrates every location from the old
   Render backend, then serves from KV forever after.

   Optional auth: set a Worker secret AUTOSOIL_API_KEY to require the
   X-Autosoil-Api-Key header on both endpoints. Unset = open (current behaviour). */

const LEGACY_API = "https://auto-soil-logger-api.onrender.com";
const PREFIX = "log:";
const MOBILE_ORIGINS = new Set([
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
  "https://autosoillogger.poreddyjeevanreddy.workers.dev"
]);

const ACCESS_POLICY_KEY = "access:policy:v1";
const ACCESS_WORKFLOW_PREFIX = "workflow:";
const ACCESS_PERMISSIONS = [
  "projects.list", "projects.view", "projects.manage", "projects.assign",
  "field.view", "field.edit", "photos.upload", "samples.view", "samples.manage",
  "laboratory.view", "laboratory.manage", "scope.view", "scope.manage", "scope.review",
  "logs.review", "qa.view", "tasks.assign", "dashboard.performance",
  "reports.view", "reports.prepare", "reports.review", "reports.approve", "reports.share", "exports.create",
  "team.view", "users.manage", "roles.manage", "settings.manage", "audit.view", "finance.view", "tenders.manage"
];
const ACCESS_ROLES = Object.freeze({
  director: { rank: 700, scope: "all", permissions: ["*"] },
  admin: { rank: 650, scope: "assigned", permissions: ["projects.list", "projects.view", "team.view", "users.manage", "roles.manage", "settings.manage", "audit.view"] },
  engineering_manager: { rank: 600, scope: "all", permissions: [
    "projects.list", "projects.view", "projects.manage", "projects.assign", "field.view", "field.edit", "photos.upload",
    "samples.view", "samples.manage", "laboratory.view", "scope.view", "scope.manage", "scope.review", "logs.review",
    "qa.view", "tasks.assign", "dashboard.performance", "reports.view", "reports.prepare", "reports.review",
    "reports.approve", "reports.share", "exports.create", "team.view", "audit.view"
  ] },
  project_engineer: { rank: 500, scope: "assigned", permissions: [
    "projects.list", "projects.view", "projects.manage", "projects.assign", "field.view", "field.edit", "photos.upload",
    "samples.view", "samples.manage", "laboratory.view", "scope.view", "scope.manage", "logs.review", "qa.view",
    "tasks.assign", "dashboard.performance", "reports.view", "reports.prepare", "reports.review", "reports.share",
    "exports.create", "team.view", "audit.view"
  ] },
  field_engineer: { rank: 400, scope: "assigned", permissions: [
    "projects.list", "projects.view", "field.view", "field.edit", "photos.upload", "samples.view", "samples.manage",
    "scope.view", "dashboard.performance", "team.view"
  ] },
  laboratory_staff: { rank: 350, scope: "assigned", permissions: [
    "projects.list", "projects.view", "samples.view", "samples.manage", "laboratory.view", "laboratory.manage", "reports.view", "team.view"
  ] },
  client: { rank: 100, scope: "assigned", permissions: ["projects.list", "projects.view", "reports.view"] }
});

const CONTROL_WORKFLOW_STAGES = Object.freeze([
  ["job_created", "Job Created", "admin", "Confirm job details and acceptance", 2],
  ["scope_reviewed", "Scope Reviewed", "project_engineer", "Review scope, exclusions and deliverables", 2],
  ["fieldwork_planned", "Fieldwork Planned", "admin", "Confirm field allocation, access and booking", 3],
  ["fieldwork_in_progress", "Fieldwork In Progress", "field_engineer", "Complete the next scheduled field activity", 2],
  ["fieldwork_completed", "Fieldwork Completed", "field_engineer", "Confirm field records, samples and demobilisation", 1],
  ["logs_in_progress", "Logs In Progress", "field_engineer", "Complete factual logs and field data QA", 3],
  ["logs_reviewed", "Logs Reviewed", "project_engineer", "Review logs and resolve factual corrections", 2],
  ["lab_results_pending", "Lab Results Pending", "laboratory_staff", "Receive and validate outstanding laboratory results", 5],
  ["engineering_assessment", "Engineering Assessment", "project_engineer", "Complete engineering interpretation and risk assessment", 3],
  ["report_drafting", "Report Drafting", "project_engineer", "Prepare the report for independent review", 4],
  ["technical_review", "Technical Review", "engineering_manager", "Review and approve the technical report", 3],
  ["client_follow_up", "Client Follow-up", "project_engineer", "Resolve client information or report comments", 3],
  ["report_issued", "Report Issued", "admin", "Issue the approved report and record transmittal", 1],
  ["invoice_requested", "Invoice Requested", "admin", "Prepare the invoice request with approved scope changes", 2],
  ["invoice_issued", "Invoice Issued", "admin", "Issue the invoice and record its number", 2],
  ["payment_follow_up", "Payment Follow-up", "admin", "Monitor payment and follow up when due", 14],
  ["job_closed", "Job Closed", "admin", "Confirm records are retained and close the job", 2]
].map(([id, title, ownerRole, action, dueDays], sequence) => Object.freeze({ id, title, ownerRole, action, dueDays, sequence })));
const CONTROL_STAGE_BY_ID = Object.freeze(Object.fromEntries(CONTROL_WORKFLOW_STAGES.map(stage => [stage.id, stage])));
const CONTROL_STAGE_LIMITS = Object.freeze({ director: 16, admin: 16, engineering_manager: 16, project_engineer: 10, field_engineer: 5, laboratory_staff: 7, client: 12 });
const CONTROL_PROJECT_STORES = Object.freeze([
  "jobs", "job_stages", "job_tasks", "job_assignments", "job_scope_items", "field_activities", "boreholes", "samples",
  "lab_tests", "reports", "review_comments", "variations", "invoices", "blockers", "activity_history"
]);
const CONTROL_EVIDENCE_STORES = Object.freeze([
  "job_assignments", "job_scope_items", "field_activities", "boreholes", "samples", "lab_tests", "reports", "review_comments", "variations", "invoices", "blockers"
]);
const CONTROL_STATE_KEY = "control-workflow:v1";

const accessJwksCache = new Map();

class AccessError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "AccessError";
    this.status = status;
    this.code = code;
  }
}

function accessEnabled(env) {
  return String(env.ACCESS_ENFORCEMENT || "").toLowerCase() === "enabled";
}

function accessText(value) {
  return String(value == null ? "" : value).trim();
}

function accessEmail(value) {
  return accessText(value).toLowerCase();
}

function accessUserId(email) {
  return `u_${accessEmail(email).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 46)}`;
}

function base64UrlBytes(value) {
  const encoded = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = encoded + "=".repeat((4 - encoded.length % 4) % 4);
  let binary;
  try { binary = atob(padded); }
  catch (error) { throw new AccessError(401, "invalid_access_token", "Cloudflare Access token encoding is invalid."); }
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function jwtJson(value) {
  try { return JSON.parse(new TextDecoder().decode(base64UrlBytes(value))); }
  catch (error) { throw new AccessError(401, "invalid_access_token", "Cloudflare Access token payload is invalid."); }
}

function teamDomain(env) {
  return accessText(env.TEAM_DOMAIN).replace(/\/$/, "");
}

async function accessJwks(env) {
  if (env.ACCESS_JWKS) {
    try {
      const parsed = typeof env.ACCESS_JWKS === "string" ? JSON.parse(env.ACCESS_JWKS) : env.ACCESS_JWKS;
      if (parsed && Array.isArray(parsed.keys)) return parsed.keys;
    } catch (error) {}
    throw new AccessError(503, "access_configuration_error", "ACCESS_JWKS is not valid JWKS JSON.");
  }
  const domain = teamDomain(env);
  const cached = accessJwksCache.get(domain);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;
  let response;
  try { response = await fetch(`${domain}/cdn-cgi/access/certs`); }
  catch (error) { throw new AccessError(503, "access_key_unavailable", "Cloudflare Access signing keys are unavailable."); }
  if (!response.ok) throw new AccessError(503, "access_key_unavailable", "Cloudflare Access signing keys could not be loaded.");
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.keys)) throw new AccessError(503, "access_key_unavailable", "Cloudflare Access returned an invalid signing-key set.");
  accessJwksCache.set(domain, { keys: payload.keys, expiresAt: Date.now() + 5 * 60 * 1000 });
  return payload.keys;
}

async function verifyAccessJwt(request, env, now) {
  const domain = teamDomain(env);
  const audience = accessText(env.POLICY_AUD);
  if (!domain || !audience) throw new AccessError(503, "access_configuration_error", "TEAM_DOMAIN and POLICY_AUD are required when server access enforcement is enabled.");
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new AccessError(401, "missing_access_token", "A verified Cloudflare Access session is required.");
  const parts = token.split(".");
  if (parts.length !== 3) throw new AccessError(401, "invalid_access_token", "Cloudflare Access token is malformed.");
  const header = jwtJson(parts[0]);
  const claims = jwtJson(parts[1]);
  if (header.alg !== "RS256" || !accessText(header.kid)) throw new AccessError(401, "invalid_access_token", "Cloudflare Access token algorithm or key ID is invalid.");
  const keys = await accessJwks(env);
  const jwk = keys.find(key => key && key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new AccessError(401, "invalid_access_token", "Cloudflare Access signing key was not found.");
  let key;
  try { key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]); }
  catch (error) { throw new AccessError(401, "invalid_access_token", "Cloudflare Access signing key is invalid."); }
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlBytes(parts[2]), signed);
  if (!valid) throw new AccessError(401, "invalid_access_token", "Cloudflare Access token signature is invalid.");
  const current = Math.floor((now == null ? Date.now() : now) / 1000);
  const tokenAudiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== domain || !tokenAudiences.includes(audience) || claims.type !== "app") throw new AccessError(401, "invalid_access_token", "Cloudflare Access token issuer or audience is invalid.");
  if (!Number.isFinite(claims.exp) || claims.exp <= current - 30) throw new AccessError(401, "expired_access_token", "Cloudflare Access session has expired.");
  if (Number.isFinite(claims.nbf) && claims.nbf > current + 30) throw new AccessError(401, "invalid_access_token", "Cloudflare Access session is not active yet.");
  claims.email = accessEmail(claims.email);
  if (!claims.email) throw new AccessError(403, "identity_email_required", "Cloudflare Access did not provide a user email.");
  return claims;
}

function serverRole(roleId) {
  return ACCESS_ROLES[roleId] || ACCESS_ROLES.client;
}

function serverPermissions(user) {
  if (!user || user.active === false) return [];
  const rolePermissions = serverRole(user.role).permissions;
  const base = rolePermissions.includes("*") ? ACCESS_PERMISSIONS.slice() : rolePermissions.slice();
  const allow = Array.isArray(user.permissionAllow) ? user.permissionAllow.filter(permission => ACCESS_PERMISSIONS.includes(permission)) : [];
  const deny = new Set(Array.isArray(user.permissionDeny) ? user.permissionDeny : []);
  return [...new Set([...base, ...allow])].filter(permission => !deny.has(permission));
}

function serverCan(user, permission) {
  return serverPermissions(user).includes(permission);
}

function normaliseServerPolicy(value) {
  const source = value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : {};
  source.version = 1;
  source.enforcement = "cloudflare-rls";
  source.users = Array.isArray(source.users) ? source.users.filter(user => user && accessText(user.id)) : [];
  source.projects = source.projects && typeof source.projects === "object" ? source.projects : {};
  source.projectAssignments = source.projectAssignments && typeof source.projectAssignments === "object" ? source.projectAssignments : {};
  source.projectResponsibilities = source.projectResponsibilities && typeof source.projectResponsibilities === "object" ? source.projectResponsibilities : {};
  source.audit = Array.isArray(source.audit) ? source.audit.slice(0, 1000) : [];
  source.users.forEach(user => {
    user.name = accessText(user.name) || accessEmail(user.email) || "Unnamed user";
    user.email = accessEmail(user.email);
    user.role = ACCESS_ROLES[user.role] ? user.role : "client";
    user.active = user.active !== false;
    user.permissionAllow = Array.isArray(user.permissionAllow) ? user.permissionAllow.filter(permission => ACCESS_PERMISSIONS.includes(permission)) : [];
    user.permissionDeny = Array.isArray(user.permissionDeny) ? user.permissionDeny.filter(permission => ACCESS_PERMISSIONS.includes(permission)) : [];
  });
  for (const [projectId, project] of Object.entries(source.projects)) {
    if (!project || typeof project !== "object") { delete source.projects[projectId]; continue; }
    project.id = projectId;
    project.name = accessText(project.name).slice(0, 180);
    project.number = accessText(project.number).slice(0, 80);
    project.recordKey = accessText(project.recordKey).slice(0, 200);
  }
  for (const [projectId, assignments] of Object.entries(source.projectAssignments)) {
    if (!assignments || typeof assignments !== "object") { delete source.projectAssignments[projectId]; continue; }
    for (const [userId, assignment] of Object.entries(assignments)) {
      if (!assignment || typeof assignment !== "object") { delete assignments[userId]; continue; }
      assignment.active = assignment.active !== false;
      assignment.projectRole = accessText(assignment.projectRole).slice(0, 80);
      assignment.reportIds = Array.isArray(assignment.reportIds) ? [...new Set(assignment.reportIds.map(accessText).filter(Boolean))].slice(0, 500) : [];
    }
  }
  return source;
}

function serverAudit(actorId, action, targetType, targetId, detail, meta) {
  return {
    id: `ae_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(), actorId, action, targetType, targetId, detail,
    meta: meta && typeof meta === "object" ? meta : undefined
  };
}

async function loadServerPolicy(env) {
  const raw = await env.GEOFLOW.get(ACCESS_POLICY_KEY);
  if (!raw) return null;
  try { return normaliseServerPolicy(JSON.parse(raw)); }
  catch (error) { throw new AccessError(503, "access_policy_invalid", "The stored access policy is invalid."); }
}

async function bootstrapServerPolicy(claims, env) {
  const bootstrapEmail = accessEmail(env.ACCESS_BOOTSTRAP_DIRECTOR_EMAIL);
  if (!bootstrapEmail || claims.email !== bootstrapEmail) throw new AccessError(403, "access_policy_uninitialised", "Access policy is not initialised for this identity.");
  const id = accessUserId(claims.email);
  const now = new Date().toISOString();
  const policy = normaliseServerPolicy({
    users: [{ id, name: claims.email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()), email: claims.email, role: "director", active: true, createdAt: now }],
    projects: {}, projectAssignments: {}, projectResponsibilities: {},
    audit: [serverAudit(id, "access.bootstrap", "organisation", "sts", "Initial Cloudflare Director access created")]
  });
  await env.GEOFLOW.put(ACCESS_POLICY_KEY, JSON.stringify(policy));
  return policy;
}

async function serverAccessContext(request, env) {
  if (!accessEnabled(env)) return null;
  const claims = await verifyAccessJwt(request, env);
  const policy = await loadServerPolicy(env) || await bootstrapServerPolicy(claims, env);
  const user = policy.users.find(item => item.active && item.email === claims.email);
  if (!user) throw new AccessError(403, "identity_not_authorised", "This Cloudflare identity is not an active STS GeoFlow user.");
  return { claims, policy, user };
}

function projectAssignment(context, projectId) {
  return context.policy.projectAssignments[projectId] && context.policy.projectAssignments[projectId][context.user.id] || null;
}

function authoriseProject(context, request, permission, providedRecordKey, options) {
  if (!context || !serverCan(context.user, permission)) throw new AccessError(403, "permission_denied", `Permission ${permission} is required.`);
  const projectId = accessText(request.headers.get("X-GeoFlow-Project") || options && options.projectId);
  if (!projectId) throw new AccessError(400, "project_required", "X-GeoFlow-Project is required.");
  if (serverRole(context.user.role).scope !== "all") {
    const assignment = projectAssignment(context, projectId);
    if (!assignment || assignment.active === false) throw new AccessError(403, "project_access_denied", "This identity is not assigned to the requested project.");
  }
  const project = context.policy.projects[projectId];
  if (!project) throw new AccessError(409, "project_binding_missing", "The project has no server record binding.");
  const expectedRecordKey = accessText(project.recordKey);
  if (!options || options.requireRecord !== false) {
    if (!expectedRecordKey) throw new AccessError(409, "project_binding_missing", "The project record binding is empty.");
    if (accessText(providedRecordKey) !== expectedRecordKey) throw new AccessError(403, "record_access_denied", "The requested record does not belong to this project.");
  }
  return { projectId, project, assignment: projectAssignment(context, projectId), recordKey: expectedRecordKey };
}

function emptyServerWorkflow(projectId, reportId) {
  return { projectId, reportId, status: "Draft", revision: "P01", preparedBy: null, submittedBy: null, reviewedBy: null, approvedBy: null, history: [] };
}

function workflowKey(projectId, reportId) {
  return `${ACCESS_WORKFLOW_PREFIX}${projectId}:${reportId}`;
}

function transitionServerWorkflow(workflow, action, user, note) {
  const flow = Object.assign(emptyServerWorkflow(workflow.projectId, workflow.reportId), JSON.parse(JSON.stringify(workflow)));
  const now = new Date().toISOString();
  const event = { id: `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`, at: now, action, by: user.id, byName: user.name, note: accessText(note) };
  if (action === "prepare") {
    if (!serverCan(user, "reports.prepare") || !["Draft", "Changes requested", "Prepared"].includes(flow.status)) throw new AccessError(409, "workflow_transition_denied", `A ${flow.status} report cannot be prepared by this identity.`);
    flow.status = "Prepared"; flow.preparedBy = { id: user.id, name: user.name, at: now }; flow.submittedBy = null; flow.reviewedBy = null; flow.approvedBy = null;
  } else if (action === "submit") {
    if (!serverCan(user, "reports.prepare") || !["Draft", "Prepared", "Changes requested"].includes(flow.status)) throw new AccessError(409, "workflow_transition_denied", "This report cannot be submitted for review.");
    if (!flow.preparedBy) flow.preparedBy = { id: user.id, name: user.name, at: now };
    if (flow.preparedBy.id !== user.id) throw new AccessError(403, "separation_of_duties", "Only the report preparer can submit this revision.");
    flow.status = "In review"; flow.submittedBy = { id: user.id, name: user.name, at: now }; flow.reviewedBy = null; flow.approvedBy = null;
  } else if (action === "review") {
    if (!serverCan(user, "reports.review") || flow.status !== "In review") throw new AccessError(409, "workflow_transition_denied", "The report must be in review.");
    if (flow.preparedBy && flow.preparedBy.id === user.id) throw new AccessError(403, "separation_of_duties", "The report preparer cannot review the same revision.");
    flow.status = "Reviewed"; flow.reviewedBy = { id: user.id, name: user.name, at: now }; flow.approvedBy = null;
  } else if (action === "request_changes") {
    if (!serverCan(user, "reports.review") || !["In review", "Reviewed"].includes(flow.status)) throw new AccessError(409, "workflow_transition_denied", "Changes can only be requested during review.");
    if (flow.preparedBy && flow.preparedBy.id === user.id) throw new AccessError(403, "separation_of_duties", "The report preparer cannot perform the independent review action.");
    if (!event.note) throw new AccessError(400, "change_reason_required", "A change request must include a reason.");
    flow.status = "Changes requested"; flow.reviewedBy = null; flow.approvedBy = null;
  } else if (action === "approve") {
    if (!serverCan(user, "reports.approve") || flow.status !== "Reviewed" || !flow.reviewedBy) throw new AccessError(409, "workflow_transition_denied", "The report must complete independent review before approval.");
    if (flow.preparedBy && flow.preparedBy.id === user.id) throw new AccessError(403, "separation_of_duties", "The report preparer cannot approve the same revision.");
    if (flow.reviewedBy.id === user.id) throw new AccessError(403, "separation_of_duties", "The reviewer and approver must be different people.");
    flow.status = "Approved"; flow.approvedBy = { id: user.id, name: user.name, at: now };
  } else {
    throw new AccessError(400, "workflow_action_invalid", "The requested report action is invalid.");
  }
  flow.history = Array.isArray(flow.history) ? flow.history : [];
  flow.history.unshift(event);
  return flow;
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!origin || !MOBILE_ORIGINS.has(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Autosoil-Api-Key, X-GeoFlow-Project, X-GeoFlow-Record-Key",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function withCors(response, request) {
  const allowed = corsHeaders(request);
  if (!allowed) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(allowed)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function handlePreflight(request) {
  const allowed = corsHeaders(request);
  if (!allowed) return json({ error: "origin not allowed" }, 403);
  return new Response(null, { status: 204, headers: allowed });
}

function authorised(request, env) {
  if (!env.AUTOSOIL_API_KEY) return true;
  return request.headers.get("X-Autosoil-Api-Key") === env.AUTOSOIL_API_KEY;
}

function apiFailure(error) {
  if (error instanceof AccessError) return json({ error: error.code, message: error.message }, error.status);
  return json({ error: "internal_error", message: "The request could not be completed." }, 500);
}

async function safely(handler) {
  try { return await handler(); }
  catch (error) { return apiFailure(error); }
}

function visibleProjectIds(context) {
  if (serverRole(context.user.role).scope === "all") return Object.keys(context.policy.projects);
  return Object.entries(context.policy.projectAssignments)
    .filter(([, assignments]) => assignments && assignments[context.user.id] && assignments[context.user.id].active !== false)
    .map(([projectId]) => projectId);
}

function samePolicyValue(left, right) {
  return JSON.stringify(left == null ? null : left) === JSON.stringify(right == null ? null : right);
}

function canAssignServerProject(context, projectId) {
  if (!serverCan(context.user, "projects.assign") || !context.policy.projects[projectId]) return false;
  if (serverRole(context.user.role).scope === "all") return true;
  const assignment = projectAssignment(context, projectId);
  return Boolean(assignment && assignment.active !== false);
}

function validatePolicyUpdate(input, current, actor) {
  if (!input || typeof input !== "object" || !Array.isArray(input.users)) throw new AccessError(400, "policy_invalid", "A users array is required.");
  if (input.users.some(user => !user || !ACCESS_ROLES[user.role])) throw new AccessError(400, "policy_invalid", "Every user must have a recognised STS role.");
  const candidate = normaliseServerPolicy(input);
  const ids = new Set(); const emails = new Set();
  for (const user of candidate.users) {
    if (!user.id || !user.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user.email)) throw new AccessError(400, "policy_invalid", "Every user requires a unique ID and valid email.");
    if (ids.has(user.id) || emails.has(user.email)) throw new AccessError(400, "policy_invalid", "User IDs and email addresses must be unique.");
    ids.add(user.id); emails.add(user.email);
    const existing = current.users.find(item => item.id === user.id);
    if (actor.role !== "director") {
      if (["director", "engineering_manager"].includes(user.role) && (!existing || existing.role !== user.role)) throw new AccessError(403, "role_escalation_denied", "Only a Director can grant company-wide engineering authority.");
      if (existing && existing.role === "director" && !samePolicyValue(user, existing)) throw new AccessError(403, "role_escalation_denied", "Only a Director can change another Director.");
      if (existing && existing.id === actor.id && user.role !== existing.role) throw new AccessError(403, "role_escalation_denied", "A user cannot change their own organisation role.");
      if (existing && existing.id === actor.id && (!samePolicyValue(user.permissionAllow, existing.permissionAllow) || !samePolicyValue(user.permissionDeny, existing.permissionDeny))) throw new AccessError(403, "role_escalation_denied", "A user cannot change their own feature exceptions.");
      const sensitive = new Set(["reports.approve", "finance.view", "tenders.manage"]);
      if ((user.permissionAllow || []).some(permission => sensitive.has(permission) && !(existing && (existing.permissionAllow || []).includes(permission)))) throw new AccessError(403, "role_escalation_denied", "Only a Director can grant approval, finance or tender exceptions.");
      if (serverRole(user.role).rank >= serverRole(actor.role).rank && (!existing || existing.role !== user.role)) throw new AccessError(403, "role_escalation_denied", "A user cannot grant a role at or above their own authority.");
    }
  }
  if (actor.role !== "director") {
    for (const director of current.users.filter(user => user.role === "director")) {
      if (!candidate.users.some(user => user.id === director.id && samePolicyValue(user, director))) throw new AccessError(403, "role_escalation_denied", "Only a Director can remove or change a Director account.");
    }
  }
  if (!candidate.users.some(user => user.active && user.role === "director")) throw new AccessError(400, "director_required", "At least one active Director is required.");
  for (const [projectId, project] of Object.entries(candidate.projects)) {
    if (!projectId || !project || typeof project !== "object") throw new AccessError(400, "policy_invalid", "Project policy records must be objects.");
    project.id = projectId;
    project.name = accessText(project.name).slice(0, 180);
    project.number = accessText(project.number).slice(0, 80);
    project.recordKey = accessText(project.recordKey).slice(0, 200);
    if (!project.recordKey) throw new AccessError(400, "policy_invalid", `Project ${projectId} requires a record key.`);
    const existing = current.projects[projectId];
    if (actor.role !== "director" && (!existing || existing.recordKey !== project.recordKey)) throw new AccessError(403, "project_binding_denied", "Only a Director can create or change a project record binding.");
  }
  if (actor.role !== "director" && Object.keys(current.projects).some(projectId => !candidate.projects[projectId])) throw new AccessError(403, "project_binding_denied", "Only a Director can remove a project record binding.");
  if (actor.role !== "director" && !serverCan(actor, "projects.assign")) {
    if (!samePolicyValue(candidate.projectAssignments, current.projectAssignments) || !samePolicyValue(candidate.projectResponsibilities, current.projectResponsibilities)) throw new AccessError(403, "project_assignment_denied", "Project assignment authority is required.");
  }
  for (const [projectId, assignments] of Object.entries(candidate.projectAssignments)) {
    if (!candidate.projects[projectId] || !assignments || typeof assignments !== "object") throw new AccessError(400, "policy_invalid", "Assignments must reference a registered project.");
    for (const [userId, assignment] of Object.entries(assignments)) {
      if (!ids.has(userId) || !assignment || typeof assignment !== "object") throw new AccessError(400, "policy_invalid", "Assignments must reference a registered user.");
      assignment.active = assignment.active !== false;
      assignment.projectRole = accessText(assignment.projectRole).slice(0, 80);
      assignment.reportIds = Array.isArray(assignment.reportIds) ? [...new Set(assignment.reportIds.map(accessText).filter(Boolean))].slice(0, 500) : [];
    }
  }
  for (const [projectId, responsibility] of Object.entries(candidate.projectResponsibilities)) {
    if (!candidate.projects[projectId] || !responsibility || typeof responsibility !== "object") throw new AccessError(400, "policy_invalid", "Approval responsibilities must reference a registered project.");
    const steps = [["preparerId", "reports.prepare"], ["reviewerId", "reports.review"], ["approverId", "reports.approve"]];
    const selected = steps.map(([key]) => accessText(responsibility[key])).filter(Boolean);
    if (new Set(selected).size !== selected.length) throw new AccessError(400, "separation_of_duties", "Preparer, reviewer and approver must be different users.");
    for (const [key, permission] of steps) {
      responsibility[key] = accessText(responsibility[key]);
      if (!responsibility[key]) continue;
      const user = candidate.users.find(item => item.id === responsibility[key] && item.active);
      if (!user || !serverCan(user, permission)) throw new AccessError(400, "policy_invalid", `${key} must reference an active user with ${permission}.`);
      if (serverRole(user.role).scope !== "all") {
        const assignment = candidate.projectAssignments[projectId] && candidate.projectAssignments[projectId][user.id];
        if (!assignment || assignment.active === false) throw new AccessError(400, "policy_invalid", `${key} must reference a user assigned to the project.`);
      }
    }
  }
  candidate.audit = current.audit.slice();
  candidate.audit.unshift(serverAudit(actor.id, "access.policy.updated", "organisation", "sts", "Cloudflare access policy updated"));
  candidate.audit = candidate.audit.slice(0, 1000);
  return candidate;
}

function validateScopedProjectUpdate(input, current, context) {
  if (!input || typeof input !== "object") throw new AccessError(400, "policy_invalid", "A policy object is required.");
  const merged = JSON.parse(JSON.stringify(current));
  const nextAssignments = input.projectAssignments && typeof input.projectAssignments === "object" ? input.projectAssignments : {};
  const nextResponsibilities = input.projectResponsibilities && typeof input.projectResponsibilities === "object" ? input.projectResponsibilities : {};
  const projectIds = new Set([...Object.keys(nextAssignments), ...Object.keys(nextResponsibilities)]);
  for (const projectId of projectIds) {
    const assignmentsChanged = Object.prototype.hasOwnProperty.call(nextAssignments, projectId) && !samePolicyValue(nextAssignments[projectId], current.projectAssignments[projectId] || {});
    const responsibilitiesChanged = Object.prototype.hasOwnProperty.call(nextResponsibilities, projectId) && !samePolicyValue(nextResponsibilities[projectId], current.projectResponsibilities[projectId] || {});
    if (!assignmentsChanged && !responsibilitiesChanged) continue;
    if (!canAssignServerProject(context, projectId)) throw new AccessError(403, "project_assignment_denied", "This identity cannot assign the requested project.");
    if (assignmentsChanged) merged.projectAssignments[projectId] = JSON.parse(JSON.stringify(nextAssignments[projectId] || {}));
    if (responsibilitiesChanged) merged.projectResponsibilities[projectId] = JSON.parse(JSON.stringify(nextResponsibilities[projectId] || {}));
  }
  return validatePolicyUpdate(merged, current, context.user);
}

async function handleAccessMe(request, env) {
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
  const context = await serverAccessContext(request, env);
  if (!context) return json({ enforcement: "disabled" });
  const projectIds = visibleProjectIds(context);
  const projects = Object.fromEntries(projectIds.filter(id => context.policy.projects[id]).map(id => [id, context.policy.projects[id]]));
  const users = serverCan(context.user, "team.view")
    ? context.policy.users.filter(user => user.active).map(user => ({ id: user.id, name: user.name, email: user.email, role: user.role, active: true }))
    : [{ id: context.user.id, name: context.user.name, email: context.user.email, role: context.user.role, active: true }];
  const assignments = {};
  projectIds.forEach(projectId => {
    const all = context.policy.projectAssignments[projectId] || {};
    assignments[projectId] = serverCan(context.user, "team.view") ? all : (all[context.user.id] ? { [context.user.id]: all[context.user.id] } : {});
  });
  return json({
    enforcement: "cloudflare-rls", verifiedBy: "cloudflare-access", user: context.user,
    permissions: serverPermissions(context.user), users, projects, projectAssignments: assignments,
    projectResponsibilities: Object.fromEntries(projectIds.map(id => [id, context.policy.projectResponsibilities[id] || {}]))
  });
}

async function handleAccessPolicy(request, env) {
  const context = await serverAccessContext(request, env);
  if (!context) throw new AccessError(403, "permission_denied", "A verified identity is required.");
  if (request.method === "GET") {
    if (!serverCan(context.user, "users.manage")) throw new AccessError(403, "permission_denied", "User management permission is required.");
    return json({ policy: context.policy });
  }
  if (request.method === "PUT") {
    let body;
    try { body = await request.json(); } catch (error) { throw new AccessError(400, "invalid_json", "The policy payload must be valid JSON."); }
    const input = body && (body.policy || body);
    let next;
    if (serverCan(context.user, "users.manage") && serverCan(context.user, "roles.manage")) next = validatePolicyUpdate(input, context.policy, context.user);
    else if (serverCan(context.user, "projects.assign")) next = validateScopedProjectUpdate(input, context.policy, context);
    else throw new AccessError(403, "permission_denied", "User, role or project assignment permission is required.");
    await env.GEOFLOW.put(ACCESS_POLICY_KEY, JSON.stringify(next));
    return json({ ok: true, policy: next });
  }
  return json({ error: "method not allowed" }, 405);
}

async function handleProjects(request, env) {
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
  const context = await serverAccessContext(request, env);
  if (!context) return json({ enforcement: "disabled", projects: [] });
  if (!serverCan(context.user, "projects.list")) throw new AccessError(403, "permission_denied", "Project list permission is required.");
  const projects = visibleProjectIds(context).map(projectId => {
    const project = context.policy.projects[projectId];
    const assignment = projectAssignment(context, projectId);
    return {
      id: projectId, name: project.name, number: project.number, recordKey: project.recordKey,
      projectRole: assignment && assignment.projectRole || "", permissions: serverPermissions(context.user)
    };
  });
  return json({ enforcement: "cloudflare-rls", projects });
}

async function listProjectWorkflows(env, projectId) {
  const out = {};
  let cursor;
  do {
    const page = await env.GEOFLOW.list({ prefix: `${ACCESS_WORKFLOW_PREFIX}${projectId}:`, cursor });
    for (const key of page.keys) {
      const raw = await env.GEOFLOW.get(key.name);
      if (!raw) continue;
      try { const workflow = JSON.parse(raw); out[workflow.reportId] = workflow; } catch (error) {}
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out;
}

async function handleReportWorkflows(request, env) {
  const context = await serverAccessContext(request, env);
  if (!context) throw new AccessError(503, "access_enforcement_required", "Server report workflows require access enforcement.");
  const url = new URL(request.url);
  if (request.method === "GET") {
    const project = authoriseProject(context, request, "reports.view", "", { projectId: url.searchParams.get("projectId"), requireRecord: false });
    const reportId = accessText(url.searchParams.get("reportId"));
    if (reportId) {
      const raw = await env.GEOFLOW.get(workflowKey(project.projectId, reportId));
      const workflow = raw ? JSON.parse(raw) : emptyServerWorkflow(project.projectId, reportId);
      if (context.user.role === "client" && (!project.assignment || !(project.assignment.reportIds || []).includes(reportId) || workflow.status !== "Approved")) throw new AccessError(403, "report_access_denied", "This report is not shared with the client identity.");
      return json({ workflow });
    }
    let workflows = await listProjectWorkflows(env, project.projectId);
    if (context.user.role === "client") {
      const allowed = new Set(project.assignment && project.assignment.reportIds || []);
      workflows = Object.fromEntries(Object.entries(workflows).filter(([id, workflow]) => allowed.has(id) && workflow.status === "Approved"));
    }
    return json({ workflows });
  }
  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch (error) { throw new AccessError(400, "invalid_json", "The workflow payload must be valid JSON."); }
    const reportId = accessText(body && body.reportId).slice(0, 120);
    const action = accessText(body && body.action);
    if (!reportId) throw new AccessError(400, "report_required", "A report ID is required.");
    const permission = ["prepare", "submit"].includes(action) ? "reports.prepare" : ["review", "request_changes"].includes(action) ? "reports.review" : action === "approve" ? "reports.approve" : "";
    if (!permission) throw new AccessError(400, "workflow_action_invalid", "The requested report action is invalid.");
    const project = authoriseProject(context, request, permission, "", { projectId: body.projectId, requireRecord: false });
    const responsibility = context.policy.projectResponsibilities[project.projectId] || {};
    const expected = ["review", "request_changes"].includes(action) ? responsibility.reviewerId : action === "approve" ? responsibility.approverId : responsibility.preparerId;
    if (expected && expected !== context.user.id) throw new AccessError(403, "workflow_responsibility_denied", "This report action is assigned to another user.");
    const key = workflowKey(project.projectId, reportId);
    const raw = await env.GEOFLOW.get(key);
    const current = raw ? JSON.parse(raw) : emptyServerWorkflow(project.projectId, reportId);
    const workflow = transitionServerWorkflow(current, action, context.user, body.note);
    await env.GEOFLOW.put(key, JSON.stringify(workflow));
    context.policy.audit.unshift(serverAudit(context.user.id, `report.${action}`, "report", reportId, `${context.user.name} ${action.replace("_", " ")} ${reportId}`, { projectId: project.projectId, status: workflow.status }));
    context.policy.audit = context.policy.audit.slice(0, 1000);
    await env.GEOFLOW.put(ACCESS_POLICY_KEY, JSON.stringify(context.policy));
    return json({ ok: true, workflow });
  }
  return json({ error: "method not allowed" }, 405);
}

async function listAll(env) {
  const out = {};
  let cursor;
  do {
    const page = await env.GEOFLOW.list({ prefix: PREFIX, cursor });
    for (const k of page.keys) {
      const raw = await env.GEOFLOW.get(k.name);
      if (raw) { try { out[k.name.slice(PREFIX.length)] = { rows: JSON.parse(raw) }; } catch (e) {} }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out;
}

async function migrateFromLegacy(env) {
  /* one-time seed: copy everything the old Render backend holds into KV */
  try {
    const res = await fetch(LEGACY_API + "/api/v1/geologger/logs", { signal: AbortSignal.timeout(60000) });
    if (!res.ok) return false;
    const data = await res.json();
    const all = data.boreholes || {};
    for (const [loc, v] of Object.entries(all)) {
      if (v && Array.isArray(v.rows)) await env.GEOFLOW.put(PREFIX + loc, JSON.stringify(v.rows));
    }
    await env.GEOFLOW.put("meta:migrated", new Date().toISOString());
    return true;
  } catch (e) { return false; }
}

async function handleLogs(request, env) {
  const context = accessEnabled(env) ? await serverAccessContext(request, env) : null;
  if (!context && !authorised(request, env)) return json({ error: "invalid api key" }, 401);
  const url = new URL(request.url);

  if (request.method === "GET") {
    if (context) {
      const recordKey = accessText(url.searchParams.get("location") || request.headers.get("X-GeoFlow-Record-Key"));
      authoriseProject(context, request, "field.view", recordKey);
      const raw = await env.GEOFLOW.get(PREFIX + recordKey);
      let rows = [];
      if (raw) { try { rows = JSON.parse(raw); } catch (error) {} }
      return json({ boreholes: raw ? { [recordKey]: { rows } } : {} });
    }
    let all = await listAll(env);
    if (Object.keys(all).length === 0 && !(await env.GEOFLOW.get("meta:migrated"))) {
      await migrateFromLegacy(env);           /* lazy migration, first call only */
      all = await listAll(env);
    }
    return json({ boreholes: all });
  }

  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: "invalid json" }, 400); }
    const loc = body && body.location;
    if (!loc || typeof loc !== "string" || loc.length > 200) return json({ error: "location required" }, 400);
    if (context) authoriseProject(context, request, "field.edit", loc, { projectId: body.projectId });
    const rows = Array.isArray(body.rows) ? body.rows : [];
    await env.GEOFLOW.put(PREFIX + loc, JSON.stringify(rows));
    return json({ ok: true, location: loc, rows: rows.length });
  }

  return json({ error: "method not allowed" }, 405);
}

/* ---- file store: all project documents live in Cloudflare KV ----
   POST /api/v1/files              {project, id?, name, kind, data(dataURL)} → {ok,id}
   GET  /api/v1/files?project=X    → {files:[{id,name,kind,ts,size}]}  (metadata only)
   GET  /api/v1/files?project=X&id=Y → {id,name,kind,ts,data}                     */
const FPREFIX = "file:";

function isReportFile(file) {
  const kind = accessText(file && file.kind).toLowerCase();
  return kind === "report-pdf" || kind.includes("report") || /^report-/.test(accessText(file && file.id));
}

function isLabResultFile(file) {
  const kind = accessText(file && file.kind).toLowerCase();
  return kind === "lab-result" || kind.startsWith("laboratory-result");
}

async function reportVisibleToClient(context, project, reportId, env) {
  if (context.user.role !== "client") return true;
  const allowed = project.assignment && Array.isArray(project.assignment.reportIds) ? project.assignment.reportIds : [];
  if (!allowed.includes(reportId)) return false;
  const raw = await env.GEOFLOW.get(workflowKey(project.projectId, reportId));
  if (!raw) return false;
  try { return JSON.parse(raw).status === "Approved"; }
  catch (error) { return false; }
}

async function fileReadable(context, project, file, env) {
  if (isReportFile(file)) return serverCan(context.user, "reports.view") && await reportVisibleToClient(context, project, file.id, env);
  if (isLabResultFile(file)) return serverCan(context.user, "laboratory.view") || serverCan(context.user, "projects.manage");
  return serverCan(context.user, "projects.manage");
}

async function handleFiles(request, env) {
  const context = accessEnabled(env) ? await serverAccessContext(request, env) : null;
  if (!context && !authorised(request, env)) return json({ error: "invalid api key" }, 401);
  const url = new URL(request.url);
  if (request.method === "GET") {
    const project = url.searchParams.get("project") || "";
    if (!project) return json({ error: "project required" }, 400);
    let projectAccess = null;
    if (context) {
      const permission = serverCan(context.user, "projects.manage") ? "projects.manage" : "reports.view";
      projectAccess = authoriseProject(context, request, permission, project);
    }
    const id = url.searchParams.get("id");
    if (id) {
      const raw = await env.GEOFLOW.get(FPREFIX + project + ":" + id);
      if (!raw) return json({ error: "not found" }, 404);
      const file = JSON.parse(raw);
      if (context && !(await fileReadable(context, projectAccess, file, env))) throw new AccessError(403, "file_access_denied", "This file is not available to the current identity.");
      return json(file);
    }
    const out = []; let cursor;
    do {
      const page = await env.GEOFLOW.list({ prefix: FPREFIX + project + ":", cursor });
      for (const k of page.keys) {
        const raw = await env.GEOFLOW.get(k.name);
        if (raw) { try { const f = JSON.parse(raw);
          if (!context || await fileReadable(context, projectAccess, f, env)) out.push({ id: f.id, name: f.name, kind: f.kind, ts: f.ts, size: (f.data||"").length }); } catch (e) {} }
      }
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    return json({ files: out });
  }
  if (request.method === "POST") {
    let body; try { body = await request.json(); } catch (e) { return json({ error: "invalid json" }, 400); }
    const project = body && body.project, data = body && body.data;
    if (!project || typeof project !== "string") return json({ error: "project required" }, 400);
    if (!data || typeof data !== "string" || data.length > 20_000_000) return json({ error: "data missing or >20MB" }, 400);
    const id = (body.id && String(body.id).slice(0, 80)) || crypto.randomUUID();
    if (context) {
      const reportUpload = isReportFile({ id, kind: body.kind });
      const labUpload = isLabResultFile({ id, kind: body.kind });
      const permission = reportUpload ? "reports.prepare" : labUpload ? "laboratory.manage" : "projects.manage";
      const projectAccess = authoriseProject(context, request, permission, project, { projectId: body.projectId });
      if (reportUpload) {
        const responsibility = context.policy.projectResponsibilities[projectAccess.projectId] || {};
        if (responsibility.preparerId && responsibility.preparerId !== context.user.id) throw new AccessError(403, "workflow_responsibility_denied", "Report generation is assigned to another preparer.");
        const rawWorkflow = await env.GEOFLOW.get(workflowKey(projectAccess.projectId, id));
        const workflow = rawWorkflow ? JSON.parse(rawWorkflow) : emptyServerWorkflow(projectAccess.projectId, id);
        if (!["Draft", "Prepared", "Changes requested"].includes(workflow.status)) throw new AccessError(409, "approved_file_locked", `A ${workflow.status} report file cannot be replaced.`);
      }
    }
    await env.GEOFLOW.put(FPREFIX + project + ":" + id,
      JSON.stringify({ id, name: String(body.name||id).slice(0,180), kind: String(body.kind||"file").slice(0,40),
        ts: new Date().toISOString(), data }));
    return json({ ok: true, id });
  }
  return json({ error: "method not allowed" }, 405);
}

function controlClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function controlId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function controlIsoDate(value) {
  const match = String(value == null ? "" : value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function controlAddBusinessDays(value, count) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  let remaining = Math.max(0, Number(count) || 0);
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}

function controlEmptyState() {
  return { version: 1, revision: 0, projects: {}, updatedAt: "" };
}

function controlNormaliseState(value) {
  const state = value && typeof value === "object" ? controlClone(value) : controlEmptyState();
  state.version = 1;
  state.revision = Number(state.revision) || 0;
  state.projects = state.projects && typeof state.projects === "object" ? state.projects : {};
  state.updatedAt = accessText(state.updatedAt);
  return state;
}

function controlRows(value, maximum) {
  return (Array.isArray(value) ? value : []).filter(row => row && typeof row === "object" && accessText(row.id)).slice(0, maximum || 5000).map(controlClone);
}

function controlNormaliseProject(input, projectId, now) {
  const source = input && typeof input === "object" ? input : {};
  const project = {
    projectId: accessText(projectId || source.projectId).slice(0, 120),
    revision: Number(source.revision) || 0,
    seededAt: accessText(source.seededAt) || now,
    updatedAt: accessText(source.updatedAt) || now
  };
  CONTROL_PROJECT_STORES.forEach(store => { project[store] = controlRows(source[store], store === "activity_history" ? 1000 : 5000); });
  return project;
}

function controlMergeRows(current, incoming) {
  const rows = new Map((Array.isArray(current) ? current : []).map(row => [row.id, row]));
  (Array.isArray(incoming) ? incoming : []).forEach(row => {
    if (!row || !accessText(row.id)) return;
    const existing = rows.get(row.id);
    if (!existing || !existing.updatedAt || !row.updatedAt || String(row.updatedAt) >= String(existing.updatedAt)) rows.set(row.id, controlClone(row));
  });
  return [...rows.values()];
}

function controlSyncStoresForRole(role) {
  if (["director", "engineering_manager", "admin", "project_engineer"].includes(role)) return CONTROL_EVIDENCE_STORES;
  if (role === "field_engineer") return ["field_activities", "boreholes", "samples"];
  if (role === "laboratory_staff") return ["lab_tests"];
  return [];
}

function controlMergeProject(current, incoming, actor, now) {
  if (!current) return controlNormaliseProject(incoming, incoming.projectId, now);
  const next = controlNormaliseProject(current, current.projectId, now);
  const source = controlNormaliseProject(incoming, current.projectId, now);
  const descriptiveFields = [
    "jobNumber", "projectName", "client", "siteAddress", "projectType", "projectManager", "projectManagerId",
    "fieldEngineer", "projectEngineer", "reviewer", "adminCoordinator", "fieldworkStart", "fieldworkDue", "reportDue",
    "riskStatus", "blockingCategory", "blockingReason", "invoiceStatus"
  ];
  if (["director", "admin"].includes(actor.role)) descriptiveFields.push("invoiceNumber", "invoiceAmount", "paymentStatus");
  source.jobs.forEach(incomingJob => {
    const existing = next.jobs.find(job => job.id === incomingJob.id);
    if (!existing) { next.jobs.push(incomingJob); return; }
    descriptiveFields.forEach(field => { if (incomingJob[field] !== undefined && incomingJob[field] !== "") existing[field] = controlClone(incomingJob[field]); });
  });
  controlSyncStoresForRole(actor.role).forEach(store => { next[store] = controlMergeRows(next[store], source[store]); });
  next.updatedAt = now;
  return next;
}

function controlEvent(job, task, actor, action, previousValue, newValue, reason, at) {
  return {
    id: controlId("audit"), jobId: job && job.id || "", taskId: task && task.id || "",
    stageId: task && task.stageId || job && job.currentStageId || "", actorId: actor.id,
    actorName: actor.name || "Current user", actorRole: actor.role, at, action,
    previousValue: accessText(previousValue), newValue: accessText(newValue), reason: accessText(reason)
  };
}

function controlJob(project, jobId) {
  return (project.jobs || []).find(job => job.id === jobId) || (project.jobs || [])[0] || null;
}

function controlNextStage(project, job) {
  const current = CONTROL_STAGE_BY_ID[job.currentStageId];
  if (!current) return null;
  return (project.job_stages || []).filter(record => record.status !== "not_required" && record.status !== "complete"
    && (record.sequence ?? CONTROL_STAGE_BY_ID[record.stageId]?.sequence ?? 999) > current.sequence)
    .sort((left, right) => (left.sequence ?? CONTROL_STAGE_BY_ID[left.stageId]?.sequence ?? 999) - (right.sequence ?? CONTROL_STAGE_BY_ID[right.stageId]?.sequence ?? 999))[0] || null;
}

function controlProjectAllowed(scope, projectId) {
  return Boolean(scope && (scope.allProjects || (scope.projectIds || []).includes(projectId)));
}

function controlIsProjectManager(actor, projectId, job) {
  if (["director", "engineering_manager"].includes(actor.role)) return true;
  if (actor.role !== "project_engineer") return false;
  if ((actor.pmProjectIds || []).includes(projectId)) return true;
  const expectedId = accessText(job && job.projectManagerId);
  if (expectedId && expectedId === actor.id) return true;
  const expectedName = accessText(job && job.projectManager).toLowerCase();
  return Boolean(expectedName && expectedName === accessText(actor.name).toLowerCase());
}

function controlCanComplete(actor, task) {
  if (["director", "engineering_manager"].includes(actor.role)) return true;
  if (actor.role === "project_engineer" && task.ownerRole === "project_engineer") return !task.ownerId || task.ownerId === actor.id;
  if (actor.role === "admin" && task.ownerRole === "admin") return !task.ownerId || task.ownerId === actor.id;
  if (actor.role !== task.ownerRole) return false;
  if (task.ownerId && task.ownerId !== actor.id) return false;
  const ownerName = accessText(task.ownerName).toLowerCase();
  const generic = accessText(CONTROL_STAGE_BY_ID[task.stageId]?.ownerRole).replace(/_/g, " ");
  return !ownerName || ownerName === accessText(actor.name).toLowerCase() || ownerName === generic;
}

function controlCanManageTask(actor, projectId, job, task) {
  if (controlIsProjectManager(actor, projectId, job)) return true;
  return actor.role === "admin" && task && task.ownerRole === "admin";
}

function controlTaskCompletion(project, body, actor, now, options) {
  const task = (project.job_tasks || []).find(item => item.id === accessText(body.taskId));
  const job = task && controlJob(project, task.jobId);
  if (!task || !job) throw new AccessError(404, "workflow_task_not_found", "The workflow task was not found.");
  if (!options?.system && !controlCanComplete(actor, task)) throw new AccessError(403, "workflow_task_denied", "This task is assigned to another role or user.");
  if (task.stageId !== job.currentStageId) throw new AccessError(409, "workflow_stage_mismatch", "Only a task in the current stage can be completed.");
  if (task.status === "complete" || task.completedAt) return { project, job, task, changed: false, events: [] };
  const note = accessText(body.note || options && options.note);
  if (!note) throw new AccessError(400, "completion_note_required", "A completion update is required.");
  if (task.ownerRole === "laboratory_staff" && !options?.system) {
    if (!accessText(body.resultSummary)) throw new AccessError(400, "lab_result_summary_required", "A laboratory result summary is required.");
    if (!accessText(body.resultReference)) throw new AccessError(400, "lab_result_reference_required", "A laboratory certificate or result reference is required.");
  }
  task.status = "complete"; task.progress = 100; task.completedAt = now; task.updatedAt = now;
  task.completedBy = { id: actor.id, name: actor.name, role: actor.role, at: now };
  task.completionNote = note;
  if (task.ownerRole === "laboratory_staff") {
    task.result = {
      summary: accessText(body.resultSummary), reference: accessText(body.resultReference),
      fileId: accessText(body.fileId), fileName: accessText(body.fileName), receivedAt: now
    };
    const resultRecord = {
      id: `${job.id}:lab-result:${task.id}`, jobId: job.id, taskId: task.id, testType: task.title,
      laboratory: actor.name, status: "complete", resultSummary: task.result.summary,
      resultReference: task.result.reference, fileId: task.result.fileId, fileName: task.result.fileName,
      receivedAt: now, createdAt: now, updatedAt: now
    };
    project.lab_tests = controlMergeRows(project.lab_tests, [resultRecord]);
  }
  const events = [controlEvent(job, task, actor, task.ownerRole === "laboratory_staff" ? "laboratory.result.submitted" : "task.completed", "open", "complete", note, now)];
  const required = project.job_tasks.filter(item => item.jobId === job.id && item.stageId === job.currentStageId && item.required !== false && item.status !== "cancelled");
  if (required.length && required.every(item => item.status === "complete" || item.completedAt)) {
    const next = controlNextStage(project, job);
    const handoverEventAt = new Date(new Date(now).getTime() + 1).toISOString();
    job.handoverStatus = "awaiting_assignment"; job.handoverFromStageId = job.currentStageId;
    job.handoverToStageId = next && next.stageId || ""; job.handoverReadyAt = now;
    job.handoverReadyBy = task.completedBy; job.handoverNote = note; job.currentOwnerId = "";
    job.currentOwner = accessText(job.projectManager) || "Project Manager";
    job.nextAction = next ? `Assign ${CONTROL_STAGE_BY_ID[next.stageId].title} handover` : "Confirm workflow closure";
    job.nextActionDue = now.slice(0, 10);
    events.push(controlEvent(job, task, actor, "handover.ready", job.currentStageId, next && next.stageId || "complete", next ? `${CONTROL_STAGE_BY_ID[job.currentStageId].title} is complete and awaits Project Manager assignment` : "Final workflow stage awaits closure", handoverEventAt));
  }
  job.updatedAt = now;
  return { project, job, task, changed: true, events };
}

function controlAssignHandover(project, body, actor, now) {
  const job = controlJob(project, accessText(body.jobId));
  if (!job) throw new AccessError(404, "workflow_job_not_found", "The workflow job was not found.");
  if (!controlIsProjectManager(actor, project.projectId, job)) throw new AccessError(403, "handover_assignment_denied", "Only the Project Manager, Engineering Manager or Director can assign this handover.");
  if (job.handoverStatus !== "awaiting_assignment") throw new AccessError(409, "handover_not_ready", "This job is not awaiting assignment.");
  const current = project.job_stages.find(record => record.stageId === job.currentStageId);
  if (!current) throw new AccessError(409, "workflow_stage_missing", "The current workflow stage is unavailable.");
  const next = controlNextStage(project, job);
  if (next && !accessText(body.ownerName)) throw new AccessError(400, "handover_owner_required", "The next task owner is required.");
  if (next && !controlIsoDate(body.dueDate)) throw new AccessError(400, "handover_due_required", "The next task due date is required.");
  current.status = "complete"; current.completion = 1; current.completedAt = now; current.updatedAt = now;
  let task = null;
  if (next) {
    const definition = CONTROL_STAGE_BY_ID[next.stageId];
    next.status = "active"; next.startedAt = next.startedAt || now; next.updatedAt = now;
    task = project.job_tasks.find(item => item.jobId === job.id && item.stageId === next.stageId && item.status !== "cancelled");
    if (!task) {
      task = { id: controlId("task"), jobId: job.id, stageId: next.stageId, required: true, source: "live_workflow", createdAt: now };
      project.job_tasks.push(task);
    }
    task.ownerId = accessText(body.ownerId); task.ownerName = accessText(body.ownerName); task.ownerRole = definition.ownerRole;
    task.title = accessText(body.title) || definition.action; task.dueDate = controlIsoDate(body.dueDate);
    task.status = "open"; task.progress = 0; task.completedAt = ""; task.updatedAt = now;
    job.currentStageId = next.stageId; job.currentOwnerId = task.ownerId; job.currentOwner = task.ownerName;
    job.nextAction = task.title; job.nextActionDue = task.dueDate; job.stageEnteredAt = now;
  } else {
    job.workflowStatus = "complete"; job.currentOwnerId = ""; job.currentOwner = "";
    job.nextAction = "Workflow complete"; job.nextActionDue = "";
  }
  job.lastHandover = {
    fromStageId: job.handoverFromStageId || current.stageId, toStageId: next && next.stageId || "",
    assignedBy: { id: actor.id, name: actor.name, role: actor.role },
    assignedTo: task ? { id: task.ownerId, name: task.ownerName, role: task.ownerRole } : null, at: now
  };
  job.handoverStatus = ""; job.handoverFromStageId = ""; job.handoverToStageId = "";
  job.handoverReadyAt = ""; job.handoverReadyBy = null; job.handoverNote = ""; job.updatedAt = now;
  const event = controlEvent(job, task, actor, next ? "handover.assigned" : "workflow.closed", current.stageId, next && next.stageId || "complete", next ? `${CONTROL_STAGE_BY_ID[next.stageId].title} assigned to ${task.ownerName}` : "Final workflow stage closed", now);
  return { project, job, task, changed: true, events: [event] };
}

function controlFilteredProject(project, actor) {
  const role = ACCESS_ROLES[actor.role] ? actor.role : "client";
  const limit = CONTROL_STAGE_LIMITS[role] ?? CONTROL_STAGE_LIMITS.client;
  const next = controlNormaliseProject(project, project.projectId, project.updatedAt || new Date().toISOString());
  next.scope = { role, maxStageIndex: limit, truncated: false };
  next.job_stages = next.job_stages.filter(record => (CONTROL_STAGE_BY_ID[record.stageId]?.sequence ?? 999) <= limit);
  next.job_tasks = next.job_tasks.filter(task => {
    if ((CONTROL_STAGE_BY_ID[task.stageId]?.sequence ?? 999) > limit) return false;
    if (role === "client") return false;
    if (role === "field_engineer") return task.ownerRole === "field_engineer" && (!task.ownerId || task.ownerId === actor.id);
    if (role === "laboratory_staff") return task.ownerRole === "laboratory_staff" && (!task.ownerId || task.ownerId === actor.id);
    return true;
  });
  next.jobs = next.jobs.map(job => {
    const copy = controlClone(job); const currentIndex = CONTROL_STAGE_BY_ID[copy.currentStageId]?.sequence ?? 0;
    if (currentIndex > limit) {
      copy.currentStageId = CONTROL_WORKFLOW_STAGES[limit].id; copy.currentOwnerId = "";
      copy.currentOwner = "Higher-level workflow"; copy.nextAction = "Managed at a higher approval level";
      copy.nextActionDue = ""; copy.scopeCapped = true; next.scope.truncated = true;
    }
    if (!["director", "admin"].includes(role)) {
      delete copy.invoiceAmount; delete copy.invoiceNumber; delete copy.paymentStatus;
    }
    return copy;
  });
  if (!["director", "engineering_manager", "admin", "project_engineer"].includes(role)) {
    next.job_assignments = next.job_assignments.filter(item => item.userId === actor.id || accessText(item.userName).toLowerCase() === accessText(actor.name).toLowerCase());
    next.reports = []; next.review_comments = []; next.invoices = [];
  }
  next.activity_history = next.activity_history.filter(event => {
    const sequence = CONTROL_STAGE_BY_ID[event.stageId]?.sequence;
    if (Number.isInteger(sequence) && sequence > limit) return false;
    if (role === "client") return ["report.approve", "report.issued"].includes(event.action);
    if (["field_engineer", "laboratory_staff"].includes(role)) return event.actorId === actor.id || ["handover.ready", "handover.assigned"].includes(event.action);
    return true;
  }).slice(0, 250);
  return next;
}

function controlSnapshotFor(state, attachment) {
  const actor = attachment.actor;
  const projects = Object.values(state.projects).filter(project => controlProjectAllowed(attachment, project.projectId)).map(project => controlFilteredProject(project, actor));
  return { type: "snapshot", revision: state.revision, updatedAt: state.updatedAt, projects };
}

function controlAttachmentFromHeaders(request) {
  let actor = null; let scope = null;
  try { actor = JSON.parse(decodeURIComponent(request.headers.get("X-GeoFlow-Workflow-Actor") || "")); } catch (error) {}
  try { scope = JSON.parse(decodeURIComponent(request.headers.get("X-GeoFlow-Workflow-Scope") || "")); } catch (error) {}
  const role = actor && ACCESS_ROLES[actor.role] ? actor.role : "client";
  return {
    actor: {
      id: accessText(actor && actor.id).slice(0, 120) || "u_unknown",
      name: accessText(actor && actor.name).slice(0, 160) || "Current user",
      role,
      verified: actor && actor.verified === true
    },
    projectIds: Array.isArray(scope && scope.projectIds) ? [...new Set(scope.projectIds.map(accessText).filter(Boolean))].slice(0, 1000) : [],
    pmProjectIds: Array.isArray(scope && scope.pmProjectIds) ? [...new Set(scope.pmProjectIds.map(accessText).filter(Boolean))].slice(0, 1000) : [],
    allProjects: scope && scope.allProjects === true
  };
}

export class WorkflowCoordinator {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async loadState() {
    return controlNormaliseState(await this.ctx.storage.get(CONTROL_STATE_KEY));
  }

  async saveState(state) {
    await this.ctx.storage.put(CONTROL_STATE_KEY, state);
  }

  async fetch(request) {
    const attachment = controlAttachmentFromHeaders(request);
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") return this.openSocket(attachment);
    if (request.method === "GET") return json(controlSnapshotFor(await this.loadState(), attachment));
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
    let operation;
    try { operation = await request.json(); }
    catch (error) { return json({ error: "invalid_json", message: "The live workflow operation must be valid JSON." }, 400); }
    try {
      const result = await this.applyOperation(operation, attachment);
      return json(result);
    } catch (error) {
      return apiFailure(error);
    }
  }

  async openSocket(attachment) {
    const pair = new WebSocketPair();
    const client = pair[0]; const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    server.send(JSON.stringify(controlSnapshotFor(await this.loadState(), attachment)));
    return new Response(null, { status: 101, webSocket: client });
  }

  async applyOperation(operation, attachment) {
    const body = operation && typeof operation === "object" ? operation : {};
    const type = accessText(body.type);
    const requestId = accessText(body.requestId);
    const actor = Object.assign({}, attachment.actor, { pmProjectIds: attachment.pmProjectIds });
    const now = new Date().toISOString(); const state = await this.loadState();
    let changed = false; let result = null;

    if (type === "sync_projects") {
      if (actor.role === "client") throw new AccessError(403, "workflow_sync_denied", "Clients cannot publish internal workflow records.");
      const projections = Array.isArray(body.projects) ? body.projects.slice(0, 250) : [];
      for (const input of projections) {
        const projectId = accessText(input && input.projectId);
        if (!projectId || !controlProjectAllowed(attachment, projectId)) continue;
        const incoming = controlNormaliseProject(input, projectId, now);
        state.projects[projectId] = controlMergeProject(state.projects[projectId], incoming, actor, now);
        state.projects[projectId].revision = (Number(state.projects[projectId].revision) || 0) + 1;
        changed = true;
      }
      result = { synced: projections.length };
    } else {
      const projectId = accessText(body.projectId);
      if (!projectId || !controlProjectAllowed(attachment, projectId)) throw new AccessError(403, "workflow_project_denied", "This identity cannot access the requested project workflow.");
      const project = state.projects[projectId];
      if (!project) throw new AccessError(404, "workflow_project_not_found", "The shared project workflow has not been initialised.");
      let transition;
      if (type === "complete_task") {
        transition = controlTaskCompletion(project, body, actor, now);
      } else if (type === "assign_handover") {
        transition = controlAssignHandover(project, body, actor, now);
      } else if (type === "assign_task") {
        const task = project.job_tasks.find(item => item.id === accessText(body.taskId)); const job = task && controlJob(project, task.jobId);
        if (!task || !job) throw new AccessError(404, "workflow_task_not_found", "The workflow task was not found.");
        if (!controlCanManageTask(actor, projectId, job, task)) throw new AccessError(403, "task_assignment_denied", "This identity cannot assign the requested task.");
        if (!accessText(body.ownerName) || !controlIsoDate(body.dueDate)) throw new AccessError(400, "task_assignment_incomplete", "Owner and due date are required.");
        const previous = `${task.ownerName || task.ownerRole} / ${task.dueDate || "no due date"}`;
        task.ownerId = accessText(body.ownerId); task.ownerName = accessText(body.ownerName);
        task.dueDate = controlIsoDate(body.dueDate); task.title = accessText(body.title) || task.title; task.updatedAt = now;
        if (task.stageId === job.currentStageId && task.status !== "complete") {
          job.currentOwnerId = task.ownerId; job.currentOwner = task.ownerName; job.nextAction = task.title; job.nextActionDue = task.dueDate; job.updatedAt = now;
        }
        transition = { changed: true, job, task, events: [controlEvent(job, task, actor, "task.assigned", previous, `${task.ownerName} / ${task.dueDate}`, `Task assigned to ${task.ownerName}`, now)] };
      } else if (type === "add_task") {
        const job = controlJob(project, accessText(body.jobId));
        if (!job || !controlIsProjectManager(actor, projectId, job)) throw new AccessError(403, "task_creation_denied", "Only the Project Manager, Engineering Manager or Director can add workflow tasks.");
        const stage = CONTROL_STAGE_BY_ID[job.currentStageId];
        if (!accessText(body.title) || !accessText(body.ownerName) || !controlIsoDate(body.dueDate)) throw new AccessError(400, "task_incomplete", "Task action, owner and due date are required.");
        const task = {
          id: controlId("task"), jobId: job.id, stageId: job.currentStageId, title: accessText(body.title),
          ownerId: accessText(body.ownerId), ownerName: accessText(body.ownerName), ownerRole: stage.ownerRole,
          dueDate: controlIsoDate(body.dueDate), status: "open", progress: 0, required: body.required !== false,
          source: "live_workflow", createdAt: now, updatedAt: now
        };
        project.job_tasks.push(task);
        transition = { changed: true, job, task, events: [controlEvent(job, task, actor, "task.created", "", task.ownerName, task.title, now)] };
      } else if (type === "reopen_task") {
        const task = project.job_tasks.find(item => item.id === accessText(body.taskId)); const job = task && controlJob(project, task.jobId);
        if (!task || !job) throw new AccessError(404, "workflow_task_not_found", "The workflow task was not found.");
        if (!controlCanManageTask(actor, projectId, job, task)) throw new AccessError(403, "task_reopen_denied", "This identity cannot reopen the requested task.");
        task.status = "open"; task.progress = 0; task.completedAt = ""; task.completedBy = null; task.updatedAt = now;
        job.handoverStatus = ""; job.handoverFromStageId = ""; job.handoverToStageId = ""; job.handoverReadyAt = ""; job.updatedAt = now;
        transition = { changed: true, job, task, events: [controlEvent(job, task, actor, "task.reopened", "complete", "open", accessText(body.note) || "Task reopened for correction", now)] };
      } else if (type === "report_event") {
        const job = controlJob(project, accessText(body.jobId));
        if (!job) throw new AccessError(404, "workflow_job_not_found", "The workflow job was not found.");
        const action = accessText(body.action); const allowed = ["prepare", "submit", "review", "request_changes", "approve"];
        if (!allowed.includes(action)) throw new AccessError(400, "report_event_invalid", "The report workflow event is invalid.");
        if (["prepare", "submit"].includes(action) && !["project_engineer", "engineering_manager", "director"].includes(actor.role)) throw new AccessError(403, "report_event_denied", "This report preparation event is outside the role hierarchy.");
        if (["review", "request_changes", "approve"].includes(action) && !["engineering_manager", "director"].includes(actor.role)) throw new AccessError(403, "report_event_denied", "This report review event is outside the role hierarchy.");
        const reportId = accessText(body.reportId); const report = {
          id: reportId || controlId("report"), jobId: job.id, title: accessText(body.title) || "Geotechnical report",
          version: accessText(body.revision), status: accessText(body.status) || action, updatedAt: now, createdAt: now
        };
        project.reports = controlMergeRows(project.reports, [report]);
        const completionStage = action === "submit" ? "report_drafting" : action === "approve" ? "technical_review" : "";
        if (completionStage && job.currentStageId === completionStage) {
          let task = project.job_tasks.find(item => item.jobId === job.id && item.stageId === completionStage && item.status !== "cancelled" && item.status !== "complete");
          if (!task) {
            const definition = CONTROL_STAGE_BY_ID[completionStage];
            task = { id: controlId("task"), jobId: job.id, stageId: completionStage, title: definition.action, ownerId: actor.id, ownerName: actor.name, ownerRole: definition.ownerRole, dueDate: now.slice(0, 10), status: "open", progress: 0, required: true, source: "report_workflow", createdAt: now, updatedAt: now };
            project.job_tasks.push(task);
          }
          transition = controlTaskCompletion(project, { taskId: task.id, note: `${report.title} ${action.replace("_", " ")} as ${report.version || "current revision"}` }, actor, now, { system: true, note: `${report.title} ${action.replace("_", " ")}` });
        } else {
          transition = { changed: true, job, task: null, events: [controlEvent(job, null, actor, `report.${action}`, "", report.status, `${report.title} ${action.replace("_", " ")}`, now)] };
        }
      } else {
        throw new AccessError(400, "workflow_operation_invalid", "The requested live workflow operation is invalid.");
      }
      if (transition.changed) {
        project.activity_history = [...transition.events].reverse().concat(project.activity_history || []).slice(0, 1000);
        project.revision = (Number(project.revision) || 0) + 1; project.updatedAt = now;
        changed = true;
      }
      result = transition;
    }

    if (changed) {
      state.revision += 1; state.updatedAt = now; await this.saveState(state); await this.broadcast(state);
    }
    return { type: "operation_result", ok: true, requestId, result: result && { changed: result.changed !== false, jobId: result.job && result.job.id, taskId: result.task && result.task.id }, snapshot: controlSnapshotFor(state, attachment) };
  }

  async broadcast(state) {
    const sockets = this.ctx.getWebSockets ? this.ctx.getWebSockets() : [];
    for (const socket of sockets) {
      try { socket.send(JSON.stringify(controlSnapshotFor(state, socket.deserializeAttachment()))); }
      catch (error) {}
    }
  }

  async webSocketMessage(socket, message) {
    let operation;
    try { operation = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message)); }
    catch (error) { socket.send(JSON.stringify({ type: "operation_result", ok: false, error: "invalid_json", message: "The live workflow message must be valid JSON." })); return; }
    try { socket.send(JSON.stringify(await this.applyOperation(operation, socket.deserializeAttachment()))); }
    catch (error) {
      socket.send(JSON.stringify({ type: "operation_result", ok: false, requestId: operation && operation.requestId || "", error: error.code || "internal_error", message: error instanceof AccessError ? error.message : "The live workflow operation failed." }));
    }
  }

  webSocketClose(socket, code, reason) {
    try { socket.close(code, reason); } catch (error) {}
  }

  webSocketError(socket) {
    try { socket.close(1011, "Workflow connection error"); } catch (error) {}
  }
}

function controlLocalContext(request) {
  const url = new URL(request.url);
  const role = ACCESS_ROLES[url.searchParams.get("role")] ? url.searchParams.get("role") : "client";
  const projectIds = [...new Set((url.searchParams.get("projects") || "").split(",").map(accessText).filter(Boolean))].slice(0, 1000);
  const pmProjectIds = [...new Set((url.searchParams.get("pm") || "").split(",").map(accessText).filter(Boolean))].slice(0, 1000);
  return {
    actor: { id: accessText(url.searchParams.get("user")).slice(0, 120) || "u_local", name: accessText(url.searchParams.get("name")).slice(0, 160) || "Local user", role, verified: false },
    projectIds, pmProjectIds, allProjects: ["director", "engineering_manager"].includes(role)
  };
}

async function controlRequestContext(request, env) {
  const context = await serverAccessContext(request, env);
  if (!context) return controlLocalContext(request);
  const projectIds = visibleProjectIds(context);
  const pmProjectIds = projectIds.filter(projectId => /project manager/i.test(accessText(projectAssignment(context, projectId)?.projectRole)));
  return {
    actor: { id: context.user.id, name: context.user.name, role: context.user.role, verified: true },
    projectIds, pmProjectIds, allProjects: false
  };
}

async function handleControlLive(request, env) {
  if (!env.WORKFLOW) throw new AccessError(503, "workflow_binding_missing", "The Cloudflare live workflow binding is unavailable.");
  const attachment = await controlRequestContext(request, env);
  const id = env.WORKFLOW.idFromName("sts-geoflow-company");
  const stub = env.WORKFLOW.get(id);
  const headers = new Headers(request.headers);
  headers.set("X-GeoFlow-Workflow-Actor", encodeURIComponent(JSON.stringify(attachment.actor)));
  headers.set("X-GeoFlow-Workflow-Scope", encodeURIComponent(JSON.stringify({ projectIds: attachment.projectIds, pmProjectIds: attachment.pmProjectIds, allProjects: attachment.allProjects })));
  const upgrade = request.headers.get("Upgrade")?.toLowerCase() === "websocket";
  const internal = new Request(upgrade ? "https://workflow.internal/socket" : "https://workflow.internal/state", {
    method: request.method, headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body
  });
  return stub.fetch(internal);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/") && request.method === "OPTIONS") return handlePreflight(request);
    if (url.pathname === "/api/v1/access/me") return withCors(await safely(() => handleAccessMe(request, env)), request);
    if (url.pathname === "/api/v1/access/policy") return withCors(await safely(() => handleAccessPolicy(request, env)), request);
    if (url.pathname === "/api/v1/projects") return withCors(await safely(() => handleProjects(request, env)), request);
    if (url.pathname === "/api/v1/reports/workflows") return withCors(await safely(() => handleReportWorkflows(request, env)), request);
    if (url.pathname === "/api/v1/control/live") {
      const response = await safely(() => handleControlLive(request, env));
      return request.headers.get("Upgrade")?.toLowerCase() === "websocket" ? response : withCors(response, request);
    }
    if (url.pathname === "/api/v1/geologger/logs") return withCors(await safely(() => handleLogs(request, env)), request);
    if (url.pathname === "/api/v1/files") return withCors(await safely(() => handleFiles(request, env)), request);

    /* any other legacy /api path still proxies to the old backend (vision pipeline etc.) */
    if (url.pathname.startsWith("/api/")) {
      if (accessEnabled(env)) {
        const gate = await safely(async () => {
          const context = await serverAccessContext(request, env);
          const permission = ["GET", "HEAD"].includes(request.method) ? "projects.view" : "field.edit";
          authoriseProject(context, request, permission, request.headers.get("X-GeoFlow-Record-Key"));
          return null;
        });
        if (gate) return withCors(gate, request);
      }
      const init = {
        method: request.method,
        headers: request.headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "follow"
      };
      try { return withCors(await fetch(LEGACY_API + url.pathname + url.search, init), request); }
      catch (e) {
        return withCors(json({ error: "backend unreachable", detail: String(e) }, 502), request);
      }
    }

    return env.ASSETS.fetch(request);
  }
};

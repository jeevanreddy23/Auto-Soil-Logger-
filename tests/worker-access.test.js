const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const TEAM_DOMAIN = "https://sts-test.cloudflareaccess.com";
const POLICY_AUD = "sts-geoflow-test-audience";
const KID = "sts-test-key";

let worker;
let WorkflowCoordinator;
let keyPair;
let publicJwk;

function userId(email) {
  return `u_${email.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 46)}`;
}

function base64Url(value) {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
  return Buffer.from(bytes).toString("base64url");
}

async function token(email, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url({ alg: "RS256", kid: KID, typ: "JWT" });
  const payload = base64Url(Object.assign({
    aud: [POLICY_AUD], email, exp: now + 600, iat: now - 5, nbf: now - 5,
    iss: TEAM_DOMAIN, type: "app", sub: `subject-${userId(email)}`
  }, overrides));
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keyPair.privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

function kvStore(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async get(key) { return values.has(key) ? values.get(key) : null; },
    async put(key, value) { values.set(key, String(value)); },
    async list({ prefix = "" } = {}) {
      return { keys: [...values.keys()].filter(key => key.startsWith(prefix)).sort().map(name => ({ name })), list_complete: true };
    }
  };
}

function environment(store) {
  return {
    ACCESS_ENFORCEMENT: "enabled",
    ACCESS_BOOTSTRAP_DIRECTOR_EMAIL: "director@sts.test",
    TEAM_DOMAIN,
    POLICY_AUD,
    ACCESS_JWKS: JSON.stringify({ keys: [publicJwk] }),
    GEOFLOW: store,
    ASSETS: { fetch: async () => new Response("asset") }
  };
}

async function request(env, pathname, email, options = {}) {
  const headers = new Headers(options.headers || {});
  if (email) headers.set("Cf-Access-Jwt-Assertion", await token(email, options.claims));
  if (options.projectId) headers.set("X-GeoFlow-Project", options.projectId);
  if (options.recordKey) headers.set("X-GeoFlow-Record-Key", options.recordKey);
  let body;
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }
  return worker.fetch(new Request(`https://example.workers.dev${pathname}`, {
    method: options.method || "GET", headers, body
  }), env);
}

test.before(async () => {
  const source = fs.readFileSync(path.join(__dirname, "../worker.js"), "utf8");
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  worker = module.default;
  WorkflowCoordinator = module.WorkflowCoordinator;
  keyPair = await crypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"
  }, true, ["sign", "verify"]);
  publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  Object.assign(publicJwk, { kid: KID, alg: "RS256", use: "sig" });
});

function workflowContext() {
  const values = new Map();
  return {
    values,
    storage: {
      async get(key) { return values.get(key); },
      async put(key, value) { values.set(key, structuredClone(value)); }
    },
    acceptWebSocket() {},
    getWebSockets() { return []; }
  };
}

function workflowRequest(coordinator, actor, scope, body) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "X-GeoFlow-Workflow-Actor": encodeURIComponent(JSON.stringify(actor)),
    "X-GeoFlow-Workflow-Scope": encodeURIComponent(JSON.stringify(scope))
  });
  return coordinator.fetch(new Request("https://workflow.internal/state", {
    method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined
  }));
}

function workflowProjection(projectId, stageId, ownerRole) {
  const stages = [
    "job_created", "scope_reviewed", "fieldwork_planned", "fieldwork_in_progress", "fieldwork_completed",
    "logs_in_progress", "logs_reviewed", "lab_results_pending", "engineering_assessment", "report_drafting",
    "technical_review", "client_follow_up", "report_issued", "invoice_requested", "invoice_issued",
    "payment_follow_up", "job_closed"
  ];
  const current = stages.indexOf(stageId);
  const jobId = `job-${projectId}`;
  return {
    projectId,
    jobs: [{ id: jobId, projectId, jobNumber: projectId.toUpperCase(), projectName: "Workflow Project", projectManager: "Priya PM", currentStageId: stageId, currentOwner: "Assigned owner", nextAction: "Complete work", nextActionDue: "2026-07-22", updatedAt: "2026-07-18T00:00:00.000Z" }],
    job_stages: stages.map((id, sequence) => ({ id: `${jobId}:${id}`, jobId, stageId: id, sequence, status: sequence < current ? "complete" : sequence === current ? "active" : "pending", completion: sequence < current ? 1 : 0, updatedAt: "2026-07-18T00:00:00.000Z" })),
    job_tasks: [{ id: `task-${projectId}`, jobId, stageId, title: "Complete work", ownerId: "", ownerName: ownerRole === "field_engineer" ? "Faye Field" : ownerRole === "laboratory_staff" ? "Lena Lab" : "Priya PM", ownerRole, dueDate: "2026-07-22", status: "open", progress: 0, required: true, updatedAt: "2026-07-18T00:00:00.000Z" }],
    job_assignments: [], field_activities: [], boreholes: [], samples: [], lab_tests: [], reports: [], review_comments: [], invoices: [], activity_history: []
  };
}

test("live workflow pauses field completion for PM assignment and broadcasts an auditable transition", async () => {
  const context = workflowContext();
  const coordinator = new WorkflowCoordinator(context, {});
  const director = { id: "u_director", name: "Dina Director", role: "director", verified: true };
  const all = { allProjects: true, projectIds: [], pmProjectIds: [] };
  let response = await workflowRequest(coordinator, director, all, { type: "sync_projects", requestId: "seed", projects: [workflowProjection("p_live", "fieldwork_in_progress", "field_engineer")] });
  assert.equal(response.status, 200, await response.text());

  const field = { id: "u_field", name: "Faye Field", role: "field_engineer", verified: true };
  const assigned = { allProjects: false, projectIds: ["p_live"], pmProjectIds: [] };
  response = await workflowRequest(coordinator, field, assigned, { type: "complete_task", requestId: "complete", projectId: "p_live", taskId: "task-p_live", note: "Drilling and field records complete." });
  let payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.snapshot.projects[0].jobs[0].handoverStatus, "awaiting_assignment");
  assert.equal(payload.snapshot.projects[0].jobs[0].currentStageId, "fieldwork_in_progress");
  assert.equal(payload.snapshot.projects[0].activity_history[0].action, "handover.ready");

  const pm = { id: "u_pm", name: "Priya PM", role: "project_engineer", verified: true };
  response = await workflowRequest(coordinator, pm, { allProjects: false, projectIds: ["p_live"], pmProjectIds: ["p_live"] }, {
    type: "assign_handover", requestId: "assign", projectId: "p_live", jobId: "job-p_live",
    ownerId: "u_field", ownerName: "Faye Field", dueDate: "2026-07-23"
  });
  payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.snapshot.projects[0].jobs[0].currentStageId, "fieldwork_completed");
  assert.equal(payload.snapshot.projects[0].job_tasks.find(task => task.stageId === "fieldwork_completed").ownerRole, "field_engineer");
  assert.equal(payload.snapshot.projects[0].activity_history[0].action, "handover.assigned");
});

test("live hierarchy caps project architecture and laboratory staff must submit result evidence", async () => {
  const coordinator = new WorkflowCoordinator(workflowContext(), {});
  const director = { id: "u_director", name: "Dina Director", role: "director", verified: true };
  const all = { allProjects: true, projectIds: [], pmProjectIds: [] };
  let response = await workflowRequest(coordinator, director, all, { type: "sync_projects", projects: [
    workflowProjection("p_lab", "lab_results_pending", "laboratory_staff"),
    workflowProjection("p_commercial", "invoice_issued", "admin")
  ] });
  assert.equal(response.status, 200, await response.text());

  const projectEngineer = { id: "u_project", name: "Priya Project", role: "project_engineer", verified: true };
  response = await workflowRequest(coordinator, projectEngineer, { allProjects: false, projectIds: ["p_commercial"], pmProjectIds: [] });
  let payload = await response.json();
  const scoped = payload.projects[0];
  assert.equal(scoped.scope.truncated, true);
  assert.equal(scoped.jobs[0].currentStageId, "technical_review");
  assert.equal(scoped.job_stages.length, 11);
  assert.equal("invoiceAmount" in scoped.jobs[0], false);

  const lab = { id: "u_lab", name: "Lena Lab", role: "laboratory_staff", verified: true };
  const labScope = { allProjects: false, projectIds: ["p_lab"], pmProjectIds: [] };
  response = await workflowRequest(coordinator, lab, labScope, { type: "complete_task", projectId: "p_lab", taskId: "task-p_lab", note: "Results received." });
  payload = await response.json();
  assert.equal(response.status, 400);
  assert.equal(payload.error, "lab_result_summary_required");

  response = await workflowRequest(coordinator, lab, labScope, {
    type: "complete_task", projectId: "p_lab", taskId: "task-p_lab", note: "Results checked and issued.",
    resultSummary: "PI 18%, CBR 7%", resultReference: "ALS-260718-44", fileId: "lab-44", fileName: "ALS-260718-44.pdf"
  });
  payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.snapshot.projects[0].jobs[0].handoverStatus, "awaiting_assignment");
  assert.equal(payload.snapshot.projects[0].lab_tests[0].resultReference, "ALS-260718-44");
  assert.equal(payload.snapshot.projects[0].job_tasks[0].result.fileName, "ALS-260718-44.pdf");
});

test("requires a valid Cloudflare Access JWT before reading protected data", async () => {
  const env = environment(kvStore());
  let response = await request(env, "/api/v1/access/me", "");
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "missing_access_token");

  response = await request(env, "/api/v1/access/me", "director@sts.test", { claims: { aud: ["wrong-audience"] } });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "invalid_access_token");
});

test("enforces project record isolation and independent report approval", async () => {
  const store = kvStore({
    "log:__project_p_1__": JSON.stringify([{ project: "p_1", secret: "project-one" }]),
    "log:__project_p_2__": JSON.stringify([{ project: "p_2", secret: "project-two" }]),
    "file:__project_p_1__:report-BH01": JSON.stringify({ id: "report-BH01", name: "log-BH01.pdf", kind: "report-pdf", ts: new Date().toISOString(), data: "data:application/pdf;base64,JVBERi0=" }),
    "file:__project_p_1__:report-BH02": JSON.stringify({ id: "report-BH02", name: "log-BH02.pdf", kind: "report-pdf", ts: new Date().toISOString(), data: "data:application/pdf;base64,JVBERi0=" })
  });
  const env = environment(store);
  const emails = {
    director: "director@sts.test", manager: "manager@sts.test", project: "project@sts.test",
    field: "field@sts.test", client: "client@example.test", admin: "admin@sts.test"
  };
  const ids = Object.fromEntries(Object.entries(emails).map(([key, email]) => [key, userId(email)]));

  let response = await request(env, "/api/v1/access/me", emails.director);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.role, "director");

  const policy = {
    users: [
      { id: ids.director, name: "Dina Director", email: emails.director, role: "director", active: true },
      { id: ids.manager, name: "Marcus Manager", email: emails.manager, role: "engineering_manager", active: true },
      { id: ids.project, name: "Priya Project", email: emails.project, role: "project_engineer", active: true },
      { id: ids.field, name: "Faye Field", email: emails.field, role: "field_engineer", active: true },
      { id: ids.client, name: "Chris Client", email: emails.client, role: "client", active: true },
      { id: ids.admin, name: "Alex Admin", email: emails.admin, role: "admin", active: true }
    ],
    projects: {
      p_1: { name: "Project One", number: "STS-001", recordKey: "__project_p_1__" },
      p_2: { name: "Project Two", number: "STS-002", recordKey: "__project_p_2__" }
    },
    projectAssignments: {
      p_1: {
        [ids.project]: { active: true, projectRole: "Report preparer" },
        [ids.field]: { active: true, projectRole: "Field delivery" },
        [ids.client]: { active: true, projectRole: "Client viewer", reportIds: ["report-BH01"] }
      }
    },
    projectResponsibilities: {
      p_1: { preparerId: ids.project, reviewerId: ids.manager, approverId: ids.director }
    },
    audit: []
  };
  response = await request(env, "/api/v1/access/policy", emails.director, { method: "PUT", body: { policy } });
  assert.equal(response.status, 200, await response.text());

  response = await request(env, "/api/v1/access/me", emails.manager);
  assert.equal(response.status, 200);
  const managerView = await response.json();
  managerView.projectAssignments.p_1[ids.field].projectRole = "Field lead";
  response = await request(env, "/api/v1/access/policy", emails.manager, {
    method: "PUT", body: { policy: managerView }
  });
  const managerUpdate = await response.json();
  assert.equal(response.status, 200, JSON.stringify(managerUpdate));
  assert.equal(managerUpdate.policy.projectAssignments.p_1[ids.field].projectRole, "Field lead");

  response = await request(env, "/api/v1/access/policy", emails.admin);
  assert.equal(response.status, 200);
  const adminPolicy = (await response.json()).policy;
  adminPolicy.users.find(user => user.id === ids.director).name = "Hijacked Director";
  response = await request(env, "/api/v1/access/policy", emails.admin, { method: "PUT", body: { policy: adminPolicy } });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "role_escalation_denied");

  response = await request(env, "/api/v1/access/policy", emails.admin);
  const selfEscalation = (await response.json()).policy;
  selfEscalation.users.find(user => user.id === ids.admin).permissionAllow = ["reports.approve"];
  response = await request(env, "/api/v1/access/policy", emails.admin, { method: "PUT", body: { policy: selfEscalation } });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "role_escalation_denied");

  response = await request(env, "/api/v1/geologger/logs", emails.field, { projectId: "p_1", recordKey: "__project_p_1__" });
  assert.equal(response.status, 200);
  let payload = await response.json();
  assert.deepEqual(Object.keys(payload.boreholes), ["__project_p_1__"]);
  assert.equal(payload.boreholes.__project_p_1__.rows[0].secret, "project-one");

  response = await request(env, "/api/v1/geologger/logs", emails.field, { projectId: "p_1", recordKey: "__project_p_2__" });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "record_access_denied");

  response = await request(env, "/api/v1/geologger/logs", emails.client, { projectId: "p_1", recordKey: "__project_p_1__" });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "permission_denied");

  const workflowPath = "/api/v1/reports/workflows";
  const transition = (email, action, extra = {}) => request(env, workflowPath, email, {
    method: "POST", projectId: "p_1", body: Object.assign({ projectId: "p_1", reportId: "report-BH01", action }, extra)
  });

  response = await transition(emails.project, "prepare");
  assert.equal(response.status, 200);
  response = await transition(emails.project, "submit");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).workflow.status, "In review");

  response = await transition(emails.project, "review");
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "workflow_responsibility_denied");

  response = await transition(emails.manager, "review");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).workflow.status, "Reviewed");

  response = await transition(emails.manager, "approve");
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "workflow_responsibility_denied");

  response = await transition(emails.director, "approve");
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.workflow.status, "Approved");
  assert.equal(payload.workflow.preparedBy.id, ids.project);
  assert.equal(payload.workflow.reviewedBy.id, ids.manager);
  assert.equal(payload.workflow.approvedBy.id, ids.director);

  response = await request(env, "/api/v1/files", emails.project, {
    method: "POST", projectId: "p_1", recordKey: "__project_p_1__",
    body: { project: "__project_p_1__", id: "report-BH01", kind: "report-pdf", name: "replacement.pdf", data: "data:application/pdf;base64,VEFNUEVSRUQ=" }
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "approved_file_locked");

  response = await request(env, "/api/v1/files?project=__project_p_1__&id=report-BH01", emails.client, { projectId: "p_1", recordKey: "__project_p_1__" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, "report-BH01");

  response = await request(env, "/api/v1/files?project=__project_p_1__&id=report-BH02", emails.client, { projectId: "p_1", recordKey: "__project_p_1__" });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "file_access_denied");
});

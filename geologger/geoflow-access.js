(function (root, factory) {
  const api = factory(root && root.GeoFlowAccessCore, root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.GeoFlowAccess = api;
    if (root.document) api.install();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (AccessCore, root) {
  "use strict";

  if (!AccessCore) throw new Error("GeoFlowAccess requires GeoFlowAccessCore");

  const STORAGE_KEY = "sts-geoflow-access-v1";
  const PROJECT_ROLE_OPTIONS = ["Project manager", "Report preparer", "Independent reviewer", "Approver", "Field delivery", "Laboratory", "Client viewer"];
  let policy = null;
  let applying = false;
  let scheduled = false;
  let observer = null;
  let serverConnected = false;
  let serverSaveTimer = null;
  let serverSaving = false;
  let serverSavePending = false;

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function text(value) { return AccessCore.text(value); }
  function appState() {
    try { return typeof S !== "undefined" ? S : { project: {}, boreholes: [], logs: {} }; }
    catch (error) { return { project: {}, boreholes: [], logs: {} }; }
  }
  function projectRegistry() {
    try { return typeof PJ !== "undefined" ? PJ : JSON.parse(localStorage.getItem("geoflow-projects") || "{}"); }
    catch (error) { return { activePid: "", projects: [] }; }
  }
  function activeProjectId() { return text(projectRegistry().activePid); }
  function activeProject() {
    const registry = projectRegistry();
    return (registry.projects || []).find((project) => project.pid === registry.activePid) || null;
  }
  function projectRecordKey(project) {
    if (project && text(project.syncKey)) return text(project.syncKey);
    try { return typeof pjSyncKey === "function" && project && project.pid === activeProjectId() ? text(pjSyncKey()) : `__project_${text(project && project.pid)}__`; }
    catch (error) { return `__project_${text(project && project.pid)}__`; }
  }
  function registerKnownProjects(state) {
    state.projects = state.projects && typeof state.projects === "object" ? state.projects : {};
    (projectRegistry().projects || []).forEach((project) => {
      if (!project || !text(project.pid)) return;
      state.projects[project.pid] = Object.assign({}, state.projects[project.pid], {
        id: project.pid, name: text(project.name), number: text(project.number), recordKey: projectRecordKey(project)
      });
    });
    return state;
  }
  function seedIdentity() {
    const source = appState();
    const name = text(source.project.approvedBy || source.project.checkedBy || source.project.loggedBy) || "STS Director";
    const emailBase = name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "director";
    return { name, email: `${emailBase}@sts.local` };
  }
  function loadPolicy() {
    if (policy) return policy;
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (error) { stored = null; }
    policy = registerKnownProjects(AccessCore.normaliseAccessState(stored, seedIdentity()));
    policy.projectResponsibilities = policy.projectResponsibilities && typeof policy.projectResponsibilities === "object" ? policy.projectResponsibilities : {};
    savePolicy(false);
    return policy;
  }
  function savePolicy(refresh) {
    if (!policy) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(policy));
    const actor = AccessCore.currentUser(policy);
    if (serverConnected && policy.enforcement === "cloudflare-rls" && (AccessCore.hasPermission(actor, "users.manage") || AccessCore.hasPermission(actor, "projects.assign"))) queueServerPolicySave();
    if (refresh !== false) scheduleApply();
  }
  function requestHeaders() {
    try { return typeof syncHeaders === "function" ? syncHeaders() : { "Content-Type": "application/json" }; }
    catch (error) { return { "Content-Type": "application/json" }; }
  }
  function apiMessage(payload, fallback) {
    return text(payload && (payload.message || payload.error)) || fallback;
  }
  function policyForServer() {
    const out = JSON.parse(JSON.stringify(registerKnownProjects(loadPolicy())));
    delete out.currentUserId;
    delete out.previewReturnUserId;
    return out;
  }
  function queueServerPolicySave() {
    serverSavePending = true;
    clearTimeout(serverSaveTimer);
    serverSaveTimer = setTimeout(syncServerPolicy, 350);
  }
  async function syncServerPolicy() {
    if (!serverConnected) return;
    if (serverSaving) { queueServerPolicySave(); return; }
    serverSavePending = false;
    serverSaving = true;
    try {
      const response = await fetch("/api/v1/access/policy", { method: "PUT", headers: requestHeaders(), body: JSON.stringify({ policy: policyForServer() }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiMessage(payload, `Server policy save failed (${response.status}).`));
      const identityEmail = currentUser() && currentUser().email;
      policy = AccessCore.normaliseAccessState(payload.policy, seedIdentity());
      policy.enforcement = "cloudflare-rls";
      policy.currentUserId = policy.users.find((user) => user.email === identityEmail)?.id || policy.users[0]?.id || "";
      localStorage.setItem(STORAGE_KEY, JSON.stringify(policy));
      scheduleApply();
    } catch (error) {
      notify(`Access policy remains local: ${error.message}`, "error");
    } finally {
      serverSaving = false;
      if (serverSavePending) queueServerPolicySave();
    }
  }
  function currentUser() { return AccessCore.currentUser(loadPolicy()); }
  function currentRole() { return AccessCore.roleDefinition(currentUser() && currentUser().role); }
  function can(permission, projectId) { return AccessCore.can(loadPolicy(), permission, { user: currentUser(), projectId: projectId == null ? activeProjectId() : projectId }); }
  function canAccessProject(projectId) { return AccessCore.canAccessProject(loadPolicy(), currentUser(), projectId); }

  function upsertPortalClient(input) {
    const actor = currentUser(); const data = input || {};
    if (!AccessCore.can(loadPolicy(), "users.manage", { user: actor })) throw new Error("User management permission is required.");
    const email = text(data.email).toLowerCase();
    const existing = loadPolicy().users.find((user) => user.email === email);
    if (existing && existing.role !== "client") throw new Error("That email belongs to an internal STS user and cannot become a client login.");
    const result = AccessCore.upsertUser(loadPolicy(), { id: existing && existing.id, name: data.name, email, role: "client", active: true }, actor);
    policy = result.state;
    (Array.isArray(data.projects) ? data.projects : []).forEach((project) => {
      const projectId = text(project && project.id);
      if (!projectId) return;
      policy.projects[projectId] = Object.assign({}, policy.projects[projectId], {
        id: projectId, name: text(project.name), number: text(project.number), recordKey: text(project.recordKey) || `__project_${projectId}__`
      });
      policy = AccessCore.setProjectAssignment(policy, projectId, result.user.id, project.assigned !== false, actor, "Client viewer");
    });
    savePolicy();
    return result.user;
  }
  function tabPermission(tab) { return AccessCore.TAB_PERMISSIONS[tab] || "projects.view"; }
  function canOpenTab(tab) {
    if (tab === "projects") return can("projects.list", "");
    const projectId = activeProjectId();
    return can(tabPermission(tab), projectId);
  }
  function icon(name) {
    const premium = root.GeoFlowPremium;
    return premium && premium.icon ? premium.icon(name) : `<i data-lucide="${esc(name)}" aria-hidden="true"></i>`;
  }
  function paint(container) {
    const premium = root.GeoFlowPremium;
    if (premium && premium.paintIcons) premium.paintIcons(container);
    else if (root.lucide) root.lucide.createIcons();
  }
  function notify(message, type) {
    if (root.GeoFlowPremium && root.GeoFlowPremium.toast) root.GeoFlowPremium.toast(message, type || "warning");
    else if (typeof setStatus === "function") setStatus(message);
  }
  function persistProject() {
    try { if (typeof save === "function") save(); else localStorage.setItem("autosoil-logger", JSON.stringify(appState())); }
    catch (error) { localStorage.setItem("autosoil-logger", JSON.stringify(appState())); }
  }

  function userName(userId) {
    return loadPolicy().users.find((user) => user.id === userId)?.name || userId || "-";
  }

  function audit(action, targetType, targetId, detail, meta) {
    policy = AccessCore.appendAudit(loadPolicy(), AccessCore.makeAudit(currentUser()?.id, action, targetType, targetId, detail, meta));
    savePolicy(false);
  }

  function projectResponsibility(projectId) {
    const state = loadPolicy();
    return state.projectResponsibilities[projectId] || { preparerId: "", reviewerId: "", approverId: "" };
  }

  function assignedUsers(projectId, permission) {
    return loadPolicy().users.filter((user) => user.active && AccessCore.hasPermission(user, permission) && AccessCore.canAccessProject(loadPolicy(), user, projectId));
  }

  function setResponsibilities(projectId, responsibility) {
    const ids = [responsibility.preparerId, responsibility.reviewerId, responsibility.approverId].filter(Boolean);
    if (new Set(ids).size !== ids.length) throw new Error("Preparer, reviewer and approver must be different people.");
    const checks = [["preparerId", "reports.prepare"], ["reviewerId", "reports.review"], ["approverId", "reports.approve"]];
    checks.forEach(([key, permission]) => {
      if (!responsibility[key]) return;
      const user = loadPolicy().users.find((item) => item.id === responsibility[key]);
      if (!user || !AccessCore.hasPermission(user, permission) || !AccessCore.canAccessProject(loadPolicy(), user, projectId)) throw new Error(`${key.replace("Id", "")} must be an assigned user with ${AccessCore.permissionLabel(permission)} permission.`);
    });
    loadPolicy().projectResponsibilities[projectId] = Object.assign({}, responsibility, { updatedAt: new Date().toISOString(), updatedBy: currentUser()?.id || "" });
    audit("workflow.responsibility.updated", "project", projectId, "Prepare, review and approval responsibilities updated", responsibility);
    savePolicy();
  }

  async function hydrateReportWorkflows() {
    if (!serverConnected || !activeProjectId() || !can("reports.view", activeProjectId())) return false;
    try {
      const response = await fetch(`/api/v1/reports/workflows?projectId=${encodeURIComponent(activeProjectId())}`, { headers: requestHeaders() });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiMessage(payload, `Workflow load failed (${response.status}).`));
      appState().reportWorkflows = payload.workflows && typeof payload.workflows === "object" ? payload.workflows : {};
      try { localStorage.setItem("autosoil-logger", JSON.stringify(appState())); } catch (error) {}
      return true;
    } catch (error) {
      notify(`Approval status could not be verified: ${error.message}`, "error");
      return false;
    }
  }

  async function hydrateServerAccess() {
    try {
      const response = await fetch("/api/v1/access/me", { headers: requestHeaders() });
      if (response.status === 404) return false;
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.enforcement !== "cloudflare-rls") return false;
      let serverPolicy = {
        users: Array.isArray(payload.users) ? payload.users.map((user) => user.id === payload.user.id ? payload.user : user) : [payload.user],
        projects: payload.projects || {}, projectAssignments: payload.projectAssignments || {},
        projectResponsibilities: payload.projectResponsibilities || {}, audit: []
      };
      if ((payload.permissions || []).includes("users.manage")) {
        const policyResponse = await fetch("/api/v1/access/policy", { headers: requestHeaders() });
        const policyPayload = await policyResponse.json().catch(() => ({}));
        if (policyResponse.ok && policyPayload.policy) serverPolicy = policyPayload.policy;
      }
      policy = AccessCore.normaliseAccessState(serverPolicy, seedIdentity());
      policy.enforcement = "cloudflare-rls";
      policy.currentUserId = policy.users.find((user) => user.email === payload.user.email)?.id || payload.user.id;
      if ((payload.permissions || []).includes("users.manage")) registerKnownProjects(policy);
      serverConnected = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(policy));
      await hydrateReportWorkflows();
      if (appState().activeTab === "team") renderAccessPage();
      applyPolicy();
      root.dispatchEvent(new CustomEvent("geoflow:access-ready", { detail: { enforcement: policy.enforcement, userId: policy.currentUserId } }));
      if ((payload.permissions || []).includes("users.manage")) queueServerPolicySave();
      return true;
    } catch (error) {
      return false;
    }
  }

  function reportWorkflow(reportId) {
    const source = appState();
    return AccessCore.workflowFor(source.reportWorkflows || {}, reportId);
  }

  function reportActions(reportId) {
    return AccessCore.availableReportActions(reportWorkflow(reportId), currentUser());
  }

  function canViewReport(reportId) {
    const user = currentUser();
    if (!user || !can("reports.view", activeProjectId())) return false;
    if (user.role !== "client") return true;
    const assignment = AccessCore.projectAssignment(loadPolicy(), activeProjectId(), user.id);
    const allowed = assignment && Array.isArray(assignment.reportIds) ? assignment.reportIds : [];
    const flow = reportWorkflow(reportId);
    const boreholeId = reportId.replace(/^report-/, "");
    const legacyApproval = appState().reportApprovals && appState().reportApprovals[boreholeId];
    return allowed.includes(reportId) && (flow.status === "Approved" || Boolean(legacyApproval));
  }

  function assertReportAction(reportId, action) {
    const projectId = activeProjectId();
    const permission = AccessCore.transitionPermission(action);
    if (!permission || !can(permission, projectId)) throw new Error(`You do not have ${AccessCore.permissionLabel(permission || action)} permission for this project.`);
    const responsibility = projectResponsibility(projectId);
    const expected = action === "review" || action === "request_changes" ? responsibility.reviewerId : action === "approve" ? responsibility.approverId : responsibility.preparerId;
    if (expected && expected !== currentUser()?.id) throw new Error(`This project assigns the ${action.replace("_", " ")} action to ${userName(expected)}.`);
    return true;
  }

  async function transitionReport(reportId, action, note) {
    const projectId = activeProjectId();
    assertReportAction(reportId, action);
    const source = appState();
    let workflow;
    if (serverConnected && loadPolicy().enforcement === "cloudflare-rls") {
      const response = await fetch("/api/v1/reports/workflows", {
        method: "POST", headers: requestHeaders(), body: JSON.stringify({ projectId, reportId, action, note: text(note) })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiMessage(payload, `Report workflow failed (${response.status}).`));
      workflow = payload.workflow;
      source.reportWorkflows = source.reportWorkflows || {};
      source.reportWorkflows[reportId] = workflow;
    } else {
      const result = AccessCore.transitionReport(source.reportWorkflows || {}, reportId, action, currentUser(), { note });
      source.reportWorkflows = result.workflows;
      workflow = result.workflow;
    }
    if (action === "approve") {
      const boreholeId = reportId.replace(/^report-/, "");
      source.reportApprovals = source.reportApprovals || {};
      source.reportApprovals[boreholeId] = { by: currentUser().name, userId: currentUser().id, at: workflow.approvedBy.at, revision: workflow.revision };
    }
    if (!serverConnected) audit(`report.${action}`, "report", reportId, `${currentUser().name} ${action.replace("_", " ")} ${reportId}`, { projectId, status: workflow.status });
    persistProject();
    if (root.CustomEvent) root.dispatchEvent(new CustomEvent("geoflow:report-workflow", { detail: {
      projectId, jobId: projectId, reportId, action, status: workflow.status, revision: workflow.revision,
      title: `Geotechnical report ${reportId.replace(/^report-/, "")}`
    } }));
    return workflow;
  }

  function roleOptions(selected) {
    return Object.values(AccessCore.ROLES).sort((a, b) => b.rank - a.rank).map((role) => `<option value="${role.id}" ${selected === role.id ? "selected" : ""}>${esc(role.title)}</option>`).join("");
  }

  function userSelect(users, selected, emptyLabel) {
    return `<option value="">${esc(emptyLabel || "Not assigned")}</option>${users.map((user) => `<option value="${esc(user.id)}" ${selected === user.id ? "selected" : ""}>${esc(user.name)} - ${esc(AccessCore.roleDefinition(user.role).title)}</option>`).join("")}`;
  }

  function roleMatrix() {
    const roles = Object.values(AccessCore.ROLES).sort((a, b) => b.rank - a.rank);
    return AccessCore.PERMISSION_GROUPS.map((group) => `<details class="access-permission-group" ${group.id === "projects" ? "open" : ""}><summary><span>${esc(group.label)}</span><small>${group.permissions.length} permissions</small></summary><div class="access-table-scroll"><table class="access-matrix"><thead><tr><th>Permission</th>${roles.map((role) => `<th>${esc(role.title)}</th>`).join("")}</tr></thead><tbody>${group.permissions.map(([permission, label]) => `<tr><th>${esc(label)}<small>${esc(permission)}</small></th>${roles.map((role) => `<td><span class="access-matrix-mark ${AccessCore.roleHasPermission(role.id, permission) ? "yes" : "no"}" aria-label="${AccessCore.roleHasPermission(role.id, permission) ? "Allowed" : "Not allowed"}">${AccessCore.roleHasPermission(role.id, permission) ? "&#10003;" : "&mdash;"}</span></td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`).join("");
  }

  function auditTable() {
    const events = loadPolicy().audit.slice(0, 80);
    if (!can("audit.view", "")) return `<div class="access-empty">Audit visibility is restricted for this role.</div>`;
    return `<div class="access-table-scroll"><table class="access-table"><thead><tr><th>Date</th><th>Actor</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead><tbody>${events.length ? events.map((event) => `<tr><td>${esc(new Date(event.at).toLocaleString())}</td><td>${esc(userName(event.actorId))}</td><td><code>${esc(event.action)}</code></td><td>${esc(`${event.targetType}: ${event.targetId}`)}</td><td>${esc(event.detail)}</td></tr>`).join("") : `<tr><td colspan="5">No access events recorded.</td></tr>`}</tbody></table></div>`;
  }

  function userRows(projectId) {
    const manager = can("users.manage", "");
    return loadPolicy().users.slice().sort((a, b) => AccessCore.roleDefinition(b.role).rank - AccessCore.roleDefinition(a.role).rank || a.name.localeCompare(b.name)).map((user) => {
      const role = AccessCore.roleDefinition(user.role);
      const allProjects = role.scope === "all";
      const assignment = allProjects || AccessCore.projectAssignment(loadPolicy(), projectId, user.id);
      const projectControl = assignment && !allProjects ? user.role === "client"
        ? `<button type="button" class="access-report-grant" data-access-client-reports="${esc(user.id)}" ${manager ? "" : "disabled"}>${Array.isArray(assignment.reportIds) ? assignment.reportIds.length : 0} selected reports</button>`
        : `<select data-project-role="${esc(user.id)}" ${manager ? "" : "disabled"}>${PROJECT_ROLE_OPTIONS.map((label) => `<option ${assignment.projectRole === label ? "selected" : ""}>${esc(label)}</option>`).join("")}</select>` : "-";
      return `<tr class="${user.active ? "" : "inactive"}"><td><span class="access-person"><i style="--role-colour:${role.colour}">${esc(user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase())}</i><span><strong>${esc(user.name)}</strong><small>${esc(user.email)}</small></span></span></td><td><span class="access-role-badge" style="--role-colour:${role.colour}">${esc(role.title)}</span></td><td>${allProjects ? `<span class="access-scope all">Company-wide</span>` : `<label class="access-assignment"><input type="checkbox" data-project-user="${esc(user.id)}" ${assignment ? "checked" : ""} ${manager ? "" : "disabled"}><span>${assignment ? "Assigned" : "Not assigned"}</span></label>`}</td><td>${projectControl}</td><td><span class="access-user-state ${user.active ? "active" : "inactive"}">${user.active ? "Active" : "Inactive"}</span></td><td>${manager ? `<button type="button" class="access-icon-button" data-access-edit-user="${esc(user.id)}" title="Edit ${esc(user.name)}" aria-label="Edit ${esc(user.name)}">${icon("pencil")}</button>` : "-"}</td></tr>`;
    }).join("");
  }

  function renderAccessPage() {
    const page = document.getElementById("page-team");
    if (!page) return;
    const projectId = activeProjectId();
    const project = activeProject();
    const user = currentUser(); const role = currentRole();
    const responsibility = projectResponsibility(projectId);
    const canManageUsers = can("users.manage", "");
    const canAssign = can("projects.assign", projectId);
    const localPreview = loadPolicy().enforcement === "local-policy";
    const serverActive = serverConnected && loadPolicy().enforcement === "cloudflare-rls";
    const previewReturnUser = loadPolicy().users.find((item) => item.id === loadPolicy().previewReturnUserId && item.active)
      || (!canManageUsers && localPreview ? loadPolicy().users.find((item) => item.active && AccessCore.hasPermission(item, "users.manage")) : null);
    const preparers = assignedUsers(projectId, "reports.prepare");
    const reviewers = assignedUsers(projectId, "reports.review");
    const approvers = assignedUsers(projectId, "reports.approve");
    page.innerHTML = `<main class="access-workspace">
      <header class="access-header"><div><span class="access-kicker">Organisation and project security</span><h1>Team &amp; Access</h1><p>${esc(project && `${project.number} - ${project.name}` || "Current project")} &middot; hierarchical role-based access control</p></div><div class="access-header-actions">${canManageUsers ? `<button type="button" class="access-button primary" data-access-add-user>${icon("user-plus")}Add user</button>` : ""}</div></header>
      <section class="access-security-state ${serverActive ? "active" : ""}"><div class="access-security-icon">${icon(serverActive ? "shield-check" : "shield-alert")}</div><div><strong>${serverActive ? "Cloudflare identity and server record controls are active." : "Local policy enforcement is active; server RLS is not yet active."}</strong><span>${serverActive ? "The Worker verifies the Cloudflare Access JWT, project assignment, bound KV record and independent report approval on every protected request." : "Roles, project assignments and approval separation are enforced in this browser. Cloudflare still requires authenticated identity and server-side policy checks before this can be treated as a security boundary."}</span></div><span class="access-security-chip">${serverActive ? "Verified server policy" : "Server enforcement pending"}</span></section>
      <section class="access-current"><div><span>Current identity</span><strong>${esc(user.name)}</strong><small>${esc(user.email)}</small></div><div><span>Organisation role</span><strong>${esc(role.title)}</strong><small>${esc(role.summary)}</small></div><div><span>Project scope</span><strong>${role.scope === "all" ? "All projects" : canAccessProject(projectId) ? "Assigned project" : "No project access"}</strong><small>${esc(project && project.number || projectId || "No active project")}</small></div>${canManageUsers && localPreview ? `<label><span>Local policy preview</span><select data-access-current-user>${loadPolicy().users.filter((item) => item.active).map((item) => `<option value="${esc(item.id)}" ${item.id === user.id ? "selected" : ""}>${esc(item.name)} - ${esc(AccessCore.roleDefinition(item.role).title)}</option>`).join("")}</select><small>Preview only; this is not authentication.</small></label>` : previewReturnUser ? `<div><span>Local policy preview</span><button type="button" class="access-button" data-access-exit-preview>${icon("undo-2")}Return to ${esc(previewReturnUser.name)}</button><small>Exit this simulated identity.</small></div>` : ""}</section>
      <section class="access-section" aria-labelledby="accessUsersTitle"><div class="access-section-head"><div><span>People and project scope</span><h2 id="accessUsersTitle">Users &amp; assignments</h2></div><div class="access-legend"><span><i class="all"></i>Company-wide</span><span><i class="assigned"></i>Assigned project</span></div></div><div class="access-table-scroll"><table class="access-table access-users"><thead><tr><th>User</th><th>Organisation role</th><th>Project access</th><th>Project responsibility</th><th>Status</th><th></th></tr></thead><tbody>${userRows(projectId)}</tbody></table></div></section>
      <section class="access-section" aria-labelledby="accessWorkflowTitle"><div class="access-section-head"><div><span>Controlled issue</span><h2 id="accessWorkflowTitle">Approval hierarchy</h2></div><span class="access-rule">Three different people required</span></div><div class="access-workflow"><label><i>1</i><span><strong>Prepare</strong><small>Build and submit the revision</small></span><select id="accessPreparer" ${canAssign ? "" : "disabled"}>${userSelect(preparers, responsibility.preparerId, "Select preparer")}</select></label><span class="access-workflow-arrow">${icon("arrow-right")}</span><label><i>2</i><span><strong>Review</strong><small>Independent technical review</small></span><select id="accessReviewer" ${canAssign ? "" : "disabled"}>${userSelect(reviewers, responsibility.reviewerId, "Select reviewer")}</select></label><span class="access-workflow-arrow">${icon("arrow-right")}</span><label><i>3</i><span><strong>Approve</strong><small>Final controlled approval</small></span><select id="accessApprover" ${canAssign ? "" : "disabled"}>${userSelect(approvers, responsibility.approverId, "Select approver")}</select></label></div>${canAssign ? `<div class="access-actions"><button type="button" class="access-button primary" data-access-save-workflow>${icon("save")}Save responsibility chain</button></div>` : ""}</section>
      <section class="access-section" aria-labelledby="accessRolesTitle"><div class="access-section-head"><div><span>Organisation policy</span><h2 id="accessRolesTitle">Role permission matrix</h2></div><small>Custom user exceptions are supported by policy but should remain exceptional.</small></div><div class="access-role-summaries">${Object.values(AccessCore.ROLES).sort((a, b) => b.rank - a.rank).map((item) => `<div><span class="access-role-badge" style="--role-colour:${item.colour}">${esc(item.title)}</span><p>${esc(item.summary)}</p><small>${item.scope === "all" ? "All projects" : "Assigned projects only"}</small></div>`).join("")}</div>${roleMatrix()}</section>
      <section class="access-section" aria-labelledby="accessAuditTitle"><div class="access-section-head"><div><span>Traceability</span><h2 id="accessAuditTitle">Access audit</h2></div><small>Latest 80 policy events</small></div>${auditTable()}</section>
      <div class="access-dialog-host"></div>
    </main>`;
    bindAccessPage(page, projectId);
    paint(page);
  }

  function userDialog(userId) {
    const user = loadPolicy().users.find((item) => item.id === userId) || null;
    const host = document.querySelector("#page-team .access-dialog-host");
    if (!host) return;
    host.innerHTML = `<div class="access-dialog-backdrop" data-access-close-dialog></div><form class="access-dialog" data-access-user-form><header><div><span>${user ? "Edit organisation user" : "Add organisation user"}</span><h2>${user ? esc(user.name) : "New user"}</h2></div><button type="button" class="access-icon-button" data-access-close-dialog aria-label="Close" title="Close">${icon("x")}</button></header><div class="access-form"><input type="hidden" name="id" value="${esc(user && user.id || "")}"><label><span>Full name</span><input name="name" required value="${esc(user && user.name || "")}" autocomplete="name"></label><label><span>Email</span><input name="email" type="email" required value="${esc(user && user.email || "")}" autocomplete="email"></label><label><span>Organisation role</span><select name="role">${roleOptions(user && user.role || "field_engineer")}</select></label><label class="access-check"><input name="active" type="checkbox" ${!user || user.active ? "checked" : ""}><span>Active user</span></label><label class="access-check"><input name="assign" type="checkbox" ${user && (AccessCore.roleDefinition(user.role).scope === "all" || AccessCore.projectAssignment(loadPolicy(), activeProjectId(), user.id)) ? "checked" : ""}><span>Assign to current project</span></label></div><footer><button type="button" class="access-button" data-access-close-dialog>Cancel</button><button type="submit" class="access-button primary">${icon("save")}Save user</button></footer></form>`;
    host.querySelectorAll("[data-access-close-dialog]").forEach((button) => button.addEventListener("click", () => { host.innerHTML = ""; }));
    host.querySelector("[data-access-user-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      try {
        const result = AccessCore.upsertUser(loadPolicy(), { id: data.get("id"), name: data.get("name"), email: data.get("email"), role: data.get("role"), active: data.has("active") }, currentUser());
        policy = result.state;
        if (data.has("assign") && AccessCore.roleDefinition(result.user.role).scope !== "all") policy = AccessCore.setProjectAssignment(policy, activeProjectId(), result.user.id, true, currentUser(), PROJECT_ROLE_OPTIONS[0]);
        else if (!data.has("assign") && AccessCore.roleDefinition(result.user.role).scope !== "all") policy = AccessCore.setProjectAssignment(policy, activeProjectId(), result.user.id, false, currentUser(), "");
        savePolicy(false); notify(`${result.user.name} saved.`, "success"); renderAccessPage(); applyPolicy();
      } catch (error) { notify(error.message, "error"); }
    });
    paint(host);
  }

  function clientReportDialog(userId) {
    const user = loadPolicy().users.find((item) => item.id === userId);
    const host = document.querySelector("#page-team .access-dialog-host");
    if (!user || !host) return;
    const assignment = AccessCore.projectAssignment(loadPolicy(), activeProjectId(), userId) || {};
    const selected = new Set(Array.isArray(assignment.reportIds) ? assignment.reportIds : []);
    const reports = (appState().boreholes || []).map((borehole) => {
      const id = `report-${borehole.id}`; const flow = reportWorkflow(id);
      const approved = flow.status === "Approved" || Boolean(appState().reportApprovals && appState().reportApprovals[borehole.id]);
      return { id, boreholeId: borehole.id, approved };
    });
    host.innerHTML = `<div class="access-dialog-backdrop" data-access-close-dialog></div><form class="access-dialog" data-access-report-grant><header><div><span>Client report access</span><h2>${esc(user.name)}</h2></div><button type="button" class="access-icon-button" data-access-close-dialog aria-label="Close" title="Close">${icon("x")}</button></header><div class="access-form"><p class="access-form-note">Only approved reports can be granted. Draft and review-stage outputs remain hidden.</p>${reports.length ? reports.map((report) => `<label class="access-report-choice ${report.approved ? "" : "unavailable"}"><input type="checkbox" name="reportId" value="${esc(report.id)}" ${selected.has(report.id) ? "checked" : ""} ${report.approved ? "" : "disabled"}><span><strong>Borehole Log - ${esc(report.boreholeId)}</strong><small>${report.approved ? "Approved" : "Not approved"}</small></span></label>`).join("") : `<div class="access-empty">No borehole reports are registered.</div>`}</div><footer><button type="button" class="access-button" data-access-close-dialog>Cancel</button><button type="submit" class="access-button primary">${icon("save")}Save report access</button></footer></form>`;
    host.querySelectorAll("[data-access-close-dialog]").forEach((button) => button.addEventListener("click", () => { host.innerHTML = ""; }));
    host.querySelector("[data-access-report-grant]").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const current = AccessCore.projectAssignment(loadPolicy(), activeProjectId(), userId);
      if (!current) { notify("Assign the client to this project first.", "error"); return; }
      current.reportIds = data.getAll("reportId");
      audit("client.report-access.updated", "project", activeProjectId(), `${user.name} granted ${current.reportIds.length} approved report(s)`, { userId, reportIds: current.reportIds });
      savePolicy(false); notify("Client report access saved.", "success"); renderAccessPage();
    });
    paint(host);
  }

  function bindAccessPage(page, projectId) {
    page.querySelector("[data-access-add-user]")?.addEventListener("click", () => userDialog(""));
    page.querySelectorAll("[data-access-edit-user]").forEach((button) => button.addEventListener("click", () => userDialog(button.dataset.accessEditUser)));
    page.querySelectorAll("[data-access-client-reports]").forEach((button) => button.addEventListener("click", () => clientReportDialog(button.dataset.accessClientReports)));
    page.querySelector("[data-access-current-user]")?.addEventListener("change", (event) => {
      const previousUser = currentUser();
      if (!loadPolicy().previewReturnUserId && previousUser && AccessCore.hasPermission(previousUser, "users.manage")) loadPolicy().previewReturnUserId = previousUser.id;
      loadPolicy().currentUserId = event.target.value;
      audit("identity.preview.changed", "user", event.target.value, `Local policy preview changed to ${userName(event.target.value)}`);
      savePolicy(false);
      renderAccessPage(); applyPolicy();
    });
    page.querySelector("[data-access-exit-preview]")?.addEventListener("click", () => {
      const returnUserId = loadPolicy().previewReturnUserId;
      const returnUser = loadPolicy().users.find((item) => item.id === returnUserId && item.active)
        || loadPolicy().users.find((item) => item.active && AccessCore.hasPermission(item, "users.manage"));
      if (!returnUser) { notify("The managing identity is no longer active.", "error"); return; }
      loadPolicy().currentUserId = returnUser.id;
      loadPolicy().previewReturnUserId = "";
      audit("identity.preview.exited", "user", returnUser.id, `Local policy preview returned to ${returnUser.name}`);
      savePolicy(false);
      renderAccessPage(); applyPolicy();
    });
    page.querySelectorAll("[data-project-user]").forEach((checkbox) => checkbox.addEventListener("change", () => {
      try {
        policy = AccessCore.setProjectAssignment(loadPolicy(), projectId, checkbox.dataset.projectUser, checkbox.checked, currentUser(), PROJECT_ROLE_OPTIONS[0]);
        savePolicy(false); renderAccessPage(); applyPolicy();
      } catch (error) { checkbox.checked = !checkbox.checked; notify(error.message, "error"); }
    }));
    page.querySelectorAll("[data-project-role]").forEach((select) => select.addEventListener("change", () => {
      try { policy = AccessCore.setProjectAssignment(loadPolicy(), projectId, select.dataset.projectRole, true, currentUser(), select.value); savePolicy(false); renderAccessPage(); }
      catch (error) { notify(error.message, "error"); }
    }));
    page.querySelector("[data-access-save-workflow]")?.addEventListener("click", () => {
      try {
        setResponsibilities(projectId, { preparerId: page.querySelector("#accessPreparer").value, reviewerId: page.querySelector("#accessReviewer").value, approverId: page.querySelector("#accessApprover").value });
        notify("Approval responsibility chain saved.", "success"); renderAccessPage();
      } catch (error) { notify(error.message, "error"); }
    });
  }

  function renderAccessDenied(tab) {
    notify(`${currentRole().title} cannot open ${tabPermission(tab)} for this project.`, "error");
    audit("access.denied", "feature", tab, `${currentUser()?.name || "User"} was denied ${tabPermission(tab)}`, { projectId: activeProjectId() });
  }

  function lockNavigation() {
    const selectors = ["#sideNav [data-sntab]", "[data-workspace-tab]", ".navtab[data-tab]", "#botNav [data-bn]"];
    document.querySelectorAll(selectors.join(",")).forEach((element) => {
      const tab = element.dataset.sntab || element.dataset.workspaceTab || element.dataset.tab || element.dataset.bn;
      if (!tab) return;
      const allowed = canOpenTab(tab);
      element.classList.toggle("access-locked", !allowed);
      element.setAttribute("aria-disabled", String(!allowed));
      if (!allowed) element.title = `${currentRole().title}: ${AccessCore.permissionLabel(tabPermission(tab))} not permitted`;
      else if (element.title && element.title.includes("not permitted")) element.removeAttribute("title");
    });
  }

  function filterPortfolio() {
    const page = document.getElementById("page-projects");
    if (!page || !page.classList.contains("show")) return;
    const allScope = currentRole().scope === "all";
    page.querySelectorAll("[data-project-open]").forEach((button) => {
      const allowed = canAccessProject(button.dataset.projectOpen);
      const container = button.closest("tr, .sts-project-card-mobile, .pj-card");
      if (container) container.hidden = !allowed;
    });
    page.querySelectorAll(".sts-kpis, .portfolio-kpis").forEach((summary) => { summary.hidden = !allScope; });
    if (!allScope) {
      const title = page.querySelector(".sts-title-group p");
      if (title) title.textContent = "Projects assigned to your current access identity.";
    }
  }

  function actionLooksMutating(button) {
    const signature = [button.id, button.className, button.name, button.dataset && Object.values(button.dataset).join(" "), button.textContent]
      .map(text).join(" ").toLowerCase();
    return /\b(add|new|save|delete|remove|upload|sync|generate|regenerate|approve|submit|edit|complete|archive|restore|parse|apply|accept|reject|mark|issue|create|assign)\b/.test(signature);
  }

  function applyReadOnly(tab) {
    const permission = AccessCore.TAB_EDIT_PERMISSIONS[tab];
    if (!permission) return;
    const page = document.getElementById(`page-${tab}`);
    if (!page) return;
    const editable = can(permission, activeProjectId());
    page.classList.toggle("access-readonly", !editable);
    page.querySelectorAll("input, select, textarea, [contenteditable]").forEach((control) => {
      if (control.closest(".access-workspace") || control.dataset.accessAllow === "true") return;
      if (!editable && !control.disabled) { control.disabled = true; control.dataset.accessPolicyDisabled = "true"; }
      else if (editable && control.dataset.accessPolicyDisabled) { control.disabled = false; delete control.dataset.accessPolicyDisabled; }
    });
    page.querySelectorAll("button").forEach((button) => {
      if (button.closest(".access-workspace") || button.dataset.accessAllow === "true" || !actionLooksMutating(button)) return;
      if (!editable && !button.disabled) { button.disabled = true; button.dataset.accessPolicyDisabled = "true"; }
      else if (editable && button.dataset.accessPolicyDisabled) { button.disabled = false; delete button.dataset.accessPolicyDisabled; }
    });
    let banner = page.querySelector(":scope > .access-readonly-banner");
    if (!editable && !banner) {
      banner = document.createElement("div"); banner.className = "access-readonly-banner";
      banner.innerHTML = `${icon("lock")}<span><strong>Read-only for ${esc(currentRole().title)}.</strong> ${esc(AccessCore.permissionLabel(permission))} is not assigned.</span>`;
      page.prepend(banner); paint(banner);
    } else if (editable && banner) banner.remove();
  }

  function enhanceSettings() {
    const page = document.getElementById("page-settings");
    if (!page || page.querySelector("#accessSettingsPanel")) return;
    const section = document.createElement("section");
    section.id = "accessSettingsPanel"; section.className = "sts-panel access-settings-panel";
    section.innerHTML = `<div class="sts-panel-header"><div><h3>Identity &amp; access</h3><p>Hierarchical RBAC and project scope</p></div><span class="sts-status warning">Local policy</span></div><div class="sts-panel-body"><dl class="access-settings-facts"><div><dt>Current user</dt><dd>${esc(currentUser().name)}</dd></div><div><dt>Role</dt><dd>${esc(currentRole().title)}</dd></div><div><dt>Project access</dt><dd>${currentRole().scope === "all" ? "All projects" : canAccessProject(activeProjectId()) ? "Assigned" : "Not assigned"}</dd></div><div><dt>Server RLS</dt><dd>Not configured</dd></div></dl><button type="button" class="sts-button" data-open-access>${icon("users")}Open Team &amp; Access</button></div>`;
    page.appendChild(section);
    section.querySelector("[data-open-access]").addEventListener("click", () => root.showTab("team"));
    paint(section);
  }

  function updateIdentityChrome() {
    const user = currentUser(); const role = currentRole();
    const avatar = document.getElementById("ghAv");
    if (avatar) { avatar.textContent = user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); avatar.title = `${user.name} - ${role.title}`; }
    const host = document.getElementById("gh");
    if (host) {
      let chip = host.querySelector(".access-header-role");
      if (!chip) { chip = document.createElement("span"); chip.className = "access-header-role"; avatar ? host.insertBefore(chip, avatar) : host.appendChild(chip); }
      chip.textContent = role.title;
      chip.style.setProperty("--role-colour", role.colour);
    }
  }

  function applyPolicy() {
    if (applying) return;
    applying = true;
    try {
      lockNavigation(); filterPortfolio(); updateIdentityChrome();
      const tab = appState().activeTab;
      if (tab) applyReadOnly(tab);
      if (tab === "settings") enhanceSettings();
    } finally { applying = false; }
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; applyPolicy(); }, 0);
  }

  function installClickGuard() {
    document.addEventListener("click", (event) => {
      const projectButton = event.target.closest("[data-project-open]");
      if (projectButton && !canAccessProject(projectButton.dataset.projectOpen)) {
        event.preventDefault(); event.stopImmediatePropagation(); renderAccessDenied("projects"); return;
      }
      const nav = event.target.closest("[data-sntab], [data-workspace-tab], .navtab[data-tab], [data-bn]");
      if (!nav) return;
      const tab = nav.dataset.sntab || nav.dataset.workspaceTab || nav.dataset.tab || nav.dataset.bn;
      if (tab && !canOpenTab(tab)) { event.preventDefault(); event.stopImmediatePropagation(); renderAccessDenied(tab); }
    }, true);
  }

  function install() {
    loadPolicy();
    const previousShowTab = root.showTab;
    if (typeof previousShowTab === "function") {
      root.showTab = function (tab) {
        if (!canOpenTab(tab)) { renderAccessDenied(tab); return; }
        previousShowTab(tab);
        if (tab === "team") renderAccessPage();
        if (tab === "settings") enhanceSettings();
        scheduleApply();
      };
      try { showTab = root.showTab; } catch (error) { /* global binding may be lexical */ }
    }
    installClickGuard();
    observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });
    if (appState().activeTab === "team") renderAccessPage();
    applyPolicy();
    if (!canOpenTab(appState().activeTab || "projects")) root.setTimeout(() => root.showTab("projects"), 0);
    root.setTimeout(hydrateServerAccess, 0);
  }

  return Object.freeze({
    core: AccessCore, loadPolicy, savePolicy, currentUser, currentRole, can, canAccessProject,
    upsertPortalClient,
    reportWorkflow, reportActions, canViewReport, assertReportAction, transitionReport, hydrateReportWorkflows,
    projectResponsibility, renderAccessPage, applyPolicy, install, isServerEnforced: () => serverConnected && loadPolicy().enforcement === "cloudflare-rls"
  });
});

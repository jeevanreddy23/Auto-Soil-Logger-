(function (root, factory) {
  let core = root && root.GeoFlowControlCore;
  let database = root && root.GeoFlowControlDB;
  if (!core && typeof require === "function") core = require("./geoflow-control-core.js");
  if (!database && typeof require === "function") database = require("./geoflow-control-db.js");
  const api = factory(core, database, root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.GeoFlowControl = api;
    if (root.document) api.install();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core, DB, root) {
  "use strict";

  if (!Core || !DB) throw new Error("GeoFlowControl requires GeoFlowControlCore and GeoFlowControlDB");

  const document = root && root.document;
  const VIEWS = Object.freeze([
    ["tower", "layout-dashboard", "Control Tower"], ["clients", "building-2", "Clients & Projects"], ["my_work", "list-checks", "My Work"],
    ["fieldwork", "hard-hat", "Fieldwork"], ["logs_lab", "flask-conical", "Logs & Lab"],
    ["reports", "files", "Reports"], ["review", "shield-check", "Review Queue"],
    ["invoice", "receipt-text", "Admin & Invoicing"], ["workload", "users", "Workload"],
    ["bottlenecks", "git-pull-request-arrow", "Bottlenecks"], ["overdue", "clock-alert", "Overdue"],
    ["import", "file-spreadsheet", "Excel Import"], ["access", "key-round", "Roles"],
    ["audit", "history", "Audit"]
  ]);
  const VIEW_IDS = new Set(VIEWS.map(([id]) => id));
  const WORKBOOK_ACCEPT = Core.SUPPORTED_WORKBOOK_EXTENSIONS.join(",");
  const DETAIL_TABS = Object.freeze([
    ["overview", "Overview"], ["workflow", "Workflow"], ["scope_field", "Scope & Field"],
    ["lab", "Samples & Lab"], ["reports", "Reports & Review"], ["commercial", "Commercial"], ["activity", "Activity"]
  ]);
  const state = {
    loaded: false, loading: false, error: "", snapshot: DB.emptySnapshot(),
    view: "tower", selectedJobId: "", detailTab: "overview", search: "",
    filters: { type: "ALL", owner: "ALL", risk: "ALL", sort: "due" },
    validationErrors: [], addTask: false, taskEditor: null, filterOpen: false, importSession: null, importBusy: false,
    selectedClientId: "", clientSearch: "", clientMode: "profile", clientAccessEditor: false, returnView: "",
    connection: { status: "offline", lastSyncAt: "", revision: 0 }, liveReloading: false,
    renderToken: 0, installed: false
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function attr(value) { return esc(value).replace(/'/g, "&#39;"); }
  function icon(name) {
    if (root.GeoFlowPremium && root.GeoFlowPremium.icon) return root.GeoFlowPremium.icon(name);
    return `<i data-lucide="${attr(name)}" aria-hidden="true"></i>`;
  }
  function paint() {
    if (root.GeoFlowPremium && root.GeoFlowPremium.paintIcons) root.GeoFlowPremium.paintIcons();
    else if (root.lucide) root.lucide.createIcons();
  }
  function notify(message, type) {
    if (root.GeoFlowPremium && root.GeoFlowPremium.toast) root.GeoFlowPremium.toast(message, type || "info");
    else root.alert(message);
  }
  function registry() {
    try { return typeof PJ !== "undefined" && PJ && Array.isArray(PJ.projects) ? PJ : JSON.parse(root.localStorage.getItem("geoflow-projects") || "{}"); }
    catch (error) { return { activePid: "", projects: [] }; }
  }
  function projectState(project) {
    try {
      if (typeof PJ !== "undefined" && project.pid === PJ.activePid && typeof S !== "undefined") return S;
      return JSON.parse(root.localStorage.getItem(`autosoil-prj-${project.pid}`) || "null");
    } catch (error) { return null; }
  }
  function accessPolicy() {
    try { return root.GeoFlowAccess && root.GeoFlowAccess.loadPolicy ? root.GeoFlowAccess.loadPolicy() : null; }
    catch (error) { return null; }
  }
  function currentUser() {
    try { return root.GeoFlowAccess && root.GeoFlowAccess.currentUser ? root.GeoFlowAccess.currentUser() : { id: "u_local", name: "STS Director", role: "director" }; }
    catch (error) { return { id: "u_local", name: "STS Director", role: "director" }; }
  }
  function currentRole() {
    try { return root.GeoFlowAccess && root.GeoFlowAccess.currentRole ? root.GeoFlowAccess.currentRole() : { id: currentUser().role || "director", title: Core.roleTitle(currentUser().role || "director"), scope: "all" }; }
    catch (error) { return { id: "director", title: "Director", scope: "all" }; }
  }
  function canAccessJob(job) {
    if (!job) return false;
    try { return !root.GeoFlowAccess || !root.GeoFlowAccess.canAccessProject || root.GeoFlowAccess.canAccessProject(job.projectId || job.id); }
    catch (error) { return true; }
  }
  function canFinance(job) {
    try {
      if (root.GeoFlowAccess && root.GeoFlowAccess.can) return root.GeoFlowAccess.can("finance.view", job && (job.projectId || job.id));
    } catch (error) { /* use role fallback */ }
    return ["director", "admin"].includes(currentRole().id);
  }
  function canExport() {
    try {
      if (root.GeoFlowAccess && root.GeoFlowAccess.can) return root.GeoFlowAccess.can("exports.create");
    } catch (error) { /* use role fallback */ }
    return ["director", "engineering_manager", "project_engineer", "admin"].includes(currentRole().id);
  }
  function allowedViews() {
    const role = currentRole().id;
    const byRole = {
      director: VIEWS.map(([id]) => id),
      engineering_manager: ["tower", "clients", "my_work", "fieldwork", "logs_lab", "reports", "review", "workload", "bottlenecks", "overdue", "access", "audit"],
      project_engineer: ["tower", "clients", "my_work", "fieldwork", "logs_lab", "reports", "review", "workload", "bottlenecks", "overdue", "audit"],
      field_engineer: ["my_work", "fieldwork", "logs_lab"],
      laboratory_staff: ["my_work", "logs_lab"],
      admin: ["tower", "clients", "my_work", "fieldwork", "reports", "invoice", "workload", "bottlenecks", "overdue", "import", "access", "audit"],
      client: ["clients"]
    };
    return byRole[role] || ["my_work"];
  }
  function allJobRows() { return state.snapshot.jobs.filter((job) => !job.archived && canAccessJob(job)); }
  function jobRows() { return allJobRows().filter((job) => !job.registerOnly); }
  function rawEntitiesFor(jobId) {
    const result = {};
    DB.STORE_NAMES.forEach((name) => { result[name] = state.snapshot[name].filter((item) => item.jobId === jobId); });
    return result;
  }
  function entitiesFor(jobId) {
    const result = rawEntitiesFor(jobId); const role = currentRole().id; const user = currentUser();
    result.job_stages = result.job_stages.filter((item) => Core.stageVisibleForRole(role, item.stageId));
    result.job_tasks = result.job_tasks.filter((task) => {
      if (!Core.stageVisibleForRole(role, task.stageId) || role === "client") return false;
      if (role === "field_engineer") return task.ownerRole === "field_engineer" && (!task.ownerId || task.ownerId === user.id);
      if (role === "laboratory_staff") return task.ownerRole === "laboratory_staff" && (!task.ownerId || task.ownerId === user.id);
      return true;
    });
    result.activity_history = result.activity_history.filter((item) => !item.stageId || Core.stageVisibleForRole(role, item.stageId));
    return result;
  }
  function jobSummary(job) {
    const entities = rawEntitiesFor(job.id);
    return Core.summariseJob(job, entities.job_stages, entities.job_tasks, new Date());
  }
  function projectByJob(job) { return registry().projects.find((project) => project.pid === (job.projectId || job.id)); }

  function routeState() {
    const detail = /^#\/control\/job\/([^/]+)/.exec(root.location.hash);
    if (detail) return { view: "tower", jobId: decodeURIComponent(detail[1]) };
    const view = /^#\/control\/([^/]+)/.exec(root.location.hash);
    return { view: view && VIEW_IDS.has(view[1]) ? view[1] : "", jobId: "" };
  }
  function setRoute(view, jobId, replace) {
    const hash = jobId ? `#/control/job/${encodeURIComponent(jobId)}` : `#/control/${view || "tower"}`;
    if (root.location.hash === hash) return;
    if (replace) root.history.replaceState(null, "", hash); else root.history.pushState(null, "", hash);
  }
  function restoreViewPreference() {
    const user = currentUser(); const route = routeState();
    const saved = root.localStorage.getItem(`sts-control-view:${user.id}`);
    state.view = route.view || (VIEW_IDS.has(saved) ? saved : Core.viewForRole(user.role));
    state.selectedJobId = route.jobId;
  }

  async function hydrate(force) {
    if (state.loading) return;
    if (state.loaded && !force) return;
    state.loading = true; state.error = ""; render();
    try {
      state.snapshot = await DB.migrateProjects(registry().projects || [], projectState, accessPolicy());
      state.loaded = true;
      if (root.GeoFlowControlLive) root.GeoFlowControlLive.start(state.snapshot);
    } catch (error) {
      state.error = error && error.message || "The local control database could not be loaded.";
    } finally {
      state.loading = false; render();
    }
  }

  function page() { return document && document.getElementById("page-projects"); }
  async function reloadFromLive(event) {
    if (state.liveReloading) return;
    state.liveReloading = true;
    try {
      if (event && event.detail) state.connection = Object.assign({}, state.connection, event.detail);
      const live = root.GeoFlowControlLive && root.GeoFlowControlLive.state && root.GeoFlowControlLive.state.local;
      state.snapshot = live ? Core.clone(live) : await DB.loadAll(); state.loaded = true; render();
    } finally { state.liveReloading = false; }
  }
  function render() {
    const host = page();
    if (!host) return;
    if (state.loading && !state.loaded) {
      host.innerHTML = `<main class="control-workspace"><div class="control-loading" role="status"><span></span><span></span><span></span><strong>Loading Project Control Tower</strong></div></main>`;
      return;
    }
    if (state.error) {
      host.innerHTML = `<main class="control-workspace"><div class="control-state error">${icon("database-zap")}<h2>Local database unavailable</h2><p>${esc(state.error)}</p><button class="control-button" data-control-retry>Retry</button></div></main>`;
      bind(host); paint(); return;
    }
    const selected = state.selectedJobId && state.snapshot.jobs.find((job) => job.id === state.selectedJobId && canAccessJob(job));
    if (selected) host.innerHTML = renderJobDetail(selected);
    else host.innerHTML = renderWorkspace();
    bind(host); paint();
    if (root.GeoFlowAccess && root.GeoFlowAccess.applyPolicy) root.setTimeout(() => root.GeoFlowAccess.applyPolicy(), 0);
  }

  function renderWorkspace() {
    const role = currentRole();
    const allowed = allowedViews();
    if (!allowed.includes(state.view)) state.view = allowed.includes(Core.viewForRole(role.id)) ? Core.viewForRole(role.id) : allowed[0];
    const rows = filteredJobs();
    const clientWorkspace = state.view === "clients";
    const heading = clientWorkspace ? role.id === "client" ? "STS GeoFlow Client Portal" : "Clients & Projects" : "STS GeoFlow Project Control Tower";
    const eyebrow = clientWorkspace ? role.id === "client" ? "Project portal" : `Relationships / ${role.title}` : `Operations / ${role.title}`;
    const intro = clientWorkspace ? role.id === "client" ? "Current status and approved deliverables for your assigned projects." : "Client contacts, project history and portal access in one clear workspace." : roleHomeLine(role.id);
    return `<main class="control-workspace" data-control-view="${attr(state.view)}">
      <header class="control-header">
        <div><span class="control-eyebrow">${esc(eyebrow)}</span><h1>${esc(heading)}</h1><p>${esc(intro)}</p></div>
        <div class="control-header-actions">
          ${renderConnectionStatus()}
          ${allowed.includes("import") ? `<button type="button" class="control-button" data-control-view-go="import">${icon("file-up")}<span>Import Excel</span></button>` : ""}
          ${["director", "engineering_manager", "project_engineer", "admin"].includes(role.id) ? `<button type="button" class="control-button primary" data-control-new-project>${icon("plus")}<span>New Job</span></button>` : ""}
        </div>
      </header>
      ${allowed.length > 1 ? renderViewBar() : ""}
      ${role.id !== "client" && (state.view === "tower" || ["my_work", "fieldwork", "logs_lab", "reports", "review", "invoice", "overdue"].includes(state.view)) ? renderKpis() : ""}
      ${renderViewBody(rows)}
    </main>`;
  }

  function roleHomeLine(roleId) {
    return ({
      director: "Company delivery, workload, commercial exposure and risk in one accountable queue.",
      engineering_manager: "Technical reviews, approvals, high-risk work and team bottlenecks.",
      project_engineer: "Assigned jobs, factual QA, engineering actions and report delivery.",
      field_engineer: "Allocated fieldwork, due activities and incomplete field records.",
      laboratory_staff: "Assigned samples, laboratory results and overdue test actions.",
      admin: "Job setup, bookings, client actions, report issue, invoicing and closure.",
      client: "Selected project status and approved deliverables."
    })[roleId] || "Project delivery and accountable next actions.";
  }

  function renderConnectionStatus() {
    const status = state.connection.status || "offline";
    const labels = { live: "Live", connecting: "Connecting", polling: "Polling", offline: "Offline cache" };
    const title = state.connection.lastSyncAt ? `Last shared update ${formatDateTime(state.connection.lastSyncAt)}` : "Shared workflow connection";
    return `<span class="control-live-status ${attr(status)}" title="${attr(title)}">${icon(status === "live" ? "radio-tower" : status === "offline" ? "cloud-off" : "refresh-cw")}<span>${esc(labels[status] || status)}</span></span>`;
  }

  function renderViewBar() {
    const allowed = new Set(allowedViews());
    const primaryIds = new Set(["tower", "clients", "my_work", "fieldwork", "logs_lab", "reports"]);
    const visible = VIEWS.filter(([id]) => allowed.has(id));
    const primary = visible.filter(([id]) => primaryIds.has(id));
    const secondary = visible.filter(([id]) => !primaryIds.has(id));
    const secondaryActive = secondary.find(([id]) => id === state.view);
    const viewButton = ([id, iconName, label]) => {
      const visibleLabel = currentRole().id === "client" && id === "my_work" ? "Projects" : label;
      return `<button type="button" class="${state.view === id ? "active" : ""}" data-control-view-go="${id}" aria-label="${attr(visibleLabel)}" title="${attr(visibleLabel)}" aria-current="${state.view === id ? "page" : "false"}">${icon(iconName)}<span>${esc(visibleLabel)}</span></button>`;
    };
    return `<nav class="control-viewbar" aria-label="Project control views"><div class="control-view-primary">${primary.map(viewButton).join("")}</div>${secondary.length ? `<details class="control-view-more"><summary class="${secondaryActive ? "active" : ""}" aria-label="More project control views">${icon(secondaryActive ? secondaryActive[1] : "ellipsis")}<span>${esc(secondaryActive ? secondaryActive[2] : "More")}</span>${icon("chevron-down")}</summary><div class="control-view-menu">${secondary.map(viewButton).join("")}</div></details>` : ""}</nav>`;
  }

  function kpiData() {
    const jobs = jobRows(); const today = Core.isoDate(new Date());
    const enriched = jobs.map((job) => ({ job, summary: jobSummary(job) }));
    const commercial = canFinance()
      ? ["Unbilled complete", enriched.filter(({ job }) => Core.STAGE_INDEX[job.currentStageId] >= Core.STAGE_INDEX.report_issued && !["Issued", "Paid"].includes(job.invoiceStatus)).length, "Issued work awaiting invoice", "receipt"]
      : ["Due this week", enriched.filter(({ job }) => { const due = Core.toDate(job.nextActionDue); const todayDate = Core.toDate(Core.isoDate(new Date())); return due && due >= todayDate && Core.daysBetween(todayDate, due) <= 7; }).length, "Visible assigned actions", "calendar-range"];
    return [
      ["Active jobs", jobs.length, "Open delivery records", "briefcase-business"],
      ["Due today", enriched.filter(({ job }) => Core.isoDate(job.nextActionDue) === today).length, "Next actions due", "calendar-check"],
      ["Overdue", enriched.filter(({ summary }) => summary.overdueDays > 0).length, "Action due date passed", "clock-alert"],
      ["Blocked", enriched.filter(({ summary }) => summary.blocked).length, "Recorded blockers", "octagon-pause"],
      commercial,
      ["High risk", enriched.filter(({ summary }) => summary.risk === "High").length, "Delivery or technical risk", "triangle-alert"],
      ["Awaiting assignment", enriched.filter(({ job }) => job.handoverStatus === "awaiting_assignment").length, "PM handovers ready now", "git-pull-request-arrow"]
    ];
  }
  function renderKpis() {
    const all = kpiData();
    const indexes = state.view === "review" ? [0, 1, 2, 5] : state.view === "invoice" ? [0, 2, 3, 4] : state.view === "tower" ? [0, 6, 2, 3] : [0, 1, 2, 3];
    return `<section class="control-kpis" aria-label="Portfolio indicators">${indexes.map((index) => all[index]).map(([label, value, note, iconName]) => `<div><span>${icon(iconName)}${esc(label)}</span><strong>${value}</strong><small>${esc(note)}</small></div>`).join("")}</section>`;
  }

  function renderViewBody(rows) {
    if (state.view === "clients") return renderClientsWorkspace();
    if (state.view === "import") return renderImport();
    if (state.view === "workload") return renderWorkload();
    if (state.view === "bottlenecks") return renderBottlenecks();
    if (state.view === "access") return renderRoles();
    if (state.view === "audit") return renderAudit();
    const register = `<section class="control-register" aria-label="${attr(viewLabel(state.view))}">${renderToolbar(rows)}${renderJobTable(rows)}</section>`;
    return state.view === "tower" && currentRole().id !== "client" ? `${renderLiveFlow()}${register}` : register;
  }

  function portalUsersFor(client) {
    const policy = accessPolicy();
    if (!policy || !Array.isArray(policy.users)) return [];
    const projects = new Set(client.projects.map((job) => job.projectId || job.id));
    return policy.users.filter((user) => user.active !== false && user.role === "client" && [...projects].some((projectId) => {
      const assignment = policy.projectAssignments && policy.projectAssignments[projectId] && policy.projectAssignments[projectId][user.id];
      return assignment && assignment.active !== false;
    }));
  }

  function clientProjectMatches(client, query) {
    if (!query) return true;
    return [client.name, client.code, client.address, client.phone, client.contactName, client.email,
      ...client.projects.flatMap((job) => [job.jobNumber, job.projectName, job.siteAddress, job.projectType, job.projectDetails && job.projectDetails.stsNumber])]
      .join(" ").toLowerCase().includes(query);
  }

  function renderClientsWorkspace() {
    const role = currentRole().id; const isClient = role === "client"; const directory = Core.clientDirectory(allJobRows());
    const query = state.clientSearch.trim().toLowerCase(); const filtered = directory.filter((client) => clientProjectMatches(client, query));
    let selected = filtered.find((client) => client.id === state.selectedClientId)
      || (query ? filtered[0] : directory.find((client) => client.id === state.selectedClientId))
      || filtered[0] || directory[0];
    if (selected) state.selectedClientId = selected.id;
    const visible = filtered.slice(0, 100); const jobs = directory.reduce((sum, client) => sum + client.projects.length, 0);
    const active = directory.reduce((sum, client) => sum + client.projects.filter((job) => !job.registerOnly && job.currentStageId !== "job_closed").length, 0);
    const contactGaps = directory.filter((client) => !client.email && !client.phone).length;
    if (!directory.length) return `<section class="control-client-empty">${icon("building-2")}<h2>${isClient ? "No projects are assigned" : "No client records yet"}</h2><p>${isClient ? "Your STS contact can assign approved projects to this portal." : "Import the STS Project Register to create client profiles and link their project history."}</p>${allowedViews().includes("import") ? `<button type="button" class="control-button primary" data-control-view-go="import">${icon("file-up")}<span>Import project register</span></button>` : ""}</section>`;
    return `<section class="control-client-hub ${isClient ? "is-client" : ""}" data-client-mode="${attr(isClient ? "portal" : state.clientMode)}">
      ${isClient ? "" : `<div class="control-client-metrics" aria-label="Client portfolio indicators"><div><span>Clients</span><strong>${directory.length}</strong></div><div><span>Linked projects</span><strong>${jobs}</strong></div><div><span>Active projects</span><strong>${active}</strong></div><div class="${contactGaps ? "attention" : ""}"><span>Contact gaps</span><strong>${contactGaps}</strong></div></div>`}
      <div class="control-client-tools"><label>${icon("search")}<input type="search" data-control-client-search value="${attr(state.clientSearch)}" placeholder="Search client, contact, project or site" aria-label="Search clients and projects"></label><span><strong>${filtered.length}</strong> ${isClient ? "client account" : "clients"}${filtered.length === directory.length ? "" : ` of ${directory.length}`}</span></div>
      <div class="control-client-browser">
        ${isClient && directory.length === 1 ? "" : `<aside class="control-client-directory" aria-label="Client directory"><header><strong>${isClient ? "Accounts" : "Client directory"}</strong><span>${visible.length}${filtered.length > visible.length ? ` of ${filtered.length}` : ""}</span></header><div>${visible.map((client) => `<button type="button" class="${selected && selected.id === client.id ? "active" : ""}" data-control-client="${attr(client.id)}"><i>${icon("building-2")}</i><span><strong>${esc(client.name)}</strong><small>${esc(client.code || "No client code")} / ${client.projects.length} project${client.projects.length === 1 ? "" : "s"}</small></span>${icon("chevron-right")}</button>`).join("") || `<p>No clients match this search.</p>`}</div>${filtered.length > visible.length ? `<footer>Refine the search to view the remaining ${filtered.length - visible.length} clients.</footer>` : ""}</aside>`}
        <section class="control-client-profile">${selected ? renderClientProfile(selected, isClient) : `<div class="control-state compact">${icon("search-x")}<strong>No matching client</strong><span>Clear or change the search.</span></div>`}</section>
      </div>
    </section>`;
  }

  function renderClientProfile(client, isClient) {
    const portalMode = isClient || state.clientMode === "portal"; const users = portalUsersFor(client);
    const mayManageAccess = ["director", "admin"].includes(currentRole().id);
    const currentProjects = client.projects.filter((job) => !job.registerOnly && job.currentStageId !== "job_closed").length;
    return `<header class="control-client-profile-header"><div><span class="control-eyebrow">${isClient ? "Client account" : client.code || "Client profile"}</span><h2>${esc(client.name)}</h2><p>${esc(client.address || "Address not recorded")}</p></div>${isClient ? "" : `<div class="control-client-mode" role="group" aria-label="Client workspace mode"><button type="button" data-control-client-mode="profile" class="${portalMode ? "" : "active"}">${icon("contact")}<span>Profile</span></button><button type="button" data-control-client-mode="portal" class="${portalMode ? "active" : ""}">${icon("eye")}<span>Portal preview</span></button></div>`}</header>
      ${!isClient && state.clientAccessEditor ? renderClientAccessEditor(client, users) : ""}
      ${portalMode ? renderClientPortal(client, isClient) : `<div class="control-client-contact"><dl>${fact("Primary contact", client.contactName)}${fact("Email", client.email)}${fact("Phone", client.phone)}${fact("Client code", client.code)}${fact("Address", client.address)}${fact("Last project update", formatDate(client.updatedAt))}</dl></div>
      ${state.clientAccessEditor ? "" : `<section class="control-portal-access"><div>${icon(users.length ? "shield-check" : "user-round-plus")}<span><strong>${users.length ? `${users.length} portal user${users.length === 1 ? "" : "s"} assigned` : "Portal access not set up"}</strong><small>${users.length ? users.map((user) => user.email || user.name).join(" / ") : "Create a Client user and assign only the projects they may view."}</small></span></div>${mayManageAccess ? `<button type="button" class="control-button" data-control-client-access-open>${icon("user-cog")}<span>${users.length ? "Manage access" : "Set up portal access"}</span></button>` : ""}</section>`}
      <section class="control-client-projects"><header><div><span class="control-eyebrow">Project history</span><h3>Linked projects</h3></div><span>${currentProjects} active / ${client.projects.length} total</span></header>${renderClientProjectTable(client.projects)}</section>`}`;
  }

  function renderClientAccessEditor(client, users) {
    const user = users[0] || {}; const policy = accessPolicy();
    return `<form class="control-client-access-editor" data-control-client-access-form data-client-id="${attr(client.id)}"><header><div>${icon("shield-check")}<span><strong>Client portal access</strong><small>${users.length ? "Update the primary portal contact and project visibility." : "Create a client login for this account."}</small></span></div><button type="button" class="control-icon-button" data-control-client-access-close title="Close" aria-label="Close portal access editor">${icon("x")}</button></header><div class="control-client-access-fields"><label><span>Contact name</span><input name="name" value="${attr(user.name || client.contactName || client.name)}" required></label><label><span>Email</span><input name="email" type="email" value="${attr(user.email || client.email)}" required></label></div><fieldset><legend>Projects visible in portal <b>${client.projects.length}</b></legend><div>${client.projects.map((job) => {
      const assignment = user.id && policy && policy.projectAssignments && policy.projectAssignments[job.projectId || job.id] && policy.projectAssignments[job.projectId || job.id][user.id];
      return `<label><input type="checkbox" name="projectId" value="${attr(job.projectId || job.id)}" ${!user.id || assignment && assignment.active !== false ? "checked" : ""}><span><strong>${esc(job.jobNumber || "Unnumbered")}</strong><small>${esc(job.projectName || job.siteAddress || "Unnamed project")}</small></span></label>`;
    }).join("")}</div></fieldset><footer><button type="button" class="control-button" data-control-client-access-close>Cancel</button><button type="submit" class="control-button primary">${icon("shield-check")}<span>Save portal access</span></button></footer></form>`;
  }

  function saveClientPortalAccess(form) {
    if (!root.GeoFlowAccess || !root.GeoFlowAccess.upsertPortalClient) { notify("Client portal access is unavailable.", "error"); return; }
    const client = Core.clientDirectory(allJobRows()).find((item) => item.id === form.dataset.clientId);
    if (!client) { notify("The selected client profile is unavailable.", "error"); return; }
    const data = new FormData(form); const selected = new Set(data.getAll("projectId").map(Core.text));
    try {
      const user = root.GeoFlowAccess.upsertPortalClient({
        name: Core.text(data.get("name")), email: Core.text(data.get("email")),
        projects: client.projects.map((job) => ({
          id: job.projectId || job.id, name: job.projectName, number: job.jobNumber,
          recordKey: `__project_${job.projectId || job.id}__`, assigned: selected.has(job.projectId || job.id)
        }))
      });
      state.clientAccessEditor = false; notify(`Portal access saved for ${user.name}.`, "success"); render();
    } catch (error) { notify(error && error.message || "Client portal access could not be saved.", "error"); }
  }

  function renderClientProjectTable(projects) {
    return `<div class="control-table-wrap"><table class="control-table client-projects"><thead><tr><th>Job / project</th><th>Work</th><th>STS reference</th><th>Stage / owner</th><th>Updated</th><th><span class="sr-only">Open</span></th></tr></thead><tbody>${projects.map((job) => {
      const details = job.projectDetails || {}; const display = jobDisplay(job);
      const workDetail = Core.slug(details.workRequired) !== Core.slug(job.projectType) ? details.workRequired : "";
      const siteDetail = Core.slug(job.siteAddress) !== Core.slug(job.projectName) ? job.siteAddress : "";
      return `<tr><td><strong>${esc(job.jobNumber || "Unnumbered")}</strong><span>${esc(job.projectName || "Unnamed project")}</span><small>${esc(siteDetail)}</small></td><td><strong>${esc(job.projectType)}</strong><small>${esc(workDetail)}</small></td><td>${esc(details.stsNumber || "-")}<small>${details.proposalNumber ? `Proposal ${esc(details.proposalNumber)}` : ""}</small></td><td><span class="control-stage">${esc(display.stage)}</span><small>${esc(display.owner || "Unassigned")}</small></td><td>${esc(formatDate(job.updatedAt))}</td><td><button type="button" class="control-icon-button" data-control-job="${attr(job.id)}" data-project-open="${attr(job.projectId || job.id)}" title="Open project details" aria-label="Open ${attr(job.jobNumber)} project details">${icon("chevron-right")}</button></td></tr>`;
    }).join("")}</tbody></table></div><div class="control-client-project-cards">${projects.map((job) => `<button type="button" data-control-job="${attr(job.id)}" data-project-open="${attr(job.projectId || job.id)}"><span><strong>${esc(job.jobNumber)}</strong><small>${esc(job.projectType)}</small></span><b>${esc(job.projectName)}</b><small>${esc(job.siteAddress)}</small>${icon("chevron-right")}</button>`).join("")}</div>`;
  }

  function renderClientPortal(client, isClient) {
    return `<section class="control-portal-preview"><header><div><span class="control-eyebrow">${isClient ? "Your projects" : "Client-visible view"}</span><h3>${client.projects.length} project${client.projects.length === 1 ? "" : "s"}</h3></div>${isClient ? "" : `<span>${icon("eye")} Internal preview</span>`}</header><div>${client.projects.map((job) => {
      const summary = jobSummary(job); const display = jobDisplay(job);
      const reports = rawEntitiesFor(job.id).reports.filter((report) => ["approved", "issued"].includes(Core.text(report.status).toLowerCase()));
      const siteDetail = Core.slug(job.siteAddress) !== Core.slug(job.projectName) ? job.siteAddress || "Site not recorded" : "";
      return `<button type="button" data-control-job="${attr(job.id)}" data-project-open="${attr(job.projectId || job.id)}"><span><strong>${esc(job.jobNumber)} / ${esc(job.projectName)}</strong><small>${esc(siteDetail)}</small></span><span><b>${esc(display.stage)}</b><small>Updated ${esc(formatDate(job.updatedAt))}</small></span><span>${miniProgress("Technical", summary.technical)}</span><span><b>${reports.length}</b><small>approved report${reports.length === 1 ? "" : "s"}</small></span>${icon("chevron-right")}</button>`;
    }).join("")}</div></section>`;
  }

  function renderLiveFlow() {
    const jobs = new Map(jobRows().map((job) => [job.id, job]));
    const visibleActions = new Set(["task.completed", "laboratory.result.submitted", "handover.ready", "handover.assigned", "workflow.closed", "report.submit", "report.approve"]);
    const events = state.snapshot.activity_history.filter((event) => jobs.has(event.jobId) && visibleActions.has(event.action))
      .filter((event) => !event.stageId || Core.stageVisibleForRole(currentRole().id, event.stageId))
      .sort((left, right) => String(right.at).localeCompare(String(left.at))).slice(0, 5);
    const label = (event) => ({
      "task.completed": "Task completed", "laboratory.result.submitted": "Lab result submitted",
      "handover.ready": "PM assignment required", "handover.assigned": "Next stage assigned",
      "workflow.closed": "Workflow closed", "report.submit": "Report submitted", "report.approve": "Report approved"
    })[event.action] || event.action;
    return `<section class="control-live-flow" aria-label="Live workflow updates"><header><div><span class="control-eyebrow">Live flow</span><h2>Recent handovers</h2></div><span>${events.length ? "Updates from the shared workflow" : "Waiting for team updates"}</span></header>${events.length ? `<ol>${events.map((event) => {
      const job = jobs.get(event.jobId);
      return `<li class="${attr(Core.slug(event.action))}"><i>${icon(event.action === "handover.ready" ? "user-round-check" : event.action.includes("laboratory") ? "flask-conical" : event.action.includes("report") ? "file-check-2" : "check")}</i><div><strong>${esc(label(event))}</strong><span>${esc(event.reason || "Workflow updated")}</span></div><button type="button" data-control-job="${attr(job.id)}" data-project-open="${attr(job.projectId || job.id)}"><b>${esc(job.jobNumber)}</b><small>${esc(event.actorName || "STS GeoFlow")} / ${esc(formatDateTime(event.at))}</small></button></li>`;
    }).join("")}</ol>` : `<div class="control-live-empty">${icon("radio-tower")}<span>Field, laboratory and report updates will appear here as the team completes work.</span></div>`}</section>`;
  }

  function viewLabel(id) { return VIEWS.find(([viewId]) => viewId === id)?.[2] || "Control Tower"; }

  function filteredJobs() {
    const user = currentUser(); const role = currentRole(); const now = new Date();
    let rows = jobRows();
    const stageSets = {
      fieldwork: new Set(["fieldwork_planned", "fieldwork_in_progress", "fieldwork_completed"]),
      logs_lab: new Set(["logs_in_progress", "logs_reviewed", "lab_results_pending"]),
      reports: new Set(["engineering_assessment", "report_drafting", "client_follow_up", "report_issued"]),
      review: new Set(["logs_reviewed", "technical_review"]),
      invoice: new Set(["report_issued", "invoice_requested", "invoice_issued", "payment_follow_up", "job_closed"])
    };
    if (state.view === "my_work") rows = rows.filter((job) => Core.jobInMyWork(job, entitiesFor(job.id).job_assignments, user, role.id));
    else if (stageSets[state.view]) rows = rows.filter((job) => stageSets[state.view].has(job.currentStageId));
    else if (state.view === "overdue") rows = rows.filter((job) => Core.deriveHealth(job, now).overdueDays > 0);
    if (role.id === "field_engineer") rows = rows.filter((job) => /fieldwork|logs_in_progress/.test(job.currentStageId) || ownerMatches(job, user));
    if (role.id === "laboratory_staff") rows = rows.filter((job) => job.currentStageId === "lab_results_pending" || ownerMatches(job, user));
    const q = state.search.toLowerCase();
    if (q) rows = rows.filter((job) => [job.jobNumber, job.projectName, job.client, job.siteAddress, job.currentOwner, job.nextAction].join(" ").toLowerCase().includes(q));
    if (state.filters.type !== "ALL") rows = rows.filter((job) => job.projectType === state.filters.type);
    if (state.filters.owner !== "ALL") rows = rows.filter((job) => job.currentOwner === state.filters.owner);
    if (state.filters.risk !== "ALL") rows = rows.filter((job) => jobSummary(job).risk === state.filters.risk);
    const sort = role.id === "client" && !["number", "progress"].includes(state.filters.sort) ? "number" : state.filters.sort;
    rows.sort(jobSorter(sort));
    return rows;
  }

  function ownerMatches(job, user) {
    return Core.ownerMatchesUser(job, user);
  }
  function jobDisplay(job) {
    if (job.registerOnly) return { stageId: "register", stage: "Project register", owner: "Reference record", action: "", due: "", capped: false };
    const limit = Core.visibleStageLimit(currentRole().id); const index = Core.STAGE_INDEX[job.currentStageId] ?? 0;
    if (index <= limit) return { stageId: job.currentStageId, stage: Core.STAGE_BY_ID[job.currentStageId]?.title || job.currentStageId, owner: job.currentOwner, action: job.nextAction, due: job.nextActionDue, capped: false };
    const boundary = Core.STAGES[limit];
    return { stageId: boundary.id, stage: `${boundary.title} or later`, owner: "Higher-level workflow", action: "Managed at a higher approval level", due: "", capped: true };
  }
  function jobSorter(sort) {
    if (sort === "number") return (a, b) => a.jobNumber.localeCompare(b.jobNumber, undefined, { numeric: true });
    if (sort === "progress") return (a, b) => jobSummary(b).overall - jobSummary(a).overall;
    if (sort === "risk") return (a, b) => ({ High: 0, Medium: 1, Low: 2 })[jobSummary(a).risk] - ({ High: 0, Medium: 1, Low: 2 })[jobSummary(b).risk];
    if (sort === "stage_age") return (a, b) => jobSummary(b).daysInStage - jobSummary(a).daysInStage;
    return (a, b) => (Core.toDate(a.nextActionDue)?.getTime() || Infinity) - (Core.toDate(b.nextActionDue)?.getTime() || Infinity);
  }

  function renderToolbar(rows) {
    const all = jobRows(); const types = [...new Set(all.map((job) => job.projectType).filter(Boolean))].sort();
    const owners = [...new Set(all.map((job) => job.currentOwner).filter(Boolean))].sort();
    const clientView = currentRole().id === "client";
    const activeFilters = [state.filters.type, state.filters.owner, state.filters.risk].filter((value) => value !== "ALL").length;
    return `<div class="control-toolbar">
      <label class="control-search">${icon("search")}<input type="search" data-control-search value="${attr(state.search)}" placeholder="${clientView ? "Search project, job number or site" : "Search job, client, site, owner or action"}" aria-label="Search jobs"></label>
      <details class="control-filter-menu" data-control-filters ${state.filterOpen ? "open" : ""}><summary class="control-button">${icon("list-filter")}<span>Filters</span>${activeFilters ? `<b>${activeFilters}</b>` : ""}</summary><div class="control-filter-panel">
        <label><span>Project type</span><select data-control-filter="type"><option value="ALL">All types</option>${types.map((type) => `<option ${state.filters.type === type ? "selected" : ""}>${esc(type)}</option>`).join("")}</select></label>
        ${clientView ? "" : `<label><span>Owner</span><select data-control-filter="owner"><option value="ALL">All owners</option>${owners.map((owner) => `<option ${state.filters.owner === owner ? "selected" : ""}>${esc(owner)}</option>`).join("")}</select></label>
        <label><span>Risk</span><select data-control-filter="risk">${["ALL", "High", "Medium", "Low"].map((risk) => `<option ${state.filters.risk === risk ? "selected" : ""}>${risk === "ALL" ? "All risk" : risk}</option>`).join("")}</select></label>`}
        <button type="button" class="control-filter-clear" data-control-clear-filters ${activeFilters ? "" : "disabled"}>Clear filters</button>
      </div></details>
      <label class="control-sort"><span>Sort</span><select data-control-filter="sort">${clientView ? `<option value="number" ${state.filters.sort !== "progress" ? "selected" : ""}>Job number</option><option value="progress" ${state.filters.sort === "progress" ? "selected" : ""}>Progress</option>` : `<option value="due" ${state.filters.sort === "due" ? "selected" : ""}>Next due</option><option value="stage_age" ${state.filters.sort === "stage_age" ? "selected" : ""}>Days in stage</option><option value="risk" ${state.filters.sort === "risk" ? "selected" : ""}>Risk</option><option value="progress" ${state.filters.sort === "progress" ? "selected" : ""}>Progress</option><option value="number" ${state.filters.sort === "number" ? "selected" : ""}>Job number</option>`}</select></label>
      <span class="control-result-count"><strong>${rows.length}</strong> of ${all.length}</span>
      ${canExport() ? `<button type="button" class="control-icon-button" data-control-export title="Export updated project register" aria-label="Export updated project register">${icon("download")}</button>` : ""}
    </div>`;
  }

  function renderJobTable(rows) {
    if (!rows.length) return `<div class="control-state compact">${icon("folder-search")}<strong>No jobs match this queue</strong><span>Change the active filters or import a project register.</span></div>`;
    const clientView = currentRole().id === "client"; const finance = canFinance();
    return `<div class="control-table-wrap"><table class="control-table ${finance ? "has-finance" : "no-finance"}"><thead><tr>
      <th>Job</th><th>Client / site</th><th>Current stage</th><th>${clientView ? "Delivery status" : "Next action"}</th><th>Delivery</th><th>${clientView ? "Project status" : "Attention"}</th>${finance && !clientView ? "<th>Commercial</th>" : ""}<th><span class="sr-only">Open</span></th>
      </tr></thead><tbody>${rows.map(renderJobRow).join("")}</tbody></table></div>
      <div class="control-job-cards">${rows.map(renderJobCard).join("")}</div>`;
  }

  function renderJobRow(job) {
    const summary = jobSummary(job); const display = jobDisplay(job); const due = dueState(display.due); const blocker = job.blockingReason;
    const clientView = currentRole().id === "client"; const finance = canFinance(job);
    return `<tr data-control-job-row="${attr(job.id)}" class="${summary.overdueDays ? "overdue" : ""}">
      <td><button type="button" class="control-job-link" data-control-job="${attr(job.id)}" data-project-open="${attr(job.projectId || job.id)}"><strong>${esc(job.jobNumber || "Unnumbered")}</strong><span>${esc(job.projectName || "Unnamed job")}</span></button><small>${esc(job.projectType)}</small></td>
      <td><strong>${esc(job.client || "-")}</strong><span>${esc(job.siteAddress || "Site not entered")}</span></td>
      <td><span class="control-stage">${esc(display.stage)}</span><small>${summary.daysInStage} day${summary.daysInStage === 1 ? "" : "s"} in stage</small></td>
      <td>${clientView ? `<strong>Project delivery</strong><span>${esc(display.stage)}</span><small>Status updated ${esc(formatDate(job.updatedAt))}</small>` : `<strong class="control-owner">${avatar(display.owner)}${esc(display.owner)}</strong><span>${esc(display.action)}</span><small class="control-due ${due.className}">${esc(due.label)}</small>`}</td>
      <td>${rowProgress(summary, finance)}</td>
      <td>${clientView ? `<span class="control-clear">${icon("circle-check")}Status available</span>` : blocker ? `<span class="control-blocker">${icon("octagon-pause")}${esc(job.blockingCategory || "Blocked")}</span><small>${esc(blocker)}</small><span class="control-risk ${summary.risk.toLowerCase()}">${esc(summary.risk)} risk</span>` : `<span class="control-risk ${summary.risk.toLowerCase()}">${esc(summary.risk)} risk</span>`}</td>
      ${finance && !clientView ? `<td><span class="control-invoice ${Core.slug(job.invoiceStatus)}">${esc(job.invoiceStatus)}</span><small>${job.invoiceNumber ? esc(job.invoiceNumber) : "No invoice number"}${job.invoiceAmount != null ? ` / ${currency(job.invoiceAmount)}` : ""}</small></td>` : ""}
      <td><button type="button" class="control-icon-button" data-control-job="${attr(job.id)}" data-project-open="${attr(job.projectId || job.id)}" title="Open job control record" aria-label="Open ${attr(job.jobNumber)}">${icon("chevron-right")}</button></td>
    </tr>`;
  }

  function renderJobCard(job) {
    const summary = jobSummary(job); const display = jobDisplay(job); const due = dueState(display.due); const clientView = currentRole().id === "client";
    return `<article class="control-job-card"><button type="button" data-control-job="${attr(job.id)}" data-project-open="${attr(job.projectId || job.id)}"><span><strong>${esc(job.jobNumber || "Unnumbered")}</strong><small>${esc(job.projectType)}</small></span>${icon("chevron-right")}</button><h3>${esc(job.projectName)}</h3><p>${esc(job.client || "Client not entered")} / ${esc(job.siteAddress || "Site not entered")}</p><div class="control-card-stage"><span>${esc(display.stage)}</span>${clientView ? "" : `<b class="control-risk ${summary.risk.toLowerCase()}">${esc(summary.risk)}</b>`}</div>${miniProgress("Overall", summary.overall)}${clientView ? "" : `<dl><div><dt>Owner</dt><dd>${esc(display.owner)}</dd></div><div><dt>Next</dt><dd>${esc(display.action)}</dd></div><div><dt>Due</dt><dd class="${due.className}">${esc(due.label)}</dd></div></dl>`}</article>`;
  }

  function avatar(name) {
    const initials = Core.text(name).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "-";
    return `<i class="control-avatar" aria-hidden="true">${esc(initials)}</i>`;
  }
  function miniProgress(label, value) {
    const percent = Math.round(Number(value) || 0);
    return `<span class="control-progress"><small>${esc(label)}</small><i><b style="width:${Core.clamp(percent, 0, 100)}%"></b></i><strong>${percent}%</strong></span>`;
  }
  function rowProgress(summary, finance) {
    const overall = Math.round(Number(summary.overall) || 0); const technical = Math.round(Number(summary.technical) || 0); const commercial = Math.round(Number(summary.commercial) || 0);
    return `<span class="control-row-progress"><span><small>Overall</small><strong>${overall}%</strong></span><i><b style="width:${Core.clamp(overall, 0, 100)}%"></b></i><small>Technical ${technical}%${finance ? ` / Commercial ${commercial}%` : ""}</small></span>`;
  }
  function dueState(value) {
    const due = Core.toDate(value); const today = Core.toDate(Core.isoDate(new Date()));
    if (!due) return { label: "No due date", className: "missing" };
    const labelDate = due.toLocaleDateString([], { day: "numeric", month: "short" });
    if (due < today) return { label: `${Core.daysBetween(due, today)}d overdue / ${labelDate}`, className: "overdue" };
    if (Core.isoDate(due) === Core.isoDate(today)) return { label: `Due today / ${labelDate}`, className: "today" };
    return { label: `Due ${labelDate}`, className: "" };
  }
  function currency(value) { return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(value) || 0); }

  function renderWorkload() {
    const groups = new Map();
    jobRows().forEach((job) => {
      const owner = job.currentOwner || "Unassigned"; const summary = jobSummary(job);
      if (!groups.has(owner)) groups.set(owner, { owner, jobs: 0, overdue: 0, blocked: 0, high: 0, totalProgress: 0 });
      const item = groups.get(owner); item.jobs += 1; item.overdue += summary.overdueDays > 0 ? 1 : 0; item.blocked += summary.blocked ? 1 : 0; item.high += summary.risk === "High" ? 1 : 0; item.totalProgress += summary.overall;
    });
    const rows = [...groups.values()].sort((a, b) => b.jobs - a.jobs); const max = Math.max(1, ...rows.map((item) => item.jobs));
    return `<section class="control-analysis"><header><div><span class="control-eyebrow">Capacity</span><h2>Owner workload</h2></div><span>${rows.length} active owners</span></header><div class="control-table-wrap"><table class="control-table analysis"><thead><tr><th>Owner</th><th>Active jobs</th><th>Load</th><th>Overdue</th><th>Blocked</th><th>High risk</th><th>Mean progress</th></tr></thead><tbody>${rows.map((item) => `<tr><td><strong class="control-owner">${avatar(item.owner)}${esc(item.owner)}</strong></td><td>${item.jobs}</td><td><span class="control-load"><i><b style="width:${item.jobs / max * 100}%"></b></i></span></td><td class="${item.overdue ? "metric-alert" : ""}">${item.overdue}</td><td class="${item.blocked ? "metric-alert" : ""}">${item.blocked}</td><td class="${item.high ? "metric-alert" : ""}">${item.high}</td><td>${Math.round(item.totalProgress / item.jobs)}%</td></tr>`).join("")}</tbody></table></div></section>`;
  }

  function renderBottlenecks() {
    const jobs = jobRows(); const stageGroups = new Map(); const categoryGroups = new Map();
    jobs.forEach((job) => {
      const summary = jobSummary(job); const stage = summary.currentStage;
      if (!stageGroups.has(stage)) stageGroups.set(stage, { label: stage, count: 0, age: 0, overdue: 0 });
      const item = stageGroups.get(stage); item.count += 1; item.age += summary.daysInStage; item.overdue += summary.overdueDays > 0 ? 1 : 0;
      if (job.blockingReason) {
        const category = job.blockingCategory || "Internal";
        if (!categoryGroups.has(category)) categoryGroups.set(category, { label: category, count: 0, jobs: [] });
        categoryGroups.get(category).count += 1; categoryGroups.get(category).jobs.push(job.jobNumber);
      }
    });
    const stages = [...stageGroups.values()].sort((a, b) => b.count - a.count); const categories = [...categoryGroups.values()].sort((a, b) => b.count - a.count);
    const oldest = jobs.map((job) => ({ job, summary: jobSummary(job) })).sort((a, b) => b.summary.daysInStage - a.summary.daysInStage).slice(0, 8);
    return `<div class="control-analysis-grid"><section class="control-analysis"><header><div><span class="control-eyebrow">Flow</span><h2>Stage bottlenecks</h2></div></header><div class="control-metric-list">${stages.map((item) => `<div><strong>${esc(item.label)}</strong><span>${item.count} jobs / ${Math.round(item.age / item.count)}d mean</span><i><b style="width:${Math.min(100, item.count / Math.max(1, jobs.length) * 100)}%"></b></i><small>${item.overdue} overdue</small></div>`).join("")}</div></section>
      <section class="control-analysis"><header><div><span class="control-eyebrow">Delay source</span><h2>Blocking categories</h2></div></header>${categories.length ? `<div class="control-category-list">${categories.map((item) => `<div><span class="control-blocker">${esc(item.label)}</span><strong>${item.count}</strong><small>${esc(item.jobs.join(", "))}</small></div>`).join("")}</div>` : `<div class="control-state compact">${icon("circle-check")}<strong>No active blockers</strong></div>`}</section>
      <section class="control-analysis wide"><header><div><span class="control-eyebrow">Age</span><h2>Longest time in stage</h2></div></header><div class="control-table-wrap"><table class="control-table analysis"><thead><tr><th>Job</th><th>Stage</th><th>Owner</th><th>Days</th><th>Next action</th></tr></thead><tbody>${oldest.map(({ job, summary }) => `<tr><td><button class="control-job-link inline" data-control-job="${attr(job.id)}" data-project-open="${attr(job.projectId)}">${esc(job.jobNumber)}</button></td><td>${esc(summary.currentStage)}</td><td>${esc(summary.currentOwner)}</td><td class="${summary.daysInStage > Core.stuckThreshold(job) ? "metric-alert" : ""}">${summary.daysInStage}</td><td>${esc(job.nextAction)}</td></tr>`).join("")}</tbody></table></div></section></div>`;
  }

  function renderRoles() {
    const accessCore = root.GeoFlowAccessCore; const roles = accessCore && accessCore.ROLES ? Object.values(accessCore.ROLES) : state.snapshot.roles;
    const policy = accessPolicy();
    return `<section class="control-analysis"><header><div><span class="control-eyebrow">Governance</span><h2>Roles and permissions</h2></div><button type="button" class="control-button" data-control-open-access>${icon("user-cog")}<span>Manage access</span></button></header><div class="control-role-grid">${roles.map((role) => {
      const users = policy && policy.users ? policy.users.filter((user) => user.role === role.id && user.active !== false).length : state.snapshot.users.filter((user) => user.role === role.id && user.active !== false).length;
      return `<article><span class="control-role-rank">${esc(role.scope === "all" ? "Company-wide" : "Assigned projects")}</span><h3>${esc(role.title)}</h3><p>${esc(role.summary || roleHomeLine(role.id))}</p><footer><strong>${users}</strong><span>active user${users === 1 ? "" : "s"}</span><small>${role.permissions && role.permissions.includes("*") ? "Full access" : `${role.permissions && role.permissions.length || 0} permissions`}</small></footer></article>`;
    }).join("")}</div><div class="control-governance-note">${icon("shield-check")}<span>Technical report approval remains independent of administration permissions. Project assignments and record-level access are enforced by the existing GeoFlow policy layer.</span></div></section>`;
  }

  function renderAudit() {
    const visible = new Set(jobRows().map((job) => job.id));
    const rows = state.snapshot.activity_history.filter((item) => visible.has(item.jobId)).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 500);
    const jobs = Object.fromEntries(state.snapshot.jobs.map((job) => [job.id, job]));
    return `<section class="control-analysis"><header><div><span class="control-eyebrow">Traceability</span><h2>Project audit history</h2></div><span>${rows.length} events</span></header><div class="control-table-wrap"><table class="control-table analysis"><thead><tr><th>Time</th><th>Job</th><th>Actor</th><th>Event</th><th>Previous</th><th>New</th><th>Reason</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${esc(formatDateTime(item.at))}</td><td>${esc(jobs[item.jobId]?.jobNumber || item.jobId)}</td><td>${esc(item.actorName || "System")}</td><td><code>${esc(item.action)}</code></td><td>${esc(item.previousValue || "-")}</td><td>${esc(item.newValue || "-")}</td><td>${esc(item.reason || "-")}</td></tr>`).join("") || `<tr><td colspan="7">No audit events in the visible project scope.</td></tr>`}</tbody></table></div></section>`;
  }

  function renderJobDetail(job) {
    const entities = entitiesFor(job.id); const summary = jobSummary(job);
    if (currentRole().id === "client") return renderClientDetail(job, entities, summary);
    const display = jobDisplay(job); const stage = Core.STAGE_BY_ID[display.stageId];
    const canEdit = canManage(job) && !display.capped && job.handoverStatus !== "awaiting_assignment";
    const canAssign = canAssignWorkflow(job);
    return `<main class="control-workspace control-detail" data-control-job-detail="${attr(job.id)}">
      <header class="control-detail-header"><button type="button" class="control-icon-button back" data-control-back title="Back to Control Tower" aria-label="Back to Control Tower">${icon("arrow-left")}</button><div><span class="control-eyebrow">${esc(job.projectType)} / ${esc(job.client)}</span><h1>${esc(job.jobNumber)} / ${esc(job.projectName)}</h1><p>${esc(job.siteAddress)}</p></div><div class="control-header-actions">${renderConnectionStatus()}<button type="button" class="control-button" data-control-workspace="${attr(job.projectId || job.id)}">${icon("folder-open")}<span>Open GeoFlow</span></button><button type="button" class="control-button primary" data-control-open-workflow="${job.handoverStatus === "awaiting_assignment" && canAssign ? "handover" : "tasks"}">${icon(job.handoverStatus === "awaiting_assignment" ? "git-pull-request-arrow" : "list-checks")}<span>${job.handoverStatus === "awaiting_assignment" && canAssign ? "Assign handover" : "Workflow"}</span></button></div></header>
      ${renderTimeline(job, entities.job_stages)}
      <section class="control-action-band ${job.handoverStatus === "awaiting_assignment" ? "handover-ready" : ""}">
        <div><span>Current stage</span><strong>${esc(stage?.title || job.currentStageId)}</strong><small>${summary.daysInStage} day${summary.daysInStage === 1 ? "" : "s"} in stage</small></div>
        ${job.handoverStatus === "awaiting_assignment" ? `<div class="control-action-pending">${icon("user-round-check")}<span><strong>Work complete / PM assignment required</strong><small>${esc(job.handoverNote || "The accountable task owner completed this stage.")} ${job.handoverReadyBy && job.handoverReadyBy.name ? `Updated by ${esc(job.handoverReadyBy.name)}.` : ""}</small></span></div>` : display.capped ? `<div class="control-action-pending scoped">${icon("shield")}<span><strong>Higher-level workflow</strong><small>This role can see project status but not stages or controls above ${esc(stage?.title || display.stage)}.</small></span></div>` : `<form data-control-action-form>
          <label><span>Owner</span><input name="currentOwner" value="${attr(job.currentOwner)}" ${canEdit ? "" : "disabled"}></label>
          <label class="action"><span>Next required action</span><input name="nextAction" value="${attr(job.nextAction)}" ${canEdit ? "" : "disabled"} required></label>
          <label><span>Due</span><input name="nextActionDue" type="date" value="${attr(Core.isoDate(job.nextActionDue))}" ${canEdit ? "" : "disabled"} required></label>
          ${canEdit ? `<button type="submit" class="control-icon-button" title="Save current action" aria-label="Save current action">${icon("save")}</button>` : ""}
        </form>`}
        <div class="control-action-health"><span class="control-risk ${summary.risk.toLowerCase()}">${esc(summary.risk)} risk</span><strong>${summary.overdueDays ? `${summary.overdueDays}d overdue` : summary.blocked ? "Blocked" : "On track"}</strong><small>${esc(summary.reason)}</small></div>
      </section>
      ${state.validationErrors.length ? `<div class="control-validation" role="alert"><div>${icon("circle-alert")}<strong>Workflow update needs attention</strong></div><ul>${state.validationErrors.map((error) => `<li>${esc(error)}</li>`).join("")}</ul></div>` : ""}
      <section class="control-detail-progress"><div>${progressBlock("Overall", summary.overall, "All active workflow stages")}${progressBlock("Technical", summary.technical, "Delivery, QA, engineering and issue")}${canFinance(job) ? progressBlock("Commercial", summary.commercial, "Invoice, payment and closure") : ""}</div><button type="button" data-control-detail-tab="overview">View calculation ${icon("arrow-right")}</button></section>
      <nav class="control-detail-tabs" aria-label="Job control record sections">${DETAIL_TABS.filter(([id]) => id !== "commercial" || canFinance(job)).map(([id, label]) => `<button type="button" class="${state.detailTab === id ? "active" : ""}" data-control-detail-tab="${id}">${esc(label)}</button>`).join("")}</nav>
      <div class="control-detail-body">${renderDetailTab(job, entities, summary, canEdit)}</div>
    </main>`;
  }

  function renderClientDetail(job, entities, summary) {
    const reports = entities.reports.filter((report) => ["approved", "issued"].includes(Core.text(report.status).toLowerCase()));
    const visibleStages = entities.job_stages.filter((record) => Core.STAGE_INDEX[record.stageId] <= Core.STAGE_INDEX.report_issued);
    const visibleStage = Core.STAGE_INDEX[job.currentStageId] > Core.STAGE_INDEX.report_issued ? "Report Issued" : summary.currentStage;
    return `<main class="control-workspace control-detail client" data-control-job-detail="${attr(job.id)}">
      <header class="control-detail-header"><button type="button" class="control-icon-button back" data-control-back title="Back to projects" aria-label="Back to projects">${icon("arrow-left")}</button><div><span class="control-eyebrow">Client project status</span><h1>${esc(job.jobNumber)} / ${esc(job.projectName)}</h1><p>${esc(job.siteAddress)}</p></div><div class="control-header-actions"><button type="button" class="control-button primary" data-control-client-reports="${attr(job.projectId || job.id)}">${icon("file-check-2")}<span>Approved reports</span></button></div></header>
      ${renderTimeline(job, visibleStages)}
      <section class="control-client-summary"><div><span>Current stage</span><strong>${esc(visibleStage)}</strong></div><div><span>Technical progress</span><strong>${Math.round(summary.technical)}%</strong><i><b style="width:${Math.round(summary.technical)}%"></b></i></div><div><span>Approved reports</span><strong>${reports.length}</strong></div><div><span>Last updated</span><strong>${esc(formatDate(job.updatedAt))}</strong></div></section>
      <section class="control-analysis"><header><div><span class="control-eyebrow">Deliverables</span><h2>Approved project reports</h2></div></header>${recordTable(["Report", "Version", "Issued", "Status"], reports.map((report) => [report.title || report.fileName, report.version || "-", formatDate(report.issuedAt || report.updatedAt), report.status]))}</section>
    </main>`;
  }

  function renderTimeline(job, stages) {
    const ordered = stages.sort((a, b) => a.sequence - b.sequence); const count = Math.max(1, ordered.length);
    return `<section class="control-timeline" aria-label="Role-scoped job lifecycle"><div style="--stage-count:${count};--stage-min:${count * 88}px">${ordered.map((record) => {
      const definition = Core.STAGE_BY_ID[record.stageId]; const current = record.stageId === job.currentStageId;
      return `<span class="${record.status} ${current ? "current" : ""}" title="${attr(definition.title)}"><i>${record.status === "complete" ? icon("check") : record.sequence + 1}</i><b>${esc(definition.title)}</b></span>`;
    }).join("")}</div></section>`;
  }

  function progressBlock(label, value, note) {
    const number = Math.round(value || 0);
    return `<div><span>${esc(label)}</span><strong>${number}%</strong><i><b style="width:${number}%"></b></i><small>${esc(note)}</small></div>`;
  }

  function renderDetailTab(job, entities, summary, canEdit) {
    if (state.detailTab === "workflow") return renderWorkflowTab(job, entities, canEdit);
    if (state.detailTab === "scope_field") return renderScopeFieldTab(job, entities);
    if (state.detailTab === "lab") return renderLabTab(entities);
    if (state.detailTab === "reports") return renderReportsTab(entities);
    if (state.detailTab === "commercial") return renderCommercialTab(job, entities, canEdit);
    if (state.detailTab === "activity") return renderActivityTab(job, entities);
    return renderOverviewTab(job, entities, summary, canEdit);
  }

  function renderOverviewTab(job, entities, summary, canEdit) {
    const discrepancy = job.reportedProgress != null && Math.abs(job.reportedProgress - summary.overall) >= 5;
    const visibleBreakdown = summary.breakdown.filter((item) => item.weight > 0 && Core.stageVisibleForRole(currentRole().id, item.stageId));
    return `<div class="control-detail-grid"><section><header><div><span class="control-eyebrow">Status</span><h2>Progress calculation</h2></div>${discrepancy ? `<span class="control-status warning">Imported ${Math.round(job.reportedProgress)}%</span>` : ""}</header><div class="control-breakdown">${visibleBreakdown.map((item) => `<div><span>${esc(item.title)}</span><i><b style="width:${Math.round(item.completion * 100)}%"></b></i><strong>${Math.round(item.completion * 100)}%</strong><small>${item.weight.toFixed(1)}% weight / ${item.contribution.toFixed(1)}% earned</small></div>`).join("")}</div></section>
      <section><header><div><span class="control-eyebrow">Accountability</span><h2>Owner and blocker</h2></div></header><form class="control-form-grid" data-control-health-form>
        <label><span>Risk</span><select name="riskStatus" ${canEdit ? "" : "disabled"}>${["Low", "Medium", "High"].map((risk) => `<option ${summary.risk === risk ? "selected" : ""}>${risk}</option>`).join("")}</select></label>
        <label><span>Blocker category</span><select name="blockingCategory" ${canEdit ? "" : "disabled"}><option value="">No blocker</option>${Core.BLOCKER_CATEGORIES.map((category) => `<option ${job.blockingCategory === category ? "selected" : ""}>${category}</option>`).join("")}</select></label>
        <label class="wide"><span>Blocking reason</span><textarea name="blockingReason" rows="3" ${canEdit ? "" : "disabled"}>${esc(job.blockingReason)}</textarea></label>
        ${canEdit ? `<button class="control-button" type="submit">${icon("save")}<span>Save status</span></button>` : ""}
      </form></section>
      <section class="wide"><header><div><span class="control-eyebrow">Project record</span><h2>Key controls</h2></div></header><dl class="control-facts">${fact("Project manager", job.projectManager)}${fact("Field engineer", job.fieldEngineer)}${fact("Project engineer", job.projectEngineer)}${fact("Reviewer", job.reviewer)}${fact("Admin coordinator", job.adminCoordinator)}${fact("Purchase order", job.purchaseOrder)}${fact("Fieldwork due", formatDate(job.fieldworkDue))}${fact("Report due", formatDate(job.reportDue))}</dl></section>${renderImportedDetails(job)}</div>`;
  }

  function fact(label, value) { return `<div><dt>${esc(label)}</dt><dd>${esc(value || "Not recorded")}</dd></div>`; }

  function importedValue(key, value) {
    if (Array.isArray(value)) return value.join(", ");
    if (/date/i.test(key) && Core.toDate(value)) return formatDate(value);
    return value;
  }

  function renderImportedDetails(job) {
    const client = job.clientDetails || {}; const project = job.projectDetails || {};
    const clientFields = [["Contact", "contactName"], ["Email", "email"], ["Phone", "phone"], ["Client code", "code"], ["Client address", "address"], ["Client job number", "clientJobNumber"]];
    const projectFields = [
      ["STS number", "stsNumber"], ["Codes", "codes"], ["Project date", "projectDate"], ["Date received", "dateReceived"],
      ["Proposal number", "proposalNumber"], ["Location", "location"], ["Latitude", "latitude"], ["Longitude", "longitude"],
      ["Work required", "workRequired"], ["Entered by", "enteredBy"], ["Sample numbers", "sampleNumbers"], ["Sampled by", "sampledBy"],
      ["Fieldwork finish", "sampleOrFieldworkFinishDate"], ["Involved staff", "involvedStaff"], ["LIMS work order", "limsWorkOrderNumber"], ["NATA", "nata"]
    ];
    if (canFinance(job)) projectFields.push(["Quoted rate", "quotedRate"], ["Invoice percentage", "invoicePercentage"], ["Final invoice date", "finalInvoiceDate"]);
    const clientFacts = clientFields.filter(([, key]) => Core.text(client[key])).map(([label, key]) => fact(label, importedValue(key, client[key]))).join("");
    const projectFacts = projectFields.filter(([, key]) => Core.text(project[key])).map(([label, key]) => fact(label, importedValue(key, project[key]))).join("");
    if (!clientFacts && !projectFacts) return "";
    return `<section class="wide control-imported-details"><header><div><span class="control-eyebrow">Source register</span><h2>Client and project details</h2></div><span>${esc(job.importSource && job.importSource.sheetName || "Project record")}</span></header><div>${clientFacts ? `<section><h3>Client</h3><dl class="control-facts">${clientFacts}</dl></section>` : ""}${projectFacts ? `<section><h3>Project</h3><dl class="control-facts">${projectFacts}</dl></section>` : ""}</div></section>`;
  }

  function renderWorkflowTab(job, entities, canEdit) {
    const tasks = entities.job_tasks.slice().sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    const assignable = canAssignWorkflow(job);
    return `<div class="control-workflow-stack">${job.handoverStatus === "awaiting_assignment" ? renderHandoverPanel(job) : ""}<section class="control-detail-section"><header><div><span class="control-eyebrow">Accountable work</span><h2>Tasks and stage handovers</h2></div>${assignable && job.handoverStatus !== "awaiting_assignment" ? `<button type="button" class="control-button" data-control-add-task>${icon("plus")}<span>Add task</span></button>` : ""}</header>
      ${state.addTask && assignable ? renderAddTaskForm(job) : ""}
      <div class="control-task-list">${tasks.map((task) => renderTask(job, task)).join("") || `<div class="control-state compact">No workflow tasks are visible at this role level.</div>`}</div></section></div>`;
  }

  function eligibleOwners(job, roleId) {
    const policy = accessPolicy(); const projectId = job.projectId || job.id; const rows = [];
    const add = (id, name) => { if (Core.text(name) && !rows.some((item) => item.id === id && Core.slug(item.name) === Core.slug(name))) rows.push({ id: Core.text(id), name: Core.text(name) }); };
    (state.snapshot.users || []).filter((user) => user.active !== false && user.role === roleId).forEach((user) => {
      const role = root.GeoFlowAccessCore && root.GeoFlowAccessCore.roleDefinition ? root.GeoFlowAccessCore.roleDefinition(user.role) : { scope: "assigned" };
      const assignment = policy && policy.projectAssignments && policy.projectAssignments[projectId] && policy.projectAssignments[projectId][user.id];
      if (role.scope === "all" || assignment && assignment.active !== false) add(user.id, user.name);
    });
    rawEntitiesFor(job.id).job_assignments.filter((item) => item.active !== false && Core.slug(item.role).includes(Core.slug(roleId))).forEach((item) => add(item.userId, item.userName));
    const names = { admin: job.adminCoordinator, field_engineer: job.fieldEngineer, project_engineer: job.projectEngineer || job.projectManager, engineering_manager: job.reviewer, laboratory_staff: job.laboratoryStaff };
    add("", names[roleId]);
    return rows;
  }

  function ownerField(job, roleId, value, listId) {
    const owners = eligibleOwners(job, roleId);
    return `<label><span>Owner / ${esc(Core.roleTitle(roleId))}</span><input name="ownerName" value="${attr(value || owners[0]?.name || "")}" list="${attr(listId)}" autocomplete="off" required><datalist id="${attr(listId)}">${owners.map((owner) => `<option value="${attr(owner.name)}">${esc(owner.name)}</option>`).join("")}</datalist></label>`;
  }

  function renderAddTaskForm(job) {
    const roleId = Core.ownerRoleForStage(job.currentStageId); const listId = `control-owner-add-${Core.slug(job.id)}`;
    return `<form class="control-task-form expanded" data-control-task-form><label class="action"><span>Required action</span><input name="title" placeholder="Describe the required outcome" required></label>${ownerField(job, roleId, "", listId)}<label><span>Due date</span><input name="dueDate" type="date" value="${attr(job.nextActionDue || Core.addBusinessDays(new Date(), 2))}" required></label><button type="submit" class="control-button primary">${icon("plus")}<span>Add task</span></button><button type="button" class="control-icon-button" data-control-cancel-task aria-label="Cancel">${icon("x")}</button></form>`;
  }

  function renderTask(job, task) {
    const due = dueState(task.dueDate); const complete = task.status === "complete" || Boolean(task.completedAt);
    const mayComplete = canCompleteTask(job, task); const mayManage = canAssignWorkflow(job);
    const editor = state.taskEditor && state.taskEditor.taskId === task.id ? state.taskEditor.mode : "";
    const lab = task.ownerRole === "laboratory_staff";
    return `<article class="control-task ${complete ? "complete" : "open"}" data-control-task-row="${attr(task.id)}"><div class="control-task-status">${icon(complete ? "circle-check-big" : "circle-dashed")}</div><div class="control-task-copy"><strong>${esc(task.title)}</strong><span>${esc(Core.STAGE_BY_ID[task.stageId]?.title || task.stageId)}</span>${complete && task.completionNote ? `<small>${esc(task.completionNote)}</small>` : ""}${task.result ? `<dl><div><dt>Result</dt><dd>${esc(task.result.summary || "Recorded")}</dd></div><div><dt>Reference</dt><dd>${esc(task.result.reference || task.result.fileName || "-")}</dd></div></dl>` : ""}</div><span class="control-owner">${avatar(task.ownerName)}${esc(task.ownerName || Core.roleTitle(task.ownerRole))}</span><small class="control-task-due ${complete ? "complete" : due.className}">${complete ? esc(`Completed ${formatDate(task.completedAt)}`) : esc(due.label)}</small><b class="control-task-state">${complete ? "Complete" : "Open"}</b><div class="control-task-actions">${mayComplete ? `<button type="button" class="control-button primary" data-control-task-action="complete" data-task-id="${attr(task.id)}">${icon(lab ? "file-up" : "check")}<span>${lab ? "Submit result" : "Complete task"}</span></button>` : ""}${!complete && mayManage ? `<button type="button" class="control-icon-button" data-control-task-action="assign" data-task-id="${attr(task.id)}" title="Assign task" aria-label="Assign task">${icon("user-round-cog")}</button>` : ""}${complete && mayManage ? `<button type="button" class="control-icon-button" data-control-reopen-task="${attr(task.id)}" title="Reopen task" aria-label="Reopen task">${icon("rotate-ccw")}</button>` : ""}</div>${editor ? renderTaskEditor(job, task, editor) : ""}</article>`;
  }

  function renderTaskEditor(job, task, mode) {
    if (mode === "assign") {
      const listId = `control-owner-${Core.slug(task.id)}`;
      return `<form class="control-task-editor assign" data-control-task-assign-form data-task-id="${attr(task.id)}">${ownerField(job, task.ownerRole, task.ownerName, listId)}<label class="action"><span>Required action</span><input name="title" value="${attr(task.title)}" required></label><label><span>Due date</span><input name="dueDate" type="date" value="${attr(Core.isoDate(task.dueDate))}" required></label><div><button type="submit" class="control-button primary">${icon("user-check")}<span>Assign</span></button><button type="button" class="control-button" data-control-task-editor-cancel>Cancel</button></div></form>`;
    }
    const lab = task.ownerRole === "laboratory_staff";
    return `<form class="control-task-editor complete" data-control-task-complete-form data-task-id="${attr(task.id)}"><label class="wide"><span>Completion update</span><textarea name="note" rows="2" placeholder="What was completed, checked and handed over?" required></textarea></label>${lab ? `<label class="wide"><span>Result summary</span><textarea name="resultSummary" rows="2" placeholder="Key test outcomes and any qualification" required></textarea></label><label><span>Certificate / result reference</span><input name="resultReference" placeholder="e.g. ALS-260718-44" required></label><label><span>Result attachment</span><input name="resultFile" type="file" accept=".pdf,.csv,.xlsx,.xls"></label>` : ""}<div><button type="submit" class="control-button primary">${icon(lab ? "send" : "check-check")}<span>${lab ? "Submit result" : "Complete and hand over"}</span></button><button type="button" class="control-button" data-control-task-editor-cancel>Cancel</button></div></form>`;
  }

  function renderHandoverPanel(job) {
    const source = rawEntitiesFor(job.id); const next = Core.nextRequiredStage(source.job_stages, job.currentStageId);
    const definition = next && Core.STAGE_BY_ID[next.stageId]; const assignable = canAssignWorkflow(job) && (!next || Core.stageVisibleForRole(currentRole().id, next.stageId));
    if (!assignable) return `<section class="control-handover-panel sent"><div>${icon("send")}</div><span><strong>Handover sent to the Project Manager</strong><small>${esc(job.handoverNote || "The current stage is complete.")} The next accountable task has not been opened yet.</small></span><b>Awaiting assignment</b></section>`;
    const roleId = definition && definition.ownerRole || "admin"; const listId = `control-owner-handover-${Core.slug(job.id)}`;
    const due = definition ? Core.addBusinessDays(new Date(), definition.dueDays) : "";
    return `<section class="control-handover-panel"><header><div><span class="control-eyebrow">Project Manager action</span><h2>${definition ? `Assign ${esc(definition.title)}` : "Close workflow"}</h2><p>${esc(job.handoverNote || "All required work in the current stage is complete.")}</p></div><span class="control-status warning">Awaiting assignment</span></header>${next ? `<form data-control-handover-form>${ownerField(job, roleId, "", listId)}<label class="action"><span>Next required action</span><input name="title" value="${attr(definition.action)}" required></label><label><span>Due date</span><input name="dueDate" type="date" value="${attr(due)}" required></label><button type="submit" class="control-button primary">${icon("git-pull-request-arrow")}<span>Assign and open stage</span></button></form>` : `<button type="button" class="control-button primary" data-control-close-workflow>${icon("archive-check")}<span>Confirm workflow closure</span></button>`}</section>`;
  }

  function renderScopeFieldTab(job, entities) {
    return `<div class="control-detail-grid"><section><header><div><span class="control-eyebrow">Scope</span><h2>Scope items</h2></div><span>${entities.job_scope_items.length}</span></header>${recordTable(["Item", "Quantity", "Status"], entities.job_scope_items.map((item) => [item.name, `${item.quantity || 0} ${item.unit || ""}`, item.status]))}</section>
      <section><header><div><span class="control-eyebrow">Field</span><h2>Activities</h2></div><span>${entities.field_activities.filter((item) => item.status === "complete").length} / ${entities.field_activities.length}</span></header>${recordTable(["Activity", "Reference", "Owner", "Status"], entities.field_activities.map((item) => [item.activityType, item.reference, item.assignedTo || job.fieldEngineer, item.status]))}</section>
      <section class="wide"><header><div><span class="control-eyebrow">Factual records</span><h2>Boreholes and logs</h2></div><span>${entities.boreholes.length}</span></header>${recordTable(["Borehole", "Planned", "Actual", "Intervals", "Review"], entities.boreholes.map((item) => [item.boreholeId, depth(item.plannedDepth), depth(item.actualDepth), item.loggedIntervals, item.reviewStatus]))}</section></div>`;
  }

  function renderLabTab(entities) {
    return `<div class="control-detail-grid"><section><header><div><span class="control-eyebrow">Chain of custody</span><h2>Samples</h2></div><span>${entities.samples.length}</span></header>${recordTable(["Sample", "Location", "Type", "Depth", "Status"], entities.samples.map((item) => [item.sampleId, item.boreholeId, item.sampleType || "-", `${depth(item.from)}-${depth(item.to)}`, item.status]))}</section><section><header><div><span class="control-eyebrow">Laboratory</span><h2>Tests and results</h2></div><span>${entities.lab_tests.length}</span></header>${recordTable(["Test", "Sample", "Lab", "Due", "Status"], entities.lab_tests.map((item) => [item.testType, item.sampleId, item.laboratory || "-", formatDate(item.dueDate), item.status]))}</section></div>`;
  }

  function renderReportsTab(entities) {
    return `<div class="control-detail-grid"><section><header><div><span class="control-eyebrow">Deliverables</span><h2>Reports</h2></div><span>${entities.reports.length}</span></header>${recordTable(["Report", "Version", "Preparer", "Reviewer", "Status"], entities.reports.map((item) => [item.title || item.fileName, item.version || "-", item.preparer || "-", item.reviewer || "-", item.status]))}</section><section><header><div><span class="control-eyebrow">Independent review</span><h2>Review comments</h2></div><span>${entities.review_comments.filter((item) => item.status !== "resolved").length} open</span></header>${recordTable(["Severity", "Comment", "Owner", "Status"], entities.review_comments.map((item) => [item.severity || "Review", item.comment, item.owner || "-", item.status]))}</section></div>`;
  }

  function renderCommercialTab(job, entities, canEdit) {
    if (!canFinance(job)) return `<div class="control-state compact">${icon("lock")}<strong>Commercial access not assigned</strong></div>`;
    return `<div class="control-detail-grid"><section><header><div><span class="control-eyebrow">Commercial</span><h2>Invoice control</h2></div></header><form class="control-form-grid" data-control-commercial-form><label><span>Invoice status</span><select name="invoiceStatus" ${canEdit ? "" : "disabled"}>${["Not requested", "Requested", "Issued", "Paid", "On hold"].map((status) => `<option ${job.invoiceStatus === status ? "selected" : ""}>${status}</option>`).join("")}</select></label><label><span>Invoice number</span><input name="invoiceNumber" value="${attr(job.invoiceNumber)}" ${canEdit ? "" : "disabled"}></label><label><span>Amount (AUD)</span><input name="invoiceAmount" type="number" min="0" step="0.01" value="${job.invoiceAmount == null ? "" : attr(job.invoiceAmount)}" ${canEdit ? "" : "disabled"}></label><label><span>Payment status</span><input name="paymentStatus" value="${attr(job.paymentStatus)}" ${canEdit ? "" : "disabled"}></label>${canEdit ? `<button class="control-button" type="submit">${icon("save")}<span>Save commercial status</span></button>` : ""}</form></section><section><header><div><span class="control-eyebrow">Variations</span><h2>Scope and fee changes</h2></div><span>${entities.variations.length}</span></header>${recordTable(["Variation", "Reason", "Value", "Approval"], entities.variations.map((item) => [item.reference, item.reason, item.amount == null ? "-" : currency(item.amount), item.status]))}</section><section class="wide"><header><div><span class="control-eyebrow">Ledger</span><h2>Invoice history</h2></div></header>${recordTable(["Invoice", "Amount", "Issued", "Payment", "Status"], entities.invoices.map((item) => [item.invoiceNumber, item.amount == null ? "-" : currency(item.amount), formatDate(item.issuedDate), item.paymentStatus, item.status]))}</section></div>`;
  }

  function renderActivityTab(job, entities) {
    const rows = entities.activity_history.slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return `<section class="control-detail-section"><header><div><span class="control-eyebrow">Audit</span><h2>${esc(job.jobNumber)} activity</h2></div><span>${rows.length} events</span></header><ol class="control-activity">${rows.map((item) => `<li><i></i><div><strong>${esc(item.reason || item.action)}</strong><span>${esc(item.actorName || "System")} / ${esc(formatDateTime(item.at))}</span>${item.previousValue || item.newValue ? `<small>${esc(item.previousValue || "-")} ${icon("arrow-right")} ${esc(item.newValue || "-")}</small>` : ""}</div><code>${esc(item.action)}</code></li>`).join("")}</ol></section>`;
  }

  function recordTable(headers, rows) {
    if (!rows.length) return `<div class="control-state compact"><span>No records</span></div>`;
    return `<div class="control-record-table"><table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${esc(value == null || value === "" ? "-" : value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  function depth(value) { return value == null || value === "" ? "-" : `${Number(value).toFixed(2)} m`; }
  function formatDate(value) { const date = Core.toDate(value); return date ? date.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }) : "Not recorded"; }
  function formatDateTime(value) { const date = Core.toDate(value); return date ? date.toLocaleString([], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"; }
  function importProfileLabel(profileId) { return Core.IMPORT_PROFILES[profileId]?.label || "Project register"; }
  function sheetAnalysis(session, sheetName) { return (session.sheetAnalyses || []).find((item) => item.sheetName === sheetName) || null; }

  function renderImport() {
    const session = state.importSession;
    if (!session) return `<section class="control-import"><header><div><span class="control-eyebrow">Data intake</span><h2>Excel import</h2></div><div><button type="button" class="control-button" data-control-template>${icon("download")}<span>Project template</span></button><label class="control-button primary">${icon("file-up")}<span>Select workbook</span><input type="file" data-control-file accept="${attr(WORKBOOK_ACCEPT)}" hidden></label></div></header><div class="control-import-empty"><div>${icon("file-spreadsheet")}<strong>Any common Excel workbook layout</strong><span>GeoFlow scans every worksheet, detects single or multi-row headers and lets you map unfamiliar columns before anything is imported.</span><small>XLSX, XLS, XLSM, XLSB, Excel templates, ODS, CSV, TSV and XML</small></div><dl><div><dt>Workbook detection</dt><dd>All sheets ranked automatically</dd></div><div><dt>Flexible mapping</dt><dd>${Core.PROJECT_COLUMNS.length} project and ${Core.PILE_COLUMNS.length} pile fields</dd></div><div><dt>Source integrity</dt><dd>Unmapped values retained for audit</dd></div></dl></div></section>`;
    const result = session.result;
    const detection = result.detection; const requiredReady = detection.requiredMapped === detection.requiredTotal;
    const confidenceLabel = `${detection.confidence.charAt(0).toUpperCase()}${detection.confidence.slice(1)} confidence`;
    return `<section class="control-import"><header><div><span class="control-eyebrow">${esc(session.fileName)}</span><h2>Workbook import preview</h2><p>${esc(session.sheetName)} / ${esc(importProfileLabel(result.profile))}</p></div><div><label class="control-button">${icon("refresh-cw")}<span>Replace workbook</span><input type="file" data-control-file accept="${attr(WORKBOOK_ACCEPT)}" hidden></label><button type="button" class="control-button primary" data-control-import-commit ${result.accepted.length && !state.importBusy ? "" : "disabled"}>${icon("database-zap")}<span>${state.importBusy ? "Importing" : `Import ${result.accepted.length} accepted`}</span></button></div></header>
      <div class="control-import-controls">
        <label class="sheet"><span>Worksheet</span><select data-control-import-sheet>${session.sheetNames.map((name) => { const analysis = sheetAnalysis(session, name); return `<option value="${attr(name)}" ${session.sheetName === name ? "selected" : ""}>${esc(name)}${analysis ? ` / ${analysis.rowCount} rows / ${analysis.score} matches` : ""}</option>`; }).join("")}</select></label>
        <label><span>Data profile</span><select data-control-import-profile><option value="auto" ${session.profileMode === "auto" ? "selected" : ""}>Auto detect (${esc(importProfileLabel(result.profile))})</option>${Object.values(Core.IMPORT_PROFILES).map((profile) => `<option value="${attr(profile.id)}" ${session.profileMode === profile.id ? "selected" : ""}>${esc(profile.label)}</option>`).join("")}</select></label>
        <label class="header-row"><span>Header row</span><input type="number" min="1" max="${Math.max(1, (session.matrices[session.sheetName] || []).length)}" value="${detection.headerRow + 1}" data-control-import-header></label>
        <button type="button" class="control-button compact" data-control-import-autodetect title="Re-scan this worksheet">${icon("scan-search")}<span>Auto detect</span></button>
        ${result.profile === "project_register" ? `<label><span>Duplicates</span><select data-control-import-duplicates><option value="skip" ${session.duplicateMode === "skip" ? "selected" : ""}>Reject existing jobs</option><option value="update" ${session.duplicateMode === "update" ? "selected" : ""}>Update existing jobs</option></select></label>` : `<label class="target"><span>Target job</span><select data-control-import-job><option value="">Select job</option>${jobRows().map((job) => `<option value="${attr(job.id)}" ${session.targetJobId === job.id ? "selected" : ""}>${esc(job.jobNumber)} / ${esc(job.projectName)}</option>`).join("")}</select></label>`}
        <span class="control-detection ${detection.confidence}"><strong>${esc(confidenceLabel)}</strong><small>Rows ${detection.headerRow + 1}${detection.headerDepth > 1 ? `-${detection.dataStartRow}` : ""} / ${detection.score} mapped / ${detection.requiredMapped} of ${detection.requiredTotal} required</small></span>
      </div>
      ${requiredReady ? "" : `<div class="control-import-notice" role="status">${icon("triangle-alert")}<span><strong>Required fields still need mapping.</strong> Open Column mapping and connect the source headings marked with an asterisk.</span></div>`}
      <section class="control-import-summary"><div class="accepted"><span>Accepted</span><strong>${result.accepted.length}</strong></div><div class="rejected"><span>Rejected</span><strong>${result.rejected.length}</strong></div><div><span>Duplicates</span><strong>${result.duplicates.length}</strong></div><div><span>Total rows</span><strong>${result.rows.length}</strong></div></section>
      ${renderMapping(session)}
      ${renderImportPreview(result)}
    </section>`;
  }

  function renderMapping(session) {
    const detection = session.result.detection; const columns = detection.profile === "pile_schedule" ? Core.PILE_COLUMNS : Core.PROJECT_COLUMNS;
    const mapped = Object.values(detection.mapping).filter((index) => index >= 0).length;
    const unmapped = detection.unmappedHeaders || [];
    return `<details class="control-mapping" ${detection.requiredMapped < detection.requiredTotal ? "open" : ""}><summary>${icon("columns-3")}<span>Column mapping</span><strong>${mapped} / ${columns.length}</strong><small>${unmapped.length} source column${unmapped.length === 1 ? "" : "s"} retained</small>${icon("chevron-down")}</summary><div>${columns.map((column) => `<label><span>${esc(column.label)}${column.required ? " *" : ""}</span><select data-control-map="${attr(column.key)}"><option value="-1">Not mapped</option>${detection.headers.map((header, index) => `<option value="${index}" ${detection.mapping[column.key] === index ? "selected" : ""}>${esc(header || `Column ${index + 1}`)}</option>`).join("")}</select></label>`).join("")}</div>${unmapped.length ? `<footer>${icon("archive")}<span>Unmapped source headings are retained with each imported record: ${esc(unmapped.slice(0, 8).join(", "))}${unmapped.length > 8 ? ` and ${unmapped.length - 8} more` : ""}.</span></footer>` : ""}</details>`;
  }

  function importDisplay(key, value) {
    if (value === null || value === undefined || value === "") return "";
    if (!["pileDiameter", "pileLength", "toePileRl"].includes(key)) return value;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return value;
    return key === "pileDiameter" ? Math.round(numeric).toLocaleString("en-AU") : numeric.toFixed(2);
  }

  function renderImportPreview(result) {
    const project = result.profile === "project_register";
    return `<div class="control-table-wrap import-preview"><table class="control-table"><thead><tr><th>Row</th><th>Status</th>${project ? "<th>Job number</th><th>Project / site</th><th>Client / contact</th><th>Work type</th><th>Stage / owner</th>" : "<th>Pile</th><th>Type</th><th>Diameter</th><th>Length</th><th>Toe RL</th><th>Orientation</th>"}<th>Validation</th></tr></thead><tbody>${result.rows.slice(0, 100).map((row) => {
      const validation = row.errors.length ? row.errors.join(" ") : row.warnings.length ? row.warnings.join(" ") : "Valid";
      if (project) {
        const site = Core.text(row.built.job.siteAddress);
        const siteDetail = Core.slug(site) !== Core.slug(row.input.projectName) ? `<small>${esc(site)}</small>` : "";
        return `<tr class="${row.errors.length ? "rejected" : "accepted"}"><td>${row.sourceRow}</td><td><span class="control-status ${row.errors.length ? "error" : "ready"}">${row.errors.length ? "Rejected" : row.duplicate ? "Update" : "Accepted"}</span></td><td>${esc(row.input.jobNumber)}</td><td>${esc(row.input.projectName)}${siteDetail}</td><td>${esc(row.input.client)}<small>${esc(row.built.job.clientDetails && (row.built.job.clientDetails.contactName || row.built.job.clientDetails.email) || "No contact recorded")}</small></td><td>${esc(row.built.job.projectType)}</td><td>${esc(Core.STAGE_BY_ID[row.built.job.currentStageId]?.title)}<small>${esc(row.built.job.currentOwner)}</small></td><td class="${row.warnings.length && !row.errors.length ? "has-warning" : ""}">${esc(validation)}</td></tr>`;
      }
      return `<tr class="${row.errors.length ? "rejected" : "accepted"}"><td>${row.sourceRow}</td><td><span class="control-status ${row.errors.length ? "error" : "ready"}">${row.errors.length ? "Rejected" : "Accepted"}</span></td><td>${esc(importDisplay("pileNumber", row.input.pileNumber))}</td><td>${esc(importDisplay("pileType", row.input.pileType))}</td><td>${esc(importDisplay("pileDiameter", row.input.pileDiameter))}</td><td>${esc(importDisplay("pileLength", row.input.pileLength))}</td><td>${esc(importDisplay("toePileRl", row.input.toePileRl))}</td><td>${esc(importDisplay("projectionOrientation", row.input.projectionOrientation))}</td><td class="${row.warnings.length && !row.errors.length ? "has-warning" : ""}">${esc(validation)}</td></tr>`;
    }).join("")}</tbody></table>${result.rows.length > 100 ? `<p class="control-preview-note">Showing the first 100 of ${result.rows.length} rows.</p>` : ""}</div>`;
  }

  function canManage(job) {
    const role = currentRole().id; const user = currentUser();
    if (!Core.stageControllableByRole(role, job.currentStageId)) return false;
    if (["director", "engineering_manager"].includes(role)) return true;
    if (role === "project_engineer") return canAccessJob(job);
    if (role === "admin") return Core.ownerRoleForStage(job.currentStageId) === "admin" && canAccessJob(job);
    return role === Core.ownerRoleForStage(job.currentStageId) && canAccessJob(job) && (ownerMatches(job, user) || !job.currentOwnerId);
  }
  function isProjectManager(job) {
    const user = currentUser(); const role = currentRole().id;
    if (["director", "engineering_manager"].includes(role)) return true;
    if (role !== "project_engineer" || !canAccessJob(job)) return false;
    const projectId = job.projectId || job.id; const policy = accessPolicy();
    const assignment = policy && policy.projectAssignments && policy.projectAssignments[projectId] && policy.projectAssignments[projectId][user.id];
    if (assignment && /project manager/i.test(Core.text(assignment.projectRole))) return true;
    if (Core.text(job.projectManagerId) && job.projectManagerId === user.id) return true;
    if (Core.slug(job.projectManager) && Core.slug(job.projectManager) === Core.slug(user.name)) return true;
    const managers = rawEntitiesFor(job.id).job_assignments.filter((item) => /project_manager/.test(Core.slug(item.role)));
    if (managers.some((item) => item.userId === user.id || Core.slug(item.userName) === Core.slug(user.name))) return true;
    return !Core.text(job.projectManager) && !managers.length;
  }
  function canAssignWorkflow(job) {
    return isProjectManager(job);
  }
  function canCompleteTask(job, task) {
    const role = currentRole().id; const user = currentUser();
    if (task.status === "complete" || task.completedAt || task.stageId !== job.currentStageId || job.handoverStatus === "awaiting_assignment") return false;
    if (["director", "engineering_manager"].includes(role)) return true;
    if (role !== task.ownerRole || !canAccessJob(job)) return false;
    if (task.ownerId && task.ownerId !== user.id) return false;
    const owner = Core.slug(task.ownerName); const generic = Core.slug(Core.roleTitle(task.ownerRole));
    return !owner || owner === Core.slug(user.name) || owner === generic;
  }

  async function saveJob(job, auditDetail) {
    job.updatedAt = new Date().toISOString();
    const index = state.snapshot.jobs.findIndex((item) => item.id === job.id);
    if (index >= 0) state.snapshot.jobs[index] = job;
    const event = {
      id: Core.uid("audit"), jobId: job.id, taskId: "", stageId: job.currentStageId,
      actorId: currentUser().id, actorName: currentUser().name, at: job.updatedAt,
      action: "job.updated", previousValue: "", newValue: "", reason: auditDetail
    };
    state.snapshot.activity_history.unshift(event);
    await DB.transact({ put: { jobs: [job], activity_history: [event] } });
    if (root.GeoFlowControlLive) root.GeoFlowControlLive.scheduleSync(state.snapshot);
  }

  async function handleActionForm(form) {
    const job = state.snapshot.jobs.find((item) => item.id === state.selectedJobId); if (!job || !canManage(job)) return;
    const data = new FormData(form); const ownerName = Core.text(data.get("currentOwner"));
    const title = Core.text(data.get("nextAction")); const dueDate = Core.isoDate(data.get("nextActionDue"));
    const task = rawEntitiesFor(job.id).job_tasks.find((item) => item.stageId === job.currentStageId && item.status !== "complete" && item.status !== "cancelled");
    const errors = []; if (!ownerName) errors.push("Current owner is required."); if (!title) errors.push("Next required action is required."); if (!dueDate) errors.push("Next action due date is required.");
    if (errors.length) { state.validationErrors = errors; render(); return; }
    if (!task) { state.validationErrors = ["Create a workflow task before assigning the current action."]; state.detailTab = "workflow"; render(); return; }
    await runLiveOperation({ type: "assign_task", projectId: job.projectId || job.id, taskId: task.id, ownerId: ownerIdFor(job, task.ownerRole, ownerName), ownerName, title, dueDate }, "Current action assigned.");
  }

  async function handleHealthForm(form) {
    const job = state.snapshot.jobs.find((item) => item.id === state.selectedJobId); if (!job || !canManage(job)) return;
    const data = new FormData(form); const previous = `${job.riskStatus} / ${job.blockingCategory} / ${job.blockingReason}`;
    job.riskStatus = Core.normaliseRisk(data.get("riskStatus")); job.blockingCategory = Core.normaliseBlockerCategory(data.get("blockingCategory")); job.blockingReason = Core.text(data.get("blockingReason"));
    const blockerId = `${job.id}:blocker:current`; const existing = state.snapshot.blockers.find((item) => item.id === blockerId);
    const puts = { jobs: [job], activity_history: [] }; const deletes = {};
    if (job.blockingReason) {
      const blocker = Object.assign(existing || { id: blockerId, jobId: job.id, openedAt: new Date().toISOString(), createdAt: new Date().toISOString() }, { category: job.blockingCategory || "Internal", reason: job.blockingReason, status: "open", owner: job.currentOwner, updatedAt: new Date().toISOString() });
      if (existing) Object.assign(existing, blocker); else state.snapshot.blockers.push(blocker); puts.blockers = [blocker];
    } else if (existing) { state.snapshot.blockers = state.snapshot.blockers.filter((item) => item.id !== blockerId); deletes.blockers = [blockerId]; }
    await saveJob(job, `Risk or blocker updated from ${previous}`); if (puts.blockers || deletes.blockers) await DB.transact({ put: puts, delete: deletes });
    notify("Risk and blocker status saved.", "success"); render();
  }

  async function handleCommercialForm(form) {
    const job = state.snapshot.jobs.find((item) => item.id === state.selectedJobId); if (!job || !canManage(job)) return;
    const data = new FormData(form); const previous = `${job.invoiceStatus} / ${job.invoiceNumber}`;
    job.invoiceStatus = Core.normaliseInvoiceStatus(data.get("invoiceStatus")); job.invoiceNumber = Core.text(data.get("invoiceNumber")); job.invoiceAmount = Core.numberOrNull(data.get("invoiceAmount")); job.paymentStatus = Core.text(data.get("paymentStatus"));
    const invoice = { id: `${job.id}:invoice:${Core.slug(job.invoiceNumber || "current")}`, jobId: job.id, status: job.invoiceStatus, invoiceNumber: job.invoiceNumber, amount: job.invoiceAmount, paymentStatus: job.paymentStatus, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
    const index = state.snapshot.invoices.findIndex((item) => item.id === invoice.id); if (index >= 0) state.snapshot.invoices[index] = invoice; else state.snapshot.invoices.push(invoice);
    await saveJob(job, `Commercial status changed from ${previous}`); await DB.put("invoices", invoice); notify("Commercial status saved.", "success"); render();
  }

  function ownerIdFor(job, roleId, ownerName) {
    return eligibleOwners(job, roleId).find((owner) => Core.slug(owner.name) === Core.slug(ownerName))?.id || "";
  }

  async function refreshAfterLive() {
    if (root.GeoFlowControlLive && root.GeoFlowControlLive.state && root.GeoFlowControlLive.state.applyQueue) await root.GeoFlowControlLive.state.applyQueue;
    state.snapshot = await DB.loadAll(); state.loaded = true; render();
  }

  async function runLiveOperation(operation, successMessage) {
    if (!root.GeoFlowControlLive) { notify("The shared workflow service is unavailable.", "error"); return false; }
    try {
      await root.GeoFlowControlLive.perform(operation); await refreshAfterLive();
      state.validationErrors = []; if (successMessage) notify(successMessage, "success"); return true;
    } catch (error) {
      state.validationErrors = [error && error.message || "The shared workflow update failed."];
      notify(state.validationErrors[0], "error"); render(); return false;
    }
  }

  async function addTask(form) {
    const job = state.snapshot.jobs.find((item) => item.id === state.selectedJobId); if (!job || !canAssignWorkflow(job)) return;
    const data = new FormData(form); const roleId = Core.ownerRoleForStage(job.currentStageId);
    const title = Core.text(data.get("title")); const ownerName = Core.text(data.get("ownerName")); const dueDate = Core.isoDate(data.get("dueDate"));
    if (!title || !ownerName || !dueDate) { notify("Task action, owner and due date are required.", "error"); return; }
    if (await runLiveOperation({ type: "add_task", projectId: job.projectId || job.id, jobId: job.id, title, ownerId: ownerIdFor(job, roleId, ownerName), ownerName, dueDate }, "Task added to the shared workflow.")) { state.addTask = false; render(); }
  }

  async function completeTask(form) {
    const task = state.snapshot.job_tasks.find((item) => item.id === form.dataset.taskId); const job = task && state.snapshot.jobs.find((item) => item.id === task.jobId);
    if (!task || !job || !canCompleteTask(job, task)) return;
    const data = new FormData(form); let uploaded = { id: "", name: "" };
    const file = form.elements.resultFile && form.elements.resultFile.files && form.elements.resultFile.files[0];
    try { if (file) uploaded = await root.GeoFlowControlLive.uploadLabResult(file, job.projectId || job.id, task.id); }
    catch (error) { notify(error.message, "error"); return; }
    const operation = {
      type: "complete_task", projectId: job.projectId || job.id, taskId: task.id,
      note: Core.text(data.get("note")), resultSummary: Core.text(data.get("resultSummary")),
      resultReference: Core.text(data.get("resultReference")), fileId: uploaded.id, fileName: uploaded.name
    };
    if (await runLiveOperation(operation, task.ownerRole === "laboratory_staff" ? "Laboratory result submitted. Project Manager handover is ready." : "Task completed. Project Manager handover is ready.")) { state.taskEditor = null; render(); }
  }

  async function assignTask(form) {
    const task = state.snapshot.job_tasks.find((item) => item.id === form.dataset.taskId); const job = task && state.snapshot.jobs.find((item) => item.id === task.jobId);
    if (!task || !job || !canAssignWorkflow(job)) return;
    const data = new FormData(form); const ownerName = Core.text(data.get("ownerName"));
    if (await runLiveOperation({ type: "assign_task", projectId: job.projectId || job.id, taskId: task.id, ownerId: ownerIdFor(job, task.ownerRole, ownerName), ownerName, title: Core.text(data.get("title")), dueDate: Core.isoDate(data.get("dueDate")) }, "Task assignment updated.")) { state.taskEditor = null; render(); }
  }

  async function assignHandover(form) {
    const job = state.snapshot.jobs.find((item) => item.id === state.selectedJobId); if (!job || !canAssignWorkflow(job)) return;
    const next = Core.nextRequiredStage(rawEntitiesFor(job.id).job_stages, job.currentStageId); const roleId = next ? Core.ownerRoleForStage(next.stageId) : "admin";
    const data = new FormData(form); const ownerName = Core.text(data.get("ownerName"));
    await runLiveOperation({ type: "assign_handover", projectId: job.projectId || job.id, jobId: job.id, ownerId: ownerIdFor(job, roleId, ownerName), ownerName, title: Core.text(data.get("title")), dueDate: Core.isoDate(data.get("dueDate")) }, next ? `${Core.STAGE_BY_ID[next.stageId].title} opened and assigned.` : "Workflow closed.");
  }

  async function reopenTask(taskId) {
    const task = state.snapshot.job_tasks.find((item) => item.id === taskId); const job = task && state.snapshot.jobs.find((item) => item.id === task.jobId);
    if (!task || !job || !canAssignWorkflow(job)) return;
    if (await runLiveOperation({ type: "reopen_task", projectId: job.projectId || job.id, taskId, note: "Reopened by Project Manager for correction" }, "Task reopened for correction.")) { state.taskEditor = null; render(); }
  }

  async function closeWorkflow() {
    const job = state.snapshot.jobs.find((item) => item.id === state.selectedJobId); if (!job || !canAssignWorkflow(job)) return;
    await runLiveOperation({ type: "assign_handover", projectId: job.projectId || job.id, jobId: job.id }, "Workflow closed.");
  }

  function worksheetMatrix(sheet) {
    const rows = root.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true, blankrows: true });
    let last = rows.length - 1;
    while (last >= 0 && !(rows[last] || []).some((value) => Core.text(value))) last -= 1;
    return rows.slice(0, last + 1);
  }

  function updateSheetAnalysis(session, sheetName, matrix) {
    const analysis = Core.analyseWorkbook({ [sheetName]: matrix })[0];
    const index = session.sheetAnalyses.findIndex((item) => item.sheetName === sheetName);
    if (index >= 0) session.sheetAnalyses[index] = Object.assign({}, analysis, { sheetIndex: index });
  }

  function loadWorkbookMatrix(sourceData, sheetName) {
    const workbook = root.XLSX.read(sourceData, { type: "array", cellDates: true, dense: false, sheets: [sheetName] });
    if (!workbook.Sheets[sheetName]) throw new Error(`${sheetName} could not be read from the workbook.`);
    return worksheetMatrix(workbook.Sheets[sheetName]);
  }

  function workbookCandidateSheets(sheetNames) {
    const names = sheetNames || [];
    const likely = names.filter((name) => /(project|job|proposal|register|schedule|pile|data|import)/i.test(name));
    return (likely.length ? likely : names.slice(0, 8)).slice(0, 12);
  }

  function importSheetPriority(sheetName) {
    const name = Core.slug(sheetName);
    if (name === "project_register") return 160;
    if (/job_request/.test(name)) return 70;
    if (/pile.*schedule|schedule.*pile/.test(name)) return 70;
    if (/proposal/.test(name) && !/dashboard/.test(name)) return 40;
    if (/report/.test(name)) return -20;
    return 0;
  }

  async function selectImportSheet(sheetName) {
    const session = state.importSession;
    if (!session || !session.sheetNames.includes(sheetName) || sheetName === session.sheetName) return;
    const token = (session.loadToken || 0) + 1; session.loadToken = token; state.importBusy = true; render();
    try {
      await new Promise((resolve) => root.setTimeout(resolve, 0));
      const matrix = session.matrices[sheetName] || loadWorkbookMatrix(session.sourceData, sheetName);
      if (state.importSession !== session || session.loadToken !== token) return;
      session.matrices[sheetName] = matrix; updateSheetAnalysis(session, sheetName, matrix);
      session.sheetName = sheetName; session.profileMode = "auto"; session.headerRow = null; session.detection = null;
      rebuildImport();
    } catch (error) { notify(error && error.message || "The selected worksheet could not be read.", "error"); }
    finally {
      if (state.importSession === session && session.loadToken === token) { state.importBusy = false; render(); }
    }
  }

  async function readWorkbook(file) {
    if (!root.XLSX) { notify("Excel reader is unavailable.", "error"); return; }
    if (file.size > 64 * 1024 * 1024) { notify("This workbook is larger than 64 MB. Split it into smaller workbooks before importing.", "error"); return; }
    state.importBusy = true; render();
    try {
      const sourceData = await file.arrayBuffer();
      const inventory = root.XLSX.read(sourceData, { type: "array", bookSheets: true });
      const candidateSheets = workbookCandidateSheets(inventory.SheetNames);
      const previewWorkbook = root.XLSX.read(sourceData, { type: "array", cellDates: true, dense: false, sheetRows: 101, sheets: candidateSheets });
      const previews = Object.fromEntries(candidateSheets.filter((name) => previewWorkbook.Sheets[name]).map((name) => [name, worksheetMatrix(previewWorkbook.Sheets[name])]));
      const sheetAnalyses = Core.analyseWorkbook(previews);
      const best = sheetAnalyses.filter((item) => item.rowCount)
        .sort((a, b) => (b.sheetRank + importSheetPriority(b.sheetName)) - (a.sheetRank + importSheetPriority(a.sheetName)) || a.sheetIndex - b.sheetIndex)[0];
      if (!best) throw new Error("The workbook does not contain any readable worksheet rows.");
      const matrix = loadWorkbookMatrix(sourceData, best.sheetName);
      state.importSession = {
        fileName: file.name, sourceData, matrices: { [best.sheetName]: matrix }, sheetNames: inventory.SheetNames, sheetAnalyses,
        sheetName: best.sheetName, profileMode: "auto", headerRow: null, duplicateMode: "skip",
        targetJobId: "", detection: null, result: null
      };
      updateSheetAnalysis(state.importSession, best.sheetName, matrix);
      rebuildImport();
    } catch (error) {
      const message = error && error.message || "Workbook could not be read.";
      notify(/password|encrypt/i.test(message) ? "Password-protected workbooks must be unlocked before import." : message, "error");
    }
    finally { state.importBusy = false; render(); }
  }

  function rebuildImport() {
    const session = state.importSession; if (!session) return;
    const matrix = session.matrices[session.sheetName] || [];
    let detection = Core.detectImportProfile(matrix, {
      profile: session.profileMode === "auto" ? "" : session.profileMode,
      headerRow: Number.isInteger(session.headerRow) ? session.headerRow : undefined
    });
    const previous = session.detection;
    const sameLayout = previous && previous.profile === detection.profile && previous.headerRow === detection.headerRow &&
      previous.headerDepth === detection.headerDepth && previous.headers.join("|") === detection.headers.join("|");
    if (sameLayout) detection = Core.refreshImportDetection(detection, previous.mapping);
    else detection = Core.refreshImportDetection(detection, detection.mapping);
    session.detection = detection;
    session.result = Core.parseImport(matrix, detection, {
      existingJobNumbers: state.snapshot.jobs.map((job) => job.jobNumber), duplicateMode: session.duplicateMode,
      jobId: session.targetJobId, owner: currentUser().name, now: new Date(),
      fileName: session.fileName, sheetName: session.sheetName
    });
  }

  async function commitImport() {
    const session = state.importSession; if (!session || !session.result.accepted.length) return;
    state.importBusy = true; render();
    try {
      if (session.result.profile === "pile_schedule") {
        const activities = session.result.accepted.map((row) => row.activity); await DB.bulkPut("field_activities", activities);
        const byId = new Map(state.snapshot.field_activities.map((item) => [item.id, item])); activities.forEach((item) => byId.set(item.id, item)); state.snapshot.field_activities = [...byId.values()];
        const job = state.snapshot.jobs.find((item) => item.id === session.targetJobId);
        const event = { id: Core.uid("audit"), jobId: session.targetJobId, taskId: "", stageId: job && job.currentStageId || "", actorId: currentUser().id, actorName: currentUser().name, at: new Date().toISOString(), action: "excel.pile_schedule.imported", previousValue: "", newValue: String(activities.length), reason: `${session.fileName}: ${activities.length} pile activities imported` };
        state.snapshot.activity_history.unshift(event); await DB.put("activity_history", event);
      } else {
        const put = { jobs: [], job_stages: [], job_tasks: [], activity_history: [] };
        const registerOnly = session.result.profile === "project_register" && /register/i.test(session.sheetName) && session.result.accepted.length >= 500;
        session.result.accepted.forEach((row) => {
          const existing = state.snapshot.jobs.find((job) => Core.slug(job.jobNumber) === Core.slug(row.built.job.jobNumber));
          if (existing && session.duplicateMode === "update") {
            const updated = Object.assign({}, existing, row.built.job, {
              id: existing.id, projectId: existing.projectId, createdAt: existing.createdAt, updatedAt: new Date().toISOString(),
              registerOnly: existing.registerOnly === false ? false : registerOnly
            });
            put.jobs.push(updated);
          } else {
            const job = registerOnly ? Object.assign({}, row.built.job, {
              id: Core.registerProjectId(row.built.job.jobNumber), projectId: Core.registerProjectId(row.built.job.jobNumber),
              registerOnly: true, workflowStatus: "register", currentOwnerId: "", currentOwner: "",
              nextAction: "", nextActionDue: "", handoverStatus: ""
            }) : row.built.job;
            put.jobs.push(job);
            if (!registerOnly) { put.job_stages.push(...row.built.stages); put.job_tasks.push(row.built.task); }
          }
          if (!registerOnly) put.activity_history.push({ id: Core.uid("audit"), jobId: existing && session.duplicateMode === "update" ? existing.id : row.built.job.id, taskId: "", stageId: row.built.job.currentStageId, actorId: currentUser().id, actorName: currentUser().name, at: new Date().toISOString(), action: existing ? "excel.job.updated" : "excel.job.imported", previousValue: "", newValue: row.built.job.currentStageId, reason: `${session.fileName}, row ${row.sourceRow}` });
        });
        await DB.transact({ put });
        Object.entries(put).forEach(([store, rows]) => {
          if (!rows.length) return;
          const byId = new Map(state.snapshot[store].map((item) => [item.id, item]));
          rows.forEach((item) => byId.set(item.id, item)); state.snapshot[store] = [...byId.values()];
        });
        if (registerOnly && root.GeoFlowControlLive && root.GeoFlowControlLive.publishDirectory) {
          root.GeoFlowControlLive.publishDirectory(put.jobs).catch(() => notify("The client directory is saved locally and will retry Cloudflare sync when reconnected.", "warning"));
        }
      }
      if (root.GeoFlowControlLive) root.GeoFlowControlLive.scheduleSync(state.snapshot);
      notify(`${session.result.accepted.length} row${session.result.accepted.length === 1 ? "" : "s"} imported and queued for shared sync.`, "success");
      state.importSession = null; state.view = "tower"; setRoute("tower", "", true);
    } catch (error) { notify(error && error.message || "Import failed.", "error"); }
    finally { state.importBusy = false; render(); }
  }

  function exportRegister() {
    if (!canExport()) { notify("Project register export is not assigned to this role.", "error"); return; }
    if (!root.XLSX) { notify("Excel writer is unavailable.", "error"); return; }
    const rows = allJobRows(); const data = [Core.PROJECT_COLUMNS.map((column) => column.label), ...rows.map((job) => {
      const entities = entitiesFor(job.id); return Core.exportRow(job, Core.summariseJob(job, entities.job_stages, entities.job_tasks, new Date()));
    })];
    const sheet = root.XLSX.utils.aoa_to_sheet(data); sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    sheet["!cols"] = Core.PROJECT_COLUMNS.map((column) => ({ wch: Math.min(34, Math.max(12, column.label.length + 2)) }));
    const workbook = root.XLSX.utils.book_new(); root.XLSX.utils.book_append_sheet(workbook, sheet, "Project Control");
    root.XLSX.writeFile(workbook, `STS_GeoFlow_Project_Control_${Core.isoDate(new Date())}.xlsx`);
  }

  function downloadTemplate() {
    if (!root.XLSX) return;
    const sheet = root.XLSX.utils.aoa_to_sheet([Core.PROJECT_COLUMNS.map((column) => column.label), Core.PROJECT_COLUMNS.map(() => "")]);
    sheet["!cols"] = Core.PROJECT_COLUMNS.map((column) => ({ wch: Math.min(34, Math.max(14, column.label.length + 3)) }));
    const workbook = root.XLSX.utils.book_new(); root.XLSX.utils.book_append_sheet(workbook, sheet, "Project Register"); root.XLSX.writeFile(workbook, "STS_GeoFlow_Project_Control_Template.xlsx");
  }

  function bind(host) {
    host.addEventListener("click", clickHandler);
    host.addEventListener("change", changeHandler);
    host.addEventListener("submit", submitHandler);
    const search = host.querySelector("[data-control-search]");
    if (search) search.addEventListener("input", () => { state.search = search.value; render(); const next = page().querySelector("[data-control-search]"); if (next) { next.focus(); next.setSelectionRange(state.search.length, state.search.length); } });
    const clientSearch = host.querySelector("[data-control-client-search]");
    if (clientSearch) clientSearch.addEventListener("input", () => { state.clientSearch = clientSearch.value; state.clientAccessEditor = false; render(); const next = page().querySelector("[data-control-client-search]"); if (next) { next.focus(); next.setSelectionRange(state.clientSearch.length, state.clientSearch.length); } });
    const filters = host.querySelector("[data-control-filters]");
    if (filters) filters.addEventListener("toggle", () => { state.filterOpen = filters.open; });
  }

  function clickHandler(event) {
    const target = event.target;
    const retry = target.closest("[data-control-retry]"); if (retry) { hydrate(true); return; }
    const view = target.closest("[data-control-view-go]"); if (view) { state.view = view.dataset.controlViewGo; state.selectedJobId = ""; state.returnView = ""; state.validationErrors = []; state.filterOpen = false; state.clientAccessEditor = false; root.localStorage.setItem(`sts-control-view:${currentUser().id}`, state.view); setRoute(state.view); render(); return; }
    const clientButton = target.closest("[data-control-client]"); if (clientButton) { state.selectedClientId = clientButton.dataset.controlClient; state.clientMode = "profile"; state.clientAccessEditor = false; render(); return; }
    const clientMode = target.closest("[data-control-client-mode]"); if (clientMode) { state.clientMode = clientMode.dataset.controlClientMode; render(); return; }
    const clientAccessOpen = target.closest("[data-control-client-access-open]"); if (clientAccessOpen) { state.clientAccessEditor = true; state.clientMode = "profile"; render(); return; }
    const clientAccessClose = target.closest("[data-control-client-access-close]"); if (clientAccessClose) { state.clientAccessEditor = false; render(); return; }
    const jobButton = target.closest("[data-control-job]"); if (jobButton) { event.preventDefault(); state.returnView = state.view; state.selectedJobId = jobButton.dataset.controlJob; state.detailTab = "overview"; state.taskEditor = null; state.validationErrors = []; setRoute("tower", state.selectedJobId); render(); return; }
    const back = target.closest("[data-control-back]"); if (back) { state.selectedJobId = ""; state.taskEditor = null; state.validationErrors = []; state.view = state.returnView || state.view || "tower"; state.returnView = ""; setRoute(state.view); render(); return; }
    const detailTab = target.closest("[data-control-detail-tab]"); if (detailTab) { state.detailTab = detailTab.dataset.controlDetailTab; render(); return; }
    const workspace = target.closest("[data-control-workspace]"); if (workspace) { if (typeof pjOpen === "function") pjOpen(workspace.dataset.controlWorkspace); return; }
    const clientReports = target.closest("[data-control-client-reports]"); if (clientReports) { if (typeof pjOpen === "function") { pjOpen(clientReports.dataset.controlClientReports); root.setTimeout(() => root.showTab("preview"), 0); } return; }
    const openWorkflow = target.closest("[data-control-open-workflow]"); if (openWorkflow) { state.detailTab = "workflow"; state.taskEditor = null; render(); root.setTimeout(() => page().querySelector(".control-handover-panel, .control-detail-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); return; }
    const taskAction = target.closest("[data-control-task-action]"); if (taskAction) { state.taskEditor = { taskId: taskAction.dataset.taskId, mode: taskAction.dataset.controlTaskAction }; render(); return; }
    const editorCancel = target.closest("[data-control-task-editor-cancel]"); if (editorCancel) { state.taskEditor = null; render(); return; }
    const reopen = target.closest("[data-control-reopen-task]"); if (reopen) { reopenTask(reopen.dataset.controlReopenTask); return; }
    const closeWorkflowButton = target.closest("[data-control-close-workflow]"); if (closeWorkflowButton) { closeWorkflow(); return; }
    const add = target.closest("[data-control-add-task]"); if (add) { state.addTask = true; render(); return; }
    const cancel = target.closest("[data-control-cancel-task]"); if (cancel) { state.addTask = false; render(); return; }
    const newProject = target.closest("[data-control-new-project]"); if (newProject) { if (typeof renderWizard === "function") renderWizard(); return; }
    const clearFilters = target.closest("[data-control-clear-filters]"); if (clearFilters) { state.filters.type = "ALL"; state.filters.owner = "ALL"; state.filters.risk = "ALL"; render(); return; }
    const exportButton = target.closest("[data-control-export]"); if (exportButton) { exportRegister(); return; }
    const template = target.closest("[data-control-template]"); if (template) { downloadTemplate(); return; }
    const autoDetect = target.closest("[data-control-import-autodetect]"); if (autoDetect && state.importSession) { state.importSession.profileMode = "auto"; state.importSession.headerRow = null; state.importSession.detection = null; rebuildImport(); render(); return; }
    const commit = target.closest("[data-control-import-commit]"); if (commit) { commitImport(); return; }
    const access = target.closest("[data-control-open-access]"); if (access) { if (root.GeoFlowAccess && root.GeoFlowAccess.renderAccessPage) { root.showTab("team"); } return; }
  }

  function changeHandler(event) {
    const control = event.target;
    if (control.matches("[data-control-filter]")) { state.filters[control.dataset.controlFilter] = control.value; render(); return; }
    if (control.matches("[data-control-file]")) { const file = control.files && control.files[0]; if (file) readWorkbook(file); return; }
    const session = state.importSession;
    if (!session) return;
    if (control.matches("[data-control-import-sheet]")) { selectImportSheet(control.value); return; }
    if (control.matches("[data-control-import-profile]")) { session.profileMode = control.value; session.detection = null; rebuildImport(); render(); return; }
    if (control.matches("[data-control-import-header]")) { session.headerRow = Math.max(0, Number(control.value || 1) - 1); session.detection = null; rebuildImport(); render(); return; }
    if (control.matches("[data-control-import-duplicates]")) { session.duplicateMode = control.value; rebuildImport(); render(); return; }
    if (control.matches("[data-control-import-job]")) { session.targetJobId = control.value; rebuildImport(); render(); return; }
    if (control.matches("[data-control-map]")) { session.detection.mapping[control.dataset.controlMap] = Number(control.value); rebuildImport(); render(); }
  }

  function submitHandler(event) {
    const form = event.target;
    if (form.matches("[data-control-client-access-form]")) { event.preventDefault(); saveClientPortalAccess(form); }
    else if (form.matches("[data-control-action-form]")) { event.preventDefault(); handleActionForm(form); }
    else if (form.matches("[data-control-health-form]")) { event.preventDefault(); handleHealthForm(form); }
    else if (form.matches("[data-control-commercial-form]")) { event.preventDefault(); handleCommercialForm(form); }
    else if (form.matches("[data-control-task-form]")) { event.preventDefault(); addTask(form); }
    else if (form.matches("[data-control-task-complete-form]")) { event.preventDefault(); completeTask(form); }
    else if (form.matches("[data-control-task-assign-form]")) { event.preventDefault(); assignTask(form); }
    else if (form.matches("[data-control-handover-form]")) { event.preventDefault(); assignHandover(form); }
  }

  function applyRoute() {
    const route = routeState();
    if (!route.view && !route.jobId) return false;
    state.view = route.view || state.view || "tower"; state.selectedJobId = route.jobId;
    try { if (typeof S !== "undefined") S.activeTab = "projects"; } catch (error) { /* no active app state */ }
    if (root.showTab) root.showTab("projects");
    root.setTimeout(() => { if (route.jobId) setRoute("tower", route.jobId, true); else setRoute(route.view, "", true); render(); }, 0);
    return true;
  }

  function install() {
    if (!document || state.installed) return;
    state.installed = true; restoreViewPreference();
    try { renderProjects = render; } catch (error) { root.renderProjects = render; }
    root.renderProjects = render;
    const previousShowTab = root.showTab;
    if (typeof previousShowTab === "function") {
      root.showTab = function (tab) { previousShowTab(tab); if (tab === "projects") { state.selectedJobId = ""; render(); hydrate(); } };
      try { showTab = root.showTab; } catch (error) { /* global binding unavailable */ }
    }
    root.addEventListener("popstate", () => { const route = routeState(); if (route.view || route.jobId) { state.view = route.view || state.view; state.selectedJobId = route.jobId; render(); } });
    root.addEventListener("hashchange", () => { const route = routeState(); if (route.view || route.jobId) { state.view = route.view || state.view; state.selectedJobId = route.jobId; render(); } });
    root.addEventListener("geoflow:control-connection", (event) => { state.connection = Object.assign({}, state.connection, event.detail || {}); if (state.loaded) render(); });
    root.addEventListener("geoflow:control-live", reloadFromLive);
    root.addEventListener("geoflow:control-directory", reloadFromLive);
    root.addEventListener("geoflow:access-ready", () => { if (root.GeoFlowControlLive && state.loaded) root.GeoFlowControlLive.scheduleSync(state.snapshot); });
    if (!applyRoute()) render();
    hydrate();
  }

  return Object.freeze({ install, hydrate, render, filteredJobs, renderWorkspace, renderJobDetail, exportRegister, state });
});

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GeoFlowAccessCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PERMISSION_GROUPS = Object.freeze([
    { id: "projects", label: "Projects", permissions: [
      ["projects.list", "List projects"], ["projects.view", "View project status"], ["projects.manage", "Manage project setup"], ["projects.assign", "Assign project team"]
    ] },
    { id: "field", label: "Field and logging", permissions: [
      ["field.view", "View field records"], ["field.edit", "Enter and edit field records"], ["photos.upload", "Upload field photos"],
      ["samples.view", "View samples"], ["samples.manage", "Manage samples"], ["laboratory.view", "View laboratory results"], ["laboratory.manage", "Manage laboratory results"]
    ] },
    { id: "engineering", label: "Engineering", permissions: [
      ["scope.view", "View scope"], ["scope.manage", "Manage scope"], ["scope.review", "Review scope variations"],
      ["logs.review", "Review logs"], ["qa.view", "View QA register"], ["tasks.assign", "Assign field tasks"], ["dashboard.performance", "View performance dashboards"]
    ] },
    { id: "reports", label: "Reports", permissions: [
      ["reports.view", "View reports"], ["reports.prepare", "Prepare and generate reports"], ["reports.review", "Review reports"],
      ["reports.approve", "Approve reports"], ["reports.share", "Share approved reports"], ["exports.create", "Create data exports"]
    ] },
    { id: "company", label: "Company controls", permissions: [
      ["team.view", "View project team"], ["users.manage", "Manage users"], ["roles.manage", "Manage role policy"],
      ["settings.manage", "Manage system settings"], ["audit.view", "View access audit"], ["finance.view", "View financial data"], ["tenders.manage", "Manage tenders"]
    ] }
  ]);

  const ALL_PERMISSIONS = Object.freeze(PERMISSION_GROUPS.flatMap((group) => group.permissions.map(([id]) => id)));
  const FIELD_BASE = [
    "projects.list", "projects.view", "field.view", "field.edit", "photos.upload", "samples.view", "samples.manage",
    "scope.view", "dashboard.performance", "team.view"
  ];
  const PROJECT_ENGINEER_BASE = [
    "projects.list", "projects.view", "projects.manage", "projects.assign", "field.view", "field.edit", "photos.upload",
    "samples.view", "samples.manage", "laboratory.view", "scope.view", "scope.manage", "logs.review", "qa.view",
    "tasks.assign", "dashboard.performance", "reports.view", "reports.prepare", "reports.review", "reports.share", "exports.create", "team.view", "audit.view"
  ];

  const ROLES = Object.freeze({
    director: Object.freeze({
      id: "director", title: "Director", rank: 700, scope: "all", colour: "#0A4C3A",
      summary: "Full company, project, financial, tender, user and approval oversight.", permissions: Object.freeze(["*"])
    }),
    engineering_manager: Object.freeze({
      id: "engineering_manager", title: "Engineering Manager", rank: 600, scope: "all", colour: "#285E49",
      summary: "Reviews and approves engineering work across projects and assigns delivery teams.",
      permissions: Object.freeze([...PROJECT_ENGINEER_BASE, "scope.review", "reports.approve", "dashboard.performance"])
    }),
    project_engineer: Object.freeze({
      id: "project_engineer", title: "Project Engineer", rank: 500, scope: "assigned", colour: "#3F6C58",
      summary: "Manages assigned jobs, reviews logs, assigns field work and prepares reports.", permissions: Object.freeze(PROJECT_ENGINEER_BASE)
    }),
    field_engineer: Object.freeze({
      id: "field_engineer", title: "Field Engineer", rank: 400, scope: "assigned", colour: "#587568",
      summary: "Captures boreholes, inspections, samples and photos for assigned projects.", permissions: Object.freeze(FIELD_BASE)
    }),
    laboratory_staff: Object.freeze({
      id: "laboratory_staff", title: "Laboratory Staff", rank: 350, scope: "assigned", colour: "#596B72",
      summary: "Manages assigned samples, laboratory schedules and factual test results.",
      permissions: Object.freeze(["projects.list", "projects.view", "samples.view", "samples.manage", "laboratory.view", "laboratory.manage", "reports.view", "team.view"])
    }),
    client: Object.freeze({
      id: "client", title: "Client", rank: 100, scope: "assigned", colour: "#66716A",
      summary: "Views selected project status and approved reports only.", permissions: Object.freeze(["projects.list", "projects.view", "reports.view"])
    }),
    admin: Object.freeze({
      id: "admin", title: "Admin", rank: 650, scope: "assigned", colour: "#4D6258",
      summary: "Manages users, permissions and system settings without automatic engineering approval rights.",
      permissions: Object.freeze([
        "projects.list", "projects.view", "projects.manage", "projects.assign", "scope.view", "field.view",
        "tasks.assign", "reports.view", "reports.share", "exports.create", "team.view", "users.manage",
        "roles.manage", "settings.manage", "audit.view", "finance.view"
      ])
    })
  });

  const TAB_PERMISSIONS = Object.freeze({
    projects: "projects.list", dashboard: "dashboard.performance", scope: "scope.view", project: "projects.manage",
    boreholes: "field.view", "bh-overview": "field.view", "site-map": "field.view", fieldwork: "field.view",
    soil: "field.view", rock: "field.view", corebox: "field.view", spt: "field.view", dcp: "field.view",
    groundwater: "field.view", photos: "field.view", samples: "samples.view", laboratory: "laboratory.view",
    daily: "field.view", preview: "reports.view", export: "exports.create", qa: "qa.view", validation: "qa.view",
    history: "audit.view", team: "team.view", settings: "settings.manage", documents: "projects.manage"
  });

  const TAB_EDIT_PERMISSIONS = Object.freeze({
    scope: "scope.manage", project: "projects.manage", boreholes: "field.edit", "bh-overview": "field.edit",
    fieldwork: "field.edit", soil: "field.edit", rock: "field.edit", corebox: "field.edit", spt: "field.edit",
    dcp: "field.edit", groundwater: "field.edit", photos: "photos.upload", samples: "samples.manage",
    laboratory: "laboratory.manage", daily: "field.edit", export: "exports.create", team: "projects.assign", settings: "settings.manage"
  });

  function text(value) { return String(value == null ? "" : value).trim(); }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function roleDefinition(roleId) { return ROLES[roleId] || ROLES.client; }
  function permissionLabel(permission) {
    for (const group of PERMISSION_GROUPS) for (const [id, label] of group.permissions) if (id === permission) return label;
    return permission;
  }
  function roleHasPermission(roleId, permission) {
    const permissions = roleDefinition(roleId).permissions;
    return permissions.includes("*") || permissions.includes(permission);
  }

  function normaliseEmail(value) { return text(value).toLowerCase(); }
  function userIdFromEmail(email) {
    const base = normaliseEmail(email).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 46);
    return base ? `u_${base}` : `u_${Math.random().toString(36).slice(2, 10)}`;
  }

  function defaultAccessState(seed) {
    const input = seed || {};
    const name = text(input.name) || "STS Director";
    const email = normaliseEmail(input.email) || "director@sts.local";
    const id = userIdFromEmail(email);
    const now = new Date().toISOString();
    return {
      version: 1,
      enforcement: "local-policy",
      currentUserId: id,
      users: [{ id, name, email, role: "director", active: true, createdAt: now, lastActiveAt: now, permissionAllow: [], permissionDeny: [] }],
      projects: {},
      projectAssignments: {},
      projectResponsibilities: {},
      audit: [{ id: `ae_${Date.now().toString(36)}`, at: now, actorId: id, action: "access.bootstrap", targetType: "organisation", targetId: "sts", detail: "Initial Director access created" }]
    };
  }

  function normaliseAccessState(value, seed) {
    const base = value && typeof value === "object" ? clone(value) : defaultAccessState(seed);
    base.version = 1;
    base.enforcement = text(base.enforcement) || "local-policy";
    base.users = Array.isArray(base.users) ? base.users.filter((user) => user && text(user.id)) : [];
    base.projects = base.projects && typeof base.projects === "object" ? base.projects : {};
    base.projectAssignments = base.projectAssignments && typeof base.projectAssignments === "object" ? base.projectAssignments : {};
    base.projectResponsibilities = base.projectResponsibilities && typeof base.projectResponsibilities === "object" ? base.projectResponsibilities : {};
    base.audit = Array.isArray(base.audit) ? base.audit : [];
    if (!base.users.length) return defaultAccessState(seed);
    base.users.forEach((user) => {
      user.name = text(user.name) || text(user.email) || "Unnamed user";
      user.email = normaliseEmail(user.email);
      user.role = ROLES[user.role] ? user.role : "client";
      user.active = user.active !== false;
      user.permissionAllow = Array.isArray(user.permissionAllow) ? user.permissionAllow.filter((item) => ALL_PERMISSIONS.includes(item)) : [];
      user.permissionDeny = Array.isArray(user.permissionDeny) ? user.permissionDeny.filter((item) => ALL_PERMISSIONS.includes(item)) : [];
    });
    if (!base.users.some((user) => user.id === base.currentUserId && user.active)) base.currentUserId = base.users.find((user) => user.active)?.id || base.users[0].id;
    return base;
  }

  function currentUser(accessState) {
    const state = normaliseAccessState(accessState);
    return state.users.find((user) => user.id === state.currentUserId) || null;
  }

  function effectivePermissions(user) {
    if (!user || user.active === false) return [];
    const base = roleDefinition(user.role).permissions.includes("*") ? ALL_PERMISSIONS.slice() : roleDefinition(user.role).permissions.slice();
    const allow = Array.isArray(user.permissionAllow) ? user.permissionAllow : [];
    const deny = new Set(Array.isArray(user.permissionDeny) ? user.permissionDeny : []);
    return [...new Set([...base, ...allow])].filter((permission) => !deny.has(permission));
  }

  function hasPermission(user, permission) {
    return effectivePermissions(user).includes(permission);
  }

  function projectAssignment(accessState, projectId, userId) {
    const state = accessState || {};
    return state.projectAssignments && state.projectAssignments[projectId] && state.projectAssignments[projectId][userId] || null;
  }

  function canAccessProject(accessState, user, projectId) {
    if (!user || user.active === false || !projectId) return false;
    if (roleDefinition(user.role).scope === "all") return true;
    const assignment = projectAssignment(accessState, projectId, user.id);
    return Boolean(assignment && assignment.active !== false);
  }

  function can(accessState, permission, context) {
    const user = context && context.user || currentUser(accessState);
    if (!hasPermission(user, permission)) return false;
    const projectId = context && context.projectId;
    if (!projectId || permission === "projects.list" || ["users.manage", "roles.manage", "settings.manage"].includes(permission)) return true;
    return canAccessProject(accessState, user, projectId);
  }

  function makeAudit(actorId, action, targetType, targetId, detail, meta) {
    return {
      id: `ae_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(), actorId: text(actorId), action: text(action), targetType: text(targetType),
      targetId: text(targetId), detail: text(detail), meta: meta && typeof meta === "object" ? clone(meta) : undefined
    };
  }

  function appendAudit(accessState, event) {
    const state = normaliseAccessState(accessState);
    state.audit.unshift(event);
    state.audit = state.audit.slice(0, 1000);
    return state;
  }

  function activeDirectorCount(accessState, exceptUserId) {
    return (accessState.users || []).filter((user) => user.active !== false && user.role === "director" && user.id !== exceptUserId).length;
  }

  function upsertUser(accessState, input, actor) {
    const state = normaliseAccessState(accessState);
    const data = input || {};
    const email = normaliseEmail(data.email);
    const name = text(data.name);
    if (!name) throw new Error("User name is required.");
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("A valid email address is required.");
    if (!ROLES[data.role]) throw new Error("A valid role is required.");
    let user = state.users.find((item) => item.id === data.id || item.email === email);
    const now = new Date().toISOString();
    if (user) {
      if (user.role === "director" && data.role !== "director" && activeDirectorCount(state, user.id) < 1) throw new Error("STS GeoFlow must retain at least one active Director.");
      user.name = name; user.email = email; user.role = data.role; user.active = data.active !== false;
      user.permissionAllow = Array.isArray(data.permissionAllow) ? data.permissionAllow : user.permissionAllow || [];
      user.permissionDeny = Array.isArray(data.permissionDeny) ? data.permissionDeny : user.permissionDeny || [];
      user.updatedAt = now;
      state.audit.unshift(makeAudit(actor && actor.id, "user.updated", "user", user.id, `${name} updated as ${roleDefinition(user.role).title}`));
    } else {
      const id = userIdFromEmail(email);
      user = { id, name, email, role: data.role, active: data.active !== false, createdAt: now, updatedAt: now, permissionAllow: [], permissionDeny: [] };
      state.users.push(user);
      state.audit.unshift(makeAudit(actor && actor.id, "user.created", "user", id, `${name} added as ${roleDefinition(user.role).title}`));
    }
    return { state, user: clone(user) };
  }

  function setUserActive(accessState, userId, active, actor) {
    const state = normaliseAccessState(accessState);
    const user = state.users.find((item) => item.id === userId);
    if (!user) throw new Error("User not found.");
    if (!active && user.role === "director" && activeDirectorCount(state, user.id) < 1) throw new Error("The last active Director cannot be deactivated.");
    user.active = Boolean(active); user.updatedAt = new Date().toISOString();
    state.audit.unshift(makeAudit(actor && actor.id, active ? "user.activated" : "user.deactivated", "user", user.id, `${user.name} ${active ? "activated" : "deactivated"}`));
    if (!active && state.currentUserId === user.id) state.currentUserId = state.users.find((item) => item.active && item.id !== user.id)?.id || user.id;
    return state;
  }

  function setProjectAssignment(accessState, projectId, userId, assigned, actor, roleLabel) {
    const state = normaliseAccessState(accessState);
    if (!text(projectId)) throw new Error("Project ID is required.");
    if (!state.users.some((user) => user.id === userId)) throw new Error("User not found.");
    state.projectAssignments[projectId] = state.projectAssignments[projectId] || {};
    if (assigned) {
      state.projectAssignments[projectId][userId] = Object.assign({}, state.projectAssignments[projectId][userId] || {}, { active: true, assignedAt: new Date().toISOString(), assignedBy: actor && actor.id || "", projectRole: text(roleLabel) });
    } else delete state.projectAssignments[projectId][userId];
    state.audit.unshift(makeAudit(actor && actor.id, assigned ? "project.assigned" : "project.unassigned", "project", projectId, `${userId} ${assigned ? "assigned to" : "removed from"} project`, { userId }));
    return state;
  }

  function emptyWorkflow(reportId) {
    return { reportId, status: "Draft", revision: "P01", preparedBy: null, submittedBy: null, reviewedBy: null, approvedBy: null, history: [] };
  }

  function workflowFor(workflows, reportId) {
    const source = workflows && workflows[reportId];
    return source ? Object.assign(emptyWorkflow(reportId), clone(source), { history: Array.isArray(source.history) ? clone(source.history) : [] }) : emptyWorkflow(reportId);
  }

  function transitionPermission(action) {
    if (["prepare", "submit", "withdraw"].includes(action)) return "reports.prepare";
    if (["review", "request_changes"].includes(action)) return "reports.review";
    if (action === "approve") return "reports.approve";
    return "";
  }

  function transitionReport(workflows, reportId, action, user, options) {
    if (!user || user.active === false) throw new Error("An active user is required.");
    const permission = transitionPermission(action);
    if (!permission || !hasPermission(user, permission)) throw new Error(`You do not have permission to ${action.replace("_", " ")} this report.`);
    const collection = clone(workflows || {});
    const flow = workflowFor(collection, reportId);
    const now = new Date().toISOString();
    const note = text(options && options.note);
    const event = { id: `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`, at: now, action, by: user.id, byName: user.name, note };

    if (action === "prepare") {
      if (!["Draft", "Changes requested", "Prepared"].includes(flow.status)) throw new Error(`A ${flow.status} report cannot be prepared.`);
      flow.status = "Prepared"; flow.preparedBy = { id: user.id, name: user.name, at: now }; flow.submittedBy = null; flow.reviewedBy = null; flow.approvedBy = null;
    } else if (action === "submit") {
      if (!["Draft", "Prepared", "Changes requested"].includes(flow.status)) throw new Error(`A ${flow.status} report cannot be submitted.`);
      if (!flow.preparedBy) flow.preparedBy = { id: user.id, name: user.name, at: now };
      if (flow.preparedBy.id !== user.id) throw new Error("Only the report preparer can submit this revision for review.");
      flow.status = "In review"; flow.submittedBy = { id: user.id, name: user.name, at: now }; flow.reviewedBy = null; flow.approvedBy = null;
    } else if (action === "review") {
      if (flow.status !== "In review") throw new Error("The report must be submitted before it can be reviewed.");
      if (flow.preparedBy && flow.preparedBy.id === user.id) throw new Error("Separation of duties: the report preparer cannot review the same revision.");
      flow.status = "Reviewed"; flow.reviewedBy = { id: user.id, name: user.name, at: now }; flow.approvedBy = null;
    } else if (action === "request_changes") {
      if (!["In review", "Reviewed"].includes(flow.status)) throw new Error("Changes can only be requested during review.");
      if (flow.preparedBy && flow.preparedBy.id === user.id) throw new Error("The preparer cannot perform the independent review action.");
      if (!note) throw new Error("A change request must include a reason.");
      flow.status = "Changes requested"; flow.reviewedBy = null; flow.approvedBy = null;
    } else if (action === "approve") {
      if (flow.status !== "Reviewed" || !flow.reviewedBy) throw new Error("The report must complete independent review before approval.");
      if (flow.preparedBy && flow.preparedBy.id === user.id) throw new Error("Separation of duties: the report preparer cannot approve the same revision.");
      if (flow.reviewedBy.id === user.id) throw new Error("Separation of duties: the reviewer and approver must be different people.");
      flow.status = "Approved"; flow.approvedBy = { id: user.id, name: user.name, at: now };
    } else if (action === "withdraw") {
      if (!flow.preparedBy || flow.preparedBy.id !== user.id || !["Prepared", "In review"].includes(flow.status)) throw new Error("Only the preparer can withdraw a prepared or submitted revision.");
      flow.status = "Prepared"; flow.submittedBy = null; flow.reviewedBy = null; flow.approvedBy = null;
    }
    flow.history.unshift(event);
    collection[reportId] = flow;
    return { workflows: collection, workflow: clone(flow), event };
  }

  function availableReportActions(workflow, user) {
    const flow = workflow || emptyWorkflow("");
    const actions = [];
    if (hasPermission(user, "reports.prepare") && ["Draft", "Changes requested", "Prepared"].includes(flow.status)) actions.push("prepare");
    if (hasPermission(user, "reports.prepare") && ["Draft", "Prepared", "Changes requested"].includes(flow.status) && (!flow.preparedBy || flow.preparedBy.id === user.id)) actions.push("submit");
    if (hasPermission(user, "reports.review") && flow.status === "In review" && (!flow.preparedBy || flow.preparedBy.id !== user.id)) actions.push("review", "request_changes");
    if (hasPermission(user, "reports.approve") && flow.status === "Reviewed" && flow.reviewedBy && (!flow.preparedBy || flow.preparedBy.id !== user.id) && flow.reviewedBy.id !== user.id) actions.push("approve");
    return actions;
  }

  return Object.freeze({
    PERMISSION_GROUPS, ALL_PERMISSIONS, ROLES, TAB_PERMISSIONS, TAB_EDIT_PERMISSIONS,
    text, roleDefinition, permissionLabel, roleHasPermission, defaultAccessState, normaliseAccessState,
    currentUser, effectivePermissions, hasPermission, projectAssignment, canAccessProject, can,
    makeAudit, appendAudit, upsertUser, setUserActive, setProjectAssignment,
    emptyWorkflow, workflowFor, transitionPermission, transitionReport, availableReportActions
  });
});

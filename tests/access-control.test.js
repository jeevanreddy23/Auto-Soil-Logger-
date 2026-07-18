const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const access = require("../geologger/geoflow-access-core.js");
const root = path.resolve(__dirname, "..");

function users() {
  return {
    preparer: { id: "u_project", name: "Priya Engineer", email: "priya@sts.test", role: "project_engineer", active: true },
    reviewer: { id: "u_manager", name: "Marcus Manager", email: "marcus@sts.test", role: "engineering_manager", active: true },
    approver: { id: "u_director", name: "Dina Director", email: "dina@sts.test", role: "director", active: true },
    field: { id: "u_field", name: "Faye Field", email: "faye@sts.test", role: "field_engineer", active: true },
    client: { id: "u_client", name: "Chris Client", email: "chris@client.test", role: "client", active: true },
    admin: { id: "u_admin", name: "Alex Admin", email: "alex@sts.test", role: "admin", active: true }
  };
}

function policyFixture() {
  const account = users();
  return access.normaliseAccessState({
    version: 1,
    currentUserId: account.preparer.id,
    users: Object.values(account),
    projectAssignments: {
      p_1: {
        u_project: { active: true },
        u_field: { active: true },
        u_client: { active: true, reportIds: ["report-BH01"] },
        u_admin: { active: true }
      }
    },
    audit: []
  });
}

test("defines the seven STS roles and preserves the requested hierarchy", () => {
  assert.deepEqual(Object.keys(access.ROLES), [
    "director", "engineering_manager", "project_engineer", "field_engineer", "laboratory_staff", "client", "admin"
  ]);
  assert.ok(access.ROLES.director.rank > access.ROLES.engineering_manager.rank);
  assert.ok(access.ROLES.engineering_manager.rank > access.ROLES.project_engineer.rank);
  assert.equal(access.ROLES.director.scope, "all");
  assert.equal(access.ROLES.project_engineer.scope, "assigned");
  assert.equal(access.ROLES.client.scope, "assigned");
});

test("keeps engineering approval and company controls out of field and project roles", () => {
  const account = users();
  assert.equal(access.hasPermission(account.field, "field.edit"), true);
  assert.equal(access.hasPermission(account.field, "photos.upload"), true);
  assert.equal(access.hasPermission(account.field, "reports.approve"), false);
  assert.equal(access.hasPermission(account.field, "finance.view"), false);
  assert.equal(access.hasPermission(account.preparer, "reports.prepare"), true);
  assert.equal(access.hasPermission(account.preparer, "reports.approve"), false);
  assert.equal(access.hasPermission(account.admin, "users.manage"), true);
  assert.equal(access.hasPermission(account.admin, "finance.view"), true);
  assert.equal(access.hasPermission(account.admin, "projects.assign"), true);
  assert.equal(access.hasPermission(account.admin, "reports.approve"), false);
  assert.equal(access.hasPermission(account.client, "field.view"), false);
  assert.equal(access.hasPermission(account.client, "exports.create"), false);
});

test("enforces assigned-project scope independently from feature permission", () => {
  const policy = policyFixture();
  const account = users();
  assert.equal(access.can(policy, "field.edit", { user: account.preparer, projectId: "p_1" }), true);
  assert.equal(access.can(policy, "field.edit", { user: account.preparer, projectId: "p_2" }), false);
  assert.equal(access.can(policy, "reports.view", { user: account.client, projectId: "p_1" }), true);
  assert.equal(access.can(policy, "reports.view", { user: account.client, projectId: "p_2" }), false);
  assert.equal(access.can(policy, "reports.approve", { user: account.reviewer, projectId: "p_99" }), true);
});

test("supports explicit feature exceptions without changing the organisation role", () => {
  const account = users();
  account.field.permissionAllow = ["laboratory.view"];
  account.field.permissionDeny = ["samples.manage"];
  assert.equal(access.hasPermission(account.field, "laboratory.view"), true);
  assert.equal(access.hasPermission(account.field, "samples.manage"), false);
  assert.equal(account.field.role, "field_engineer");
});

test("never permits removal or demotion of the last active Director", () => {
  const state = access.defaultAccessState({ name: "Dina Director", email: "dina@sts.test" });
  const director = state.users[0];
  assert.throws(() => access.setUserActive(state, director.id, false, director), /last active Director/i);
  assert.throws(() => access.upsertUser(state, { id: director.id, name: director.name, email: director.email, role: "admin", active: true }, director), /at least one active Director/i);
});

test("requires prepare, independent review and separate approval in order", () => {
  const account = users();
  let workflows = {};
  let result = access.transitionReport(workflows, "report-BH01", "prepare", account.preparer);
  workflows = result.workflows;
  assert.equal(result.workflow.status, "Prepared");

  result = access.transitionReport(workflows, "report-BH01", "submit", account.preparer);
  workflows = result.workflows;
  assert.equal(result.workflow.status, "In review");
  assert.throws(() => access.transitionReport(workflows, "report-BH01", "review", account.preparer), /preparer cannot review/i);

  result = access.transitionReport(workflows, "report-BH01", "review", account.reviewer);
  workflows = result.workflows;
  assert.equal(result.workflow.status, "Reviewed");
  assert.throws(() => access.transitionReport(workflows, "report-BH01", "approve", account.reviewer), /reviewer and approver must be different/i);

  result = access.transitionReport(workflows, "report-BH01", "approve", account.approver);
  assert.equal(result.workflow.status, "Approved");
  assert.equal(result.workflow.preparedBy.id, account.preparer.id);
  assert.equal(result.workflow.reviewedBy.id, account.reviewer.id);
  assert.equal(result.workflow.approvedBy.id, account.approver.id);
});

test("requires a reason for change requests and clears prior review", () => {
  const account = users();
  let result = access.transitionReport({}, "report-BH02", "prepare", account.preparer);
  result = access.transitionReport(result.workflows, "report-BH02", "submit", account.preparer);
  assert.throws(() => access.transitionReport(result.workflows, "report-BH02", "request_changes", account.reviewer), /include a reason/i);
  result = access.transitionReport(result.workflows, "report-BH02", "request_changes", account.reviewer, { note: "Correct the termination reason." });
  assert.equal(result.workflow.status, "Changes requested");
  assert.equal(result.workflow.reviewedBy, null);
  assert.match(result.workflow.history[0].note, /termination reason/);
});

test("advertises only workflow actions available to the current independent actor", () => {
  const account = users();
  let result = access.transitionReport({}, "report-BH03", "prepare", account.preparer);
  result = access.transitionReport(result.workflows, "report-BH03", "submit", account.preparer);
  assert.deepEqual(access.availableReportActions(result.workflow, account.preparer), []);
  assert.deepEqual(access.availableReportActions(result.workflow, account.reviewer), ["review", "request_changes"]);
});

test("loads access enforcement last and states the server-RLS limitation honestly", () => {
  const html = fs.readFileSync(path.join(root, "geologger", "index.html"), "utf8");
  const integration = fs.readFileSync(path.join(root, "geologger", "geoflow-access.js"), "utf8");
  const reports = fs.readFileSync(path.join(root, "geologger", "geoflow-reports.js"), "utf8");
  const worker = fs.readFileSync(path.join(root, "worker.js"), "utf8");
  assert.ok(html.lastIndexOf('src="geoflow-access.js"') > html.lastIndexOf('src="geoflow-motion.js"'));
  assert.match(integration, /server RLS is not yet active/i);
  assert.match(integration, /data-access-exit-preview/);
  assert.match(integration, /data-access-client-reports/);
  assert.match(reports, /Submit for review/);
  assert.match(reports, /Mark reviewed/);
  assert.match(reports, /access\(\)\.canViewReport/);
  assert.match(html, /X-GeoFlow-Project/);
  assert.match(html, /X-GeoFlow-Record-Key/);
  assert.match(worker, /Cf-Access-Jwt-Assertion/);
  assert.match(worker, /approved_file_locked/);
});

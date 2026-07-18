const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Live = require("../geologger/geoflow-control-live.js");
const root = path.resolve(__dirname, "..");

test("builds project-scoped workflow projections without mixing records between jobs", () => {
  const snapshot = {
    jobs: [
      { id: "job-1", projectId: "p_1", currentStageId: "fieldwork_in_progress" },
      { id: "job-2", projectId: "p_2", currentStageId: "lab_results_pending" }
    ],
    job_stages: [{ id: "s-1", jobId: "job-1" }, { id: "s-2", jobId: "job-2" }],
    job_tasks: [{ id: "t-1", jobId: "job-1" }, { id: "t-2", jobId: "job-2" }],
    job_assignments: [], field_activities: [], boreholes: [], samples: [], lab_tests: [], reports: [],
    review_comments: [], invoices: [], activity_history: []
  };
  const projections = Live.projections(snapshot);
  assert.equal(projections.length, 2);
  assert.deepEqual(projections.find(item => item.projectId === "p_1").job_tasks.map(item => item.id), ["t-1"]);
  assert.deepEqual(projections.find(item => item.projectId === "p_2").job_stages.map(item => item.id), ["s-2"]);
});

test("live client includes resilient WebSocket, polling, offline cache and lab-result upload contracts", () => {
  const source = fs.readFileSync(path.join(root, "geologger", "geoflow-control-live.js"), "utf8");
  const worker = fs.readFileSync(path.join(root, "worker.js"), "utf8");
  const config = JSON.parse(fs.readFileSync(path.join(root, "wrangler.jsonc"), "utf8"));
  assert.match(source, /new WebSocket/);
  assert.match(source, /BroadcastChannel/);
  assert.match(source, /schedulePoll/);
  assert.match(source, /DB\.transact/);
  assert.match(source, /kind: "lab-result"/);
  assert.match(worker, /export class WorkflowCoordinator/);
  assert.match(worker, /ctx\.acceptWebSocket/);
  assert.deepEqual(config.durable_objects.bindings, [{ name: "WORKFLOW", class_name: "WorkflowCoordinator" }]);
  assert.deepEqual(config.migrations[0].new_sqlite_classes, ["WorkflowCoordinator"]);
});

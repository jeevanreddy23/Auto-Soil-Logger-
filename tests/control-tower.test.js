const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Core = require("../geologger/geoflow-control-core.js");
const DB = require("../geologger/geoflow-control-db.js");
const XLSX = require("../geologger/vendor/xlsx.full.min.js");
const root = path.resolve(__dirname, "..");

test("defines the controlled 17-stage lifecycle in the required order", () => {
  assert.equal(Core.STAGES.length, 17);
  assert.deepEqual(Core.STAGES.map((stage) => stage.title), [
    "Job Created", "Scope Reviewed", "Fieldwork Planned", "Fieldwork In Progress", "Fieldwork Completed",
    "Logs In Progress", "Logs Reviewed", "Lab Results Pending", "Engineering Assessment", "Report Drafting",
    "Technical Review", "Client Follow-up", "Report Issued", "Invoice Requested", "Invoice Issued",
    "Payment Follow-up", "Job Closed"
  ]);
});

test("activates only relevant stages for pile inspections", () => {
  const stages = Core.createStages("job-1", "Pile Inspection", "Fieldwork In Progress", "2026-07-18T00:00:00.000Z");
  const inactive = stages.filter((stage) => stage.status === "not_required").map((stage) => stage.stageId);
  assert.deepEqual(inactive, ["logs_in_progress", "logs_reviewed", "lab_results_pending"]);
  assert.equal(stages.find((stage) => stage.stageId === "fieldwork_in_progress").status, "active");
});

test("redistributes inactive technical weights while retaining the commercial allocation", () => {
  const stages = Core.createStages("job-1", "Pile Inspection", "Job Created", "2026-07-18T00:00:00.000Z");
  const weights = Core.effectiveStageWeights(stages);
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const commercial = Core.STAGES.filter((stage) => Core.GROUPS[stage.group].kind === "commercial")
    .reduce((sum, stage) => sum + weights[stage.id], 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
  assert.ok(Math.abs(commercial - 5) < 1e-9);
  assert.equal(weights.lab_results_pending, 0);
  assert.equal(weights.logs_in_progress, 0);
  assert.ok(weights.fieldwork_in_progress > 20);
});

test("calculates progress from completed work and weights instead of a manual percentage", () => {
  const stages = Core.createStages("job-1", "Geotechnical Investigation", "Fieldwork In Progress", "2026-07-18T00:00:00.000Z");
  stages.find((stage) => stage.stageId === "fieldwork_in_progress").completion = 0.75;
  stages.find((stage) => stage.stageId === "logs_in_progress").status = "pending";
  stages.find((stage) => stage.stageId === "logs_in_progress").completion = 0.3;
  stages.find((stage) => stage.stageId === "logs_reviewed").completion = 0.3;
  const progress = Core.calculateProgress(stages, []);
  assert.equal(progress.overall, 29.5);
  assert.equal(progress.commercial, 0);
  assert.equal(progress.breakdown.find((item) => item.stageId === "fieldwork_in_progress").contribution, 15);
});

test("every imported or locally-created job receives an owner, action and due date", () => {
  const built = Core.makeJob({
    jobNumber: "26-184", projectName: "15 Smith Street", client: "Client", siteAddress: "Parramatta",
    projectType: "Geotechnical Investigation", currentStage: "Logs In Progress"
  }, "2026-07-18T00:00:00.000Z");
  assert.deepEqual(Core.validateNextAction(built.job), []);
  assert.equal(built.job.currentOwner, "Field Engineer");
  assert.equal(built.job.nextAction, "Complete factual logs and field data QA");
  assert.equal(built.task.jobId, built.job.id);
});

test("client project queues retain scoped projects without exposing internal ownership logic", () => {
  const job = { id: "job-1", currentOwnerId: "u_admin", currentOwner: "Admin Coordinator" };
  const client = { id: "u_client", name: "Client Contact" };
  assert.equal(Core.jobInMyWork(job, [], client, "client"), true);
  assert.equal(Core.jobInMyWork(job, [], client, "field_engineer"), false);
  assert.equal(Core.jobInMyWork(job, [{ userId: "u_client" }], client, "field_engineer"), true);
});

test("stage completion validates source records before creating the next handover", () => {
  const built = Core.makeJob({
    id: "job-1", jobNumber: "26-184", projectName: "Smith Street", client: "Client", siteAddress: "Parramatta",
    projectType: "Pile Inspection", currentStage: "Fieldwork In Progress", currentOwner: "Field Engineer",
    nextAction: "Inspect piles", nextActionDue: "2026-07-18"
  }, "2026-07-18T00:00:00.000Z");
  built.task.status = "complete";
  const blocked = Core.completeStage(built.job, built.stages, [built.task], { fieldActivities: [] }, { id: "u-1", name: "Engineer" }, "2026-07-18T01:00:00.000Z");
  assert.equal(blocked.ok, false);
  assert.match(blocked.errors.join(" "), /field activity/i);

  const advanced = Core.completeStage(built.job, built.stages, [built.task], {
    fieldActivities: [{ id: "a-1", jobId: "job-1", status: "complete" }]
  }, { id: "u-1", name: "Engineer" }, "2026-07-18T01:00:00.000Z");
  assert.equal(advanced.ok, true);
  assert.equal(advanced.job.currentStageId, "fieldwork_completed");
  assert.ok(advanced.tasks.some((task) => task.stageId === "fieldwork_completed" && task.status === "open"));
  assert.equal(advanced.audit[0].previousValue, "fieldwork_in_progress");
});

test("task completion pauses the workflow for an accountable Project Manager handover", () => {
  const built = Core.makeJob({
    id: "job-live-1", jobNumber: "26-205", projectName: "Live Flow", client: "Client", siteAddress: "Sydney",
    projectType: "Pile Inspection", currentStage: "Fieldwork In Progress", projectManager: "Priya PM",
    fieldEngineer: "Faye Field", nextAction: "Finish drilling", nextActionDue: "2026-07-20"
  }, "2026-07-18T00:00:00.000Z");
  const completed = Core.completeTaskForHandover(built.job, built.stages, [built.task], built.task.id, {
    note: "Drilling complete; field sheets and samples checked."
  }, { id: "u_field", name: "Faye Field", role: "field_engineer" }, "2026-07-18T03:00:00.000Z");
  assert.equal(completed.ok, true);
  assert.equal(completed.job.currentStageId, "fieldwork_in_progress");
  assert.equal(completed.job.handoverStatus, "awaiting_assignment");
  assert.equal(completed.job.handoverToStageId, "fieldwork_completed");
  assert.equal(completed.job.currentOwner, "Priya PM");
  assert.match(completed.job.nextAction, /Assign Fieldwork Completed/i);
  assert.deepEqual(completed.audit.map((event) => event.action), ["task.completed", "handover.ready"]);
});

test("Project Manager assignment opens the next stage without losing completion history", () => {
  const built = Core.makeJob({
    id: "job-live-2", jobNumber: "26-206", projectName: "Handover", client: "Client", siteAddress: "Sydney",
    projectType: "Pile Inspection", currentStage: "Fieldwork In Progress", projectManager: "Priya PM",
    fieldEngineer: "Faye Field", nextAction: "Finish drilling", nextActionDue: "2026-07-20"
  }, "2026-07-18T00:00:00.000Z");
  const completed = Core.completeTaskForHandover(built.job, built.stages, [built.task], built.task.id, {
    note: "Fieldwork complete."
  }, { id: "u_field", name: "Faye Field", role: "field_engineer" }, "2026-07-18T03:00:00.000Z");
  const assigned = Core.assignHandover(completed.job, completed.stages, completed.tasks, {
    ownerId: "u_field", ownerName: "Faye Field", dueDate: "2026-07-21"
  }, { id: "u_pm", name: "Priya PM", role: "project_engineer" }, "2026-07-18T04:00:00.000Z");
  assert.equal(assigned.ok, true);
  assert.equal(assigned.job.currentStageId, "fieldwork_completed");
  assert.equal(assigned.job.handoverStatus, "");
  assert.equal(assigned.stages.find((stage) => stage.stageId === "fieldwork_in_progress").status, "complete");
  assert.equal(assigned.stages.find((stage) => stage.stageId === "fieldwork_completed").status, "active");
  assert.equal(assigned.tasks.find((task) => task.stageId === "fieldwork_completed").ownerRole, "field_engineer");
  assert.equal(assigned.audit[0].action, "handover.assigned");
});

test("hierarchy limits stage architecture and laboratory completion requires a result record", () => {
  assert.equal(Core.stageVisibleForRole("project_engineer", "technical_review"), true);
  assert.equal(Core.stageVisibleForRole("project_engineer", "client_follow_up"), false);
  assert.equal(Core.stageControllableByRole("project_engineer", "report_drafting"), true);
  assert.equal(Core.stageControllableByRole("project_engineer", "technical_review"), false);
  assert.equal(Core.stageVisibleForRole("field_engineer", "logs_reviewed"), false);
  assert.equal(Core.stageVisibleForRole("engineering_manager", "job_closed"), true);

  const built = Core.makeJob({
    id: "job-lab", jobNumber: "26-207", projectName: "Lab", client: "Client", siteAddress: "Sydney",
    projectType: "Geotechnical Investigation", currentStage: "Lab Results Pending", laboratoryStaff: "Lab Team",
    nextAction: "Submit classification results", nextActionDue: "2026-07-22"
  }, "2026-07-18T00:00:00.000Z");
  const missing = Core.completeTaskForHandover(built.job, built.stages, [built.task], built.task.id, {
    note: "Results received."
  }, { id: "u_lab", name: "Lab Team", role: "laboratory_staff" }, "2026-07-18T05:00:00.000Z");
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join(" "), /result summary/i);
  assert.match(missing.errors.join(" "), /certificate or result reference/i);
});

test("detects the real Claymore pile schedule header shape and preserves engineering columns", () => {
  const matrix = [
    ["231 Whale Beach Rd, Whale Beach"],
    ["Pile Number", "Pile Diamater (MM)", "Cover (MM)", "Pile Type", "Toe Of Pile", "Pile Length (M)", "Projection Orientation (Cogged/Straight/ Hooked)"],
    [1, 600, 50, "A", 67, 7.07, "Hook"]
  ];
  const detection = Core.detectImportProfile(matrix);
  assert.equal(detection.profile, "pile_schedule");
  assert.equal(detection.headerRow, 1);
  assert.equal(detection.title, "231 Whale Beach Rd, Whale Beach");
  const parsed = Core.parseImport(matrix, detection, { jobId: "job-1", owner: "Field Engineer" });
  assert.equal(parsed.accepted.length, 1);
  assert.equal(parsed.accepted[0].activity.details.pileDiameter, 600);
  assert.equal(parsed.accepted[0].activity.details.projectionOrientation, "Hook");
});

test("canonical project import maps headers, validates duplicates and never trusts imported progress", () => {
  const matrix = [
    ["Job Number", "Project Name", "Client", "Site Address", "Project Type", "Current Stage", "Progress"],
    ["26-184", "Smith Street", "Client", "15 Smith Street", "DCP Investigation", "Fieldwork", 92]
  ];
  const detection = Core.detectImportProfile(matrix);
  const parsed = Core.parseImport(matrix, detection, { existingJobNumbers: [], now: "2026-07-18" });
  assert.equal(parsed.accepted.length, 1);
  assert.equal(parsed.accepted[0].built.job.reportedProgress, 92);
  assert.notEqual(Core.calculateProgress(parsed.accepted[0].built.stages, [parsed.accepted[0].built.task]).overall, 92);
  const duplicate = Core.parseImport(matrix, detection, { existingJobNumbers: ["26-184"], duplicateMode: "skip" });
  assert.equal(duplicate.rejected.length, 1);
  assert.match(duplicate.rejected[0].errors.join(" "), /duplicate/i);
});

test("scans deep worksheets and ranks the useful sheet instead of assuming the first", () => {
  const cover = [["STS workbook"], ["Prepared for issue"], ["No tabular data on this sheet"]];
  const register = Array.from({ length: 24 }, (_, index) => [index === 0 ? "Project delivery register" : ""]);
  register.push(["Project Code", "Project Title", "Customer Name", "Property Address", "Service Type"]);
  register.push(["26-301", "River Road", "Example Client", "18 River Road", "Geotechnical Investigation"]);
  const detection = Core.detectImportProfile(register);
  assert.equal(detection.headerRow, 24);
  assert.equal(detection.requiredMapped, 5);
  const sheets = Core.analyseWorkbook({ Cover: cover, Delivery: register });
  const best = sheets.sort((a, b) => b.sheetRank - a.sheetRank)[0];
  assert.equal(best.sheetName, "Delivery");
  assert.equal(best.profile, "project_register");
});

test("combines grouped two-row headings before mapping project fields", () => {
  const matrix = [
    ["Project", "", "Client", "Site", "Project"],
    ["Number", "Name", "Name", "Address", "Type"],
    ["26-302", "Harbour Site", "Example Client", "9 Wharf Road", "Pile Inspection"]
  ];
  const detection = Core.detectImportProfile(matrix);
  assert.equal(detection.headerRow, 0);
  assert.equal(detection.headerDepth, 2);
  assert.equal(detection.requiredMapped, 5);
  const parsed = Core.parseImport(matrix, detection, { now: "2026-07-18" });
  assert.equal(parsed.accepted.length, 1);
  assert.equal(parsed.accepted[0].input.projectName, "Harbour Site");
  assert.equal(parsed.accepted[0].sourceRow, 3);
});

test("manual mapping imports unfamiliar layouts and retains every unmapped source value", () => {
  const matrix = [
    ["Internal Ref", "Work Description", "Organisation", "Property", "Discipline", "Legacy Note", "External System ID"],
    ["26-303", "Eastern Creek Warehouse", "Example Client", "1 Industry Drive", "DCP", "Urgent access", 9812]
  ];
  let detection = Core.detectImportProfile(matrix, { profile: "project_register", headerRow: 0 });
  detection = Core.refreshImportDetection(detection, {
    ...Object.fromEntries(Core.PROJECT_COLUMNS.map((column) => [column.key, -1])),
    jobNumber: 0, projectName: 1, client: 2, siteAddress: 3, projectType: 4
  });
  const parsed = Core.parseImport(matrix, detection, { fileName: "legacy.xls", sheetName: "Jobs", now: "2026-07-18" });
  assert.equal(parsed.accepted.length, 1);
  const job = parsed.accepted[0].built.job;
  assert.deepEqual(job.importExtras, { "Legacy Note": "Urgent access", "External System ID": 9812 });
  assert.deepEqual(job.importSource, {
    fileName: "legacy.xls", sheetName: "Jobs", profile: "project_register", headerRow: 1, headerDepth: 1, sourceRow: 2
  });
  assert.match(parsed.accepted[0].warnings[0], /2 unmapped source columns retained/i);
});

test("the bundled workbook reader handles modern, binary, legacy, open and delimited formats", () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Job Number", "Project Name", "Client", "Site Address", "Project Type"],
    ["26-304", "Format Test", "Example Client", "Sydney", "Geotechnical Investigation"]
  ]);
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, "Projects");
  for (const bookType of ["xlsx", "xls", "xlsb", "ods"]) {
    const payload = XLSX.write(workbook, { type: "buffer", bookType });
    const reopened = XLSX.read(payload, { type: "buffer" });
    assert.equal(XLSX.utils.sheet_to_json(reopened.Sheets[reopened.SheetNames[0]], { header: 1 })[1][0], "26-304", bookType);
  }
  const csv = XLSX.write(workbook, { type: "string", bookType: "csv" });
  const reopenedCsv = XLSX.read(csv, { type: "string" });
  assert.equal(XLSX.utils.sheet_to_json(reopenedCsv.Sheets[reopenedCsv.SheetNames[0]], { header: 1 })[1][0], "26-304");
  assert.ok([".xlsx", ".xls", ".xlsm", ".xlsb", ".ods", ".csv", ".tsv"].every((extension) => Core.SUPPORTED_WORKBOOK_EXTENSIONS.includes(extension)));
});

test("local database exposes every required control entity as a separate store", () => {
  assert.deepEqual(DB.STORE_NAMES, [
    "users", "roles", "jobs", "job_stages", "job_tasks", "job_assignments", "job_scope_items",
    "field_activities", "boreholes", "samples", "lab_tests", "reports", "review_comments",
    "variations", "invoices", "blockers", "activity_history"
  ]);
});

test("loads the control modules after access and keeps styling scoped and responsive", () => {
  const html = fs.readFileSync(path.join(root, "geologger", "index.html"), "utf8");
  const source = fs.readFileSync(path.join(root, "geologger", "geoflow-control.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "geologger", "geoflow-control.css"), "utf8");
  assert.ok(html.indexOf('src="geoflow-control-core.js"') < html.indexOf('src="geoflow-control.js"'));
  assert.ok(html.indexOf('src="geoflow-access.js"') < html.indexOf('src="geoflow-control.js"'));
  assert.ok(html.indexOf('src="geoflow-control-live.js"') < html.indexOf('src="geoflow-control.js"'));
  assert.match(source, /STS GeoFlow Project Control Tower/);
  assert.match(source, /data-control-import-commit/);
  assert.match(source, /data-control-import-header/);
  assert.match(source, /data-control-import-autodetect/);
  assert.match(source, /Core\.analyseWorkbook/);
  assert.match(source, /data-control-task-complete-form/);
  assert.match(source, /data-control-handover-form/);
  assert.match(source, /runLiveOperation/);
  assert.doesNotMatch(source, /data-control-complete-stage/);
  assert.match(source, /control-view-more/);
  assert.match(source, /control-filter-menu/);
  assert.match(source, /rowProgress/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /control-import-notice/);
  assert.doesNotMatch(css, /font-size\s*:[^;{}]*vw/);
});

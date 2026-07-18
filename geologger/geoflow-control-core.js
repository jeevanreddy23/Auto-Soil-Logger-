(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GeoFlowControlCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;
  const DAY_MS = 86400000;

  const GROUPS = Object.freeze({
    setup_scope: Object.freeze({ id: "setup_scope", label: "Setup and scope", weight: 5, kind: "technical" }),
    field_planning: Object.freeze({ id: "field_planning", label: "Field planning", weight: 5, kind: "technical" }),
    fieldwork: Object.freeze({ id: "fieldwork", label: "Fieldwork", weight: 25, kind: "technical" }),
    logging_qa: Object.freeze({ id: "logging_qa", label: "Logging and field QA", weight: 15, kind: "technical" }),
    laboratory: Object.freeze({ id: "laboratory", label: "Laboratory testing", weight: 10, kind: "technical" }),
    engineering: Object.freeze({ id: "engineering", label: "Engineering interpretation", weight: 10, kind: "technical" }),
    report_drafting: Object.freeze({ id: "report_drafting", label: "Report drafting", weight: 15, kind: "technical" }),
    technical_review: Object.freeze({ id: "technical_review", label: "Technical review", weight: 5, kind: "technical" }),
    client_issue: Object.freeze({ id: "client_issue", label: "Client follow-up and issue", weight: 5, kind: "technical" }),
    commercial: Object.freeze({ id: "commercial", label: "Invoicing and closure", weight: 5, kind: "commercial" })
  });

  const STAGES = Object.freeze([
    stage("job_created", "Job Created", "setup_scope", 1, "admin", "Confirm job details and acceptance", 2),
    stage("scope_reviewed", "Scope Reviewed", "setup_scope", 4, "project_engineer", "Review scope, exclusions and deliverables", 2),
    stage("fieldwork_planned", "Fieldwork Planned", "field_planning", 5, "admin", "Confirm field allocation, access and booking", 3),
    stage("fieldwork_in_progress", "Fieldwork In Progress", "fieldwork", 20, "field_engineer", "Complete the next scheduled field activity", 2),
    stage("fieldwork_completed", "Fieldwork Completed", "fieldwork", 5, "field_engineer", "Confirm field records, samples and demobilisation", 1),
    stage("logs_in_progress", "Logs In Progress", "logging_qa", 10, "field_engineer", "Complete factual logs and field data QA", 3, "logging"),
    stage("logs_reviewed", "Logs Reviewed", "logging_qa", 5, "project_engineer", "Review logs and resolve factual corrections", 2, "logging"),
    stage("lab_results_pending", "Lab Results Pending", "laboratory", 10, "laboratory_staff", "Receive and validate outstanding laboratory results", 5, "laboratory"),
    stage("engineering_assessment", "Engineering Assessment", "engineering", 10, "project_engineer", "Complete engineering interpretation and risk assessment", 3),
    stage("report_drafting", "Report Drafting", "report_drafting", 15, "project_engineer", "Prepare the report for independent review", 4),
    stage("technical_review", "Technical Review", "technical_review", 5, "engineering_manager", "Review and approve the technical report", 3),
    stage("client_follow_up", "Client Follow-up", "client_issue", 2, "project_engineer", "Resolve client information or report comments", 3, "client_follow_up"),
    stage("report_issued", "Report Issued", "client_issue", 3, "admin", "Issue the approved report and record transmittal", 1),
    stage("invoice_requested", "Invoice Requested", "commercial", 1, "admin", "Prepare the invoice request with approved scope changes", 2),
    stage("invoice_issued", "Invoice Issued", "commercial", 1.5, "admin", "Issue the invoice and record its number", 2),
    stage("payment_follow_up", "Payment Follow-up", "commercial", 1.5, "admin", "Monitor payment and follow up when due", 14),
    stage("job_closed", "Job Closed", "commercial", 1, "admin", "Confirm records are retained and close the job", 2)
  ]);

  const STAGE_BY_ID = Object.freeze(Object.fromEntries(STAGES.map((item) => [item.id, item])));
  const STAGE_INDEX = Object.freeze(Object.fromEntries(STAGES.map((item, index) => [item.id, index])));
  const ROLE_STAGE_LIMITS = Object.freeze({
    director: 16,
    admin: 16,
    engineering_manager: 16,
    project_engineer: 10,
    field_engineer: 5,
    laboratory_staff: 7,
    client: 12
  });

  const PROJECT_TYPES = Object.freeze([
    "Geotechnical Investigation", "Pile Inspection", "Footing Inspection", "DCP Investigation",
    "Plate Load", "Pavement", "Groundwater", "Construction Monitoring", "Retaining Wall",
    "Site Classification", "Salinity", "CBR / Pavement"
  ]);

  const PROJECT_TYPE_PROFILES = Object.freeze({
    geotechnical_investigation: profile(true, true, true),
    pile_inspection: profile(false, false, true),
    footing_inspection: profile(false, false, true),
    dcp_investigation: profile(false, false, true),
    plate_load: profile(false, false, true),
    pavement: profile(true, true, true),
    groundwater: profile(true, false, true),
    construction_monitoring: profile(false, false, true),
    retaining_wall: profile(true, true, true),
    site_classification: profile(true, true, true),
    salinity: profile(true, true, true),
    cbr_pavement: profile(true, true, true),
    custom_project: profile(true, false, true)
  });

  const LEGACY_STAGE_MAP = Object.freeze({
    DRAFT: "job_created", "NOT STARTED": "job_created", PLANNING: "scope_reviewed",
    SCHEDULED: "fieldwork_planned", FIELDWORK: "fieldwork_in_progress",
    LOGGING: "logs_in_progress", LAB: "lab_results_pending", LABORATORY: "lab_results_pending",
    "ENGINEERING REVIEW": "engineering_assessment", "REPORT PREPARATION": "report_drafting",
    "REPORT READY": "technical_review", "TECHNICAL REVIEW": "technical_review",
    "CLIENT REVIEW": "client_follow_up", FINAL: "report_issued", ISSUED: "report_issued",
    COMPLETED: "job_closed", ARCHIVED: "job_closed"
  });

  const PROJECT_COLUMNS = Object.freeze([
    column("jobNumber", "Job Number", true, ["job no", "job #", "job id", "job code", "job reference", "project number", "project no", "project id", "project code", "project reference", "sts project number", "reference no"]),
    column("projectName", "Project Name", true, ["job name", "job title", "project title", "site", "site name", "project", "description"]),
    column("client", "Client", true, ["client name", "client organisation", "customer", "customer name", "company", "principal"]),
    column("siteAddress", "Site Address", true, ["address", "project address", "property address", "street address", "site location", "location"]),
    column("projectType", "Project Type", true, ["job type", "service", "service type", "work type", "scope type", "discipline", "investigation type"]),
    column("proposalDate", "Proposal Date", false, ["quote date"]),
    column("acceptanceDate", "Acceptance Date", false, ["accepted date", "award date"]),
    column("purchaseOrder", "Purchase Order", false, ["po", "po number", "purchase order number"]),
    column("projectManager", "Project Manager", false, ["pm", "job manager"]),
    column("fieldEngineer", "Field Engineer", false, ["field staff", "field owner"]),
    column("projectEngineer", "Project Engineer", false, ["engineer", "report writer"]),
    column("reviewer", "Reviewer", false, ["technical reviewer", "engineering manager"]),
    column("adminCoordinator", "Admin Coordinator", false, ["admin", "coordinator"]),
    column("fieldworkStart", "Fieldwork Start", false, ["field start", "site start"]),
    column("fieldworkDue", "Fieldwork Due", false, ["field due", "field completion"]),
    column("reportDue", "Report Due", false, ["draft due", "final report due"]),
    column("currentStage", "Current Stage", false, ["stage", "status", "job status"]),
    column("currentOwner", "Current Owner", false, ["owner", "action owner"]),
    column("progress", "Progress", false, ["overall progress", "% complete"]),
    column("technicalProgress", "Technical Progress", false, ["delivery progress"]),
    column("commercialProgress", "Commercial Progress", false, ["invoice progress"]),
    column("riskStatus", "Risk Status", false, ["risk", "rag"]),
    column("nextAction", "Next Action", false, ["next required action", "action"]),
    column("nextActionDue", "Next Action Due", false, ["action due", "due date", "next due"]),
    column("blockingCategory", "Blocking Category", false, ["blocker category", "delay category"]),
    column("blockingReason", "Blocking Reason", false, ["blocker", "delay reason", "hold reason"]),
    column("invoiceStatus", "Invoice Status", false, ["billing status"]),
    column("invoiceNumber", "Invoice Number", false, ["invoice no", "invoice #"]),
    column("invoiceAmount", "Invoice Amount", false, ["fee", "amount", "invoice value"]),
    column("paymentStatus", "Payment Status", false, ["paid status"]),
    column("lastUpdated", "Last Updated", false, ["updated", "modified"])
  ]);

  const PILE_COLUMNS = Object.freeze([
    column("pileNumber", "Pile Number", true, ["pile no", "pile id", "foundation id", "element number", "element id"]),
    column("pileDiameter", "Pile Diameter (mm)", false, ["pile diamater (mm)", "pile diameter"]),
    column("cover", "Cover (mm)", false, ["cover"]),
    column("cageDiameter", "Cage Diameter (mm)", false, ["cage diameter"]),
    column("topCappingBeam", "Top of Capping Beam", false, []),
    column("cappingBeamThickness", "Capping Beam Thickness", false, []),
    column("topPileRl", "Top of Pile RL", false, ["top of pile rl"]),
    column("toePileRl", "Toe of Pile", false, ["toe of pile", "toe rl"]),
    column("pileLength", "Pile Length (m)", false, ["pile length"]),
    column("projection", "Projection (mm)", false, ["projection"]),
    column("cageLength", "Cage Length Including Projection (m)", false, ["cage length"]),
    column("pileType", "Pile Type", false, ["type"]),
    column("verticalReinforcement", "Vertical Reinforcement", false, ["vert reo"]),
    column("ties", "Ties", false, []),
    column("projectionOrientation", "Projection Orientation", false, ["projection orientation (cogged/straight/ hooked)", "orientation"]),
    column("anchor", "Anchor (Y/N)", false, ["anchor"]),
    column("concrete", "Concrete", false, ["concrete 40mpa", "concrete strength"])
  ]);

  const IMPORT_PROFILES = Object.freeze({
    project_register: Object.freeze({ id: "project_register", label: "Project register", columns: PROJECT_COLUMNS }),
    pile_schedule: Object.freeze({ id: "pile_schedule", label: "Pile schedule", columns: PILE_COLUMNS })
  });

  const SUPPORTED_WORKBOOK_EXTENSIONS = Object.freeze([
    ".xlsx", ".xls", ".xlsm", ".xlsb", ".xltx", ".xltm", ".xlam",
    ".ods", ".fods", ".csv", ".tsv", ".txt", ".xml"
  ]);

  const BLOCKER_CATEGORIES = Object.freeze(["Internal", "Client", "Laboratory", "Weather", "Subcontractor", "Technical"]);

  function stage(id, title, group, baseWeight, ownerRole, action, dueDays, optionalFlag) {
    return Object.freeze({ id, title, group, baseWeight, ownerRole, action, dueDays, optionalFlag: optionalFlag || "" });
  }

  function profile(logging, laboratory, clientFollowUp) {
    return Object.freeze({ logging, laboratory, clientFollowUp });
  }

  function column(key, label, required, aliases) {
    return Object.freeze({ key, label, required: Boolean(required), aliases: Object.freeze(aliases || []) });
  }

  function text(value) { return String(value == null ? "" : value).trim(); }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }
  function uid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
  function slug(value) { return text(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
  function normaliseHeader(value) { return slug(value).replace(/_+/g, "_"); }

  function normaliseProjectType(value) {
    const raw = text(value);
    const key = slug(raw);
    if (/geotech|detailed_site|preliminary_site|foundation_assessment|slope_stability|rock_excavation/.test(key)) return "Geotechnical Investigation";
    if (/pile/.test(key)) return "Pile Inspection";
    if (/footing/.test(key)) return "Footing Inspection";
    if (/dcp|dynamic_cone/.test(key)) return "DCP Investigation";
    if (/plate_load|plt/.test(key)) return "Plate Load";
    if (/cbr/.test(key)) return "CBR / Pavement";
    if (/pavement|proof_rolling|working_platform/.test(key)) return "Pavement";
    if (/groundwater|water_monitor/.test(key)) return "Groundwater";
    if (/construction_monitor/.test(key)) return "Construction Monitoring";
    if (/retaining/.test(key)) return "Retaining Wall";
    if (/site_class|residential/.test(key)) return "Site Classification";
    if (/salinity|acid_sulfate/.test(key)) return "Salinity";
    return PROJECT_TYPES.find((item) => slug(item) === key) || raw || "Geotechnical Investigation";
  }

  function projectProfile(value) {
    const key = slug(normaliseProjectType(value));
    return PROJECT_TYPE_PROFILES[key] || PROJECT_TYPE_PROFILES.custom_project;
  }

  function stageActive(definition, projectType) {
    const config = projectProfile(projectType);
    if (definition.optionalFlag === "logging") return config.logging;
    if (definition.optionalFlag === "laboratory") return config.laboratory;
    if (definition.optionalFlag === "client_follow_up") return config.clientFollowUp;
    return true;
  }

  function normaliseStage(value, projectType) {
    const raw = text(value);
    const legacy = LEGACY_STAGE_MAP[raw.toUpperCase()];
    let id = legacy || STAGES.find((item) => item.id === slug(raw) || item.title.toLowerCase() === raw.toLowerCase())?.id || "job_created";
    if (!stageActive(STAGE_BY_ID[id], projectType)) {
      const index = STAGE_INDEX[id];
      id = STAGES.slice(index + 1).find((item) => stageActive(item, projectType))?.id
        || STAGES.slice(0, index).reverse().find((item) => stageActive(item, projectType))?.id
        || "job_created";
    }
    return id;
  }

  function toDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getTime());
    if (typeof value === "number" && value > 20000 && value < 100000) return new Date(Math.round((value - 25569) * DAY_MS));
    const raw = text(value);
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function isoDate(value) {
    const date = toDate(value);
    return date ? date.toISOString().slice(0, 10) : "";
  }

  function addBusinessDays(value, count) {
    const date = toDate(value) || new Date();
    let remaining = Math.max(0, Number(count) || 0);
    while (remaining > 0) {
      date.setDate(date.getDate() + 1);
      if (date.getDay() !== 0 && date.getDay() !== 6) remaining -= 1;
    }
    return isoDate(date);
  }

  function daysBetween(from, to) {
    const start = toDate(from); const end = toDate(to);
    if (!start || !end) return 0;
    start.setHours(0, 0, 0, 0); end.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((end - start) / DAY_MS));
  }

  function createStages(jobId, projectType, currentStage, now) {
    const currentId = normaliseStage(currentStage, projectType);
    const currentIndex = STAGE_INDEX[currentId];
    return STAGES.map((definition, sequence) => {
      const active = stageActive(definition, projectType);
      let status = "pending";
      if (!active) status = "not_required";
      else if (sequence < currentIndex) status = "complete";
      else if (sequence === currentIndex) status = "active";
      return {
        id: `${jobId}:${definition.id}`, jobId, stageId: definition.id, sequence, status,
        completion: status === "complete" ? 1 : 0,
        startedAt: status === "active" ? (now || new Date().toISOString()) : "",
        completedAt: status === "complete" ? (now || new Date().toISOString()) : "",
        updatedAt: now || new Date().toISOString()
      };
    });
  }

  function effectiveStageWeights(stages) {
    const records = Array.isArray(stages) ? stages : [];
    const byId = Object.fromEntries(records.map((item) => [item.stageId, item]));
    const activeDefs = STAGES.filter((definition) => byId[definition.id]?.status !== "not_required");
    const output = {};
    for (const kind of ["technical", "commercial"]) {
      const defs = STAGES.filter((definition) => GROUPS[definition.group].kind === kind);
      const active = defs.filter((definition) => activeDefs.includes(definition));
      const target = defs.reduce((sum, definition) => sum + definition.baseWeight, 0);
      const denominator = active.reduce((sum, definition) => sum + definition.baseWeight, 0);
      active.forEach((definition) => { output[definition.id] = denominator ? definition.baseWeight * target / denominator : 0; });
      defs.filter((definition) => !active.includes(definition)).forEach((definition) => { output[definition.id] = 0; });
    }
    return output;
  }

  function taskCompletion(task) {
    if (!task || task.status === "cancelled" || task.required === false) return null;
    if (task.status === "complete" || task.completedAt) return 1;
    return clamp(task.progress, 0, 100) / 100;
  }

  function stageCompletion(stageRecord, tasks) {
    if (!stageRecord || stageRecord.status === "not_required") return null;
    if (stageRecord.status === "complete") return 1;
    const required = (tasks || []).filter((task) => task.jobId === stageRecord.jobId && task.stageId === stageRecord.stageId && task.required !== false && task.status !== "cancelled");
    const values = required.map(taskCompletion).filter((value) => value != null);
    if (values.length) return clamp(values.reduce((sum, value) => sum + value, 0) / values.length, 0, 1);
    return clamp(stageRecord.completion, 0, 1);
  }

  function calculateProgress(stages, tasks) {
    const weights = effectiveStageWeights(stages);
    const breakdown = (stages || []).slice().sort((a, b) => (STAGE_INDEX[a.stageId] ?? 999) - (STAGE_INDEX[b.stageId] ?? 999)).map((record) => {
      const definition = STAGE_BY_ID[record.stageId];
      if (!definition) return null;
      const completion = stageCompletion(record, tasks);
      const weight = weights[record.stageId] || 0;
      return {
        stageId: record.stageId, title: definition.title, group: definition.group,
        kind: GROUPS[definition.group].kind, status: record.status,
        completion: completion == null ? 0 : completion, weight,
        contribution: weight * (completion == null ? 0 : completion)
      };
    }).filter(Boolean);
    const overall = breakdown.reduce((sum, item) => sum + item.contribution, 0);
    const technicalWeight = breakdown.filter((item) => item.kind === "technical").reduce((sum, item) => sum + item.weight, 0);
    const technicalContribution = breakdown.filter((item) => item.kind === "technical").reduce((sum, item) => sum + item.contribution, 0);
    const commercialWeight = breakdown.filter((item) => item.kind === "commercial").reduce((sum, item) => sum + item.weight, 0);
    const commercialContribution = breakdown.filter((item) => item.kind === "commercial").reduce((sum, item) => sum + item.contribution, 0);
    return {
      overall: Math.round(overall * 10) / 10,
      technical: technicalWeight ? Math.round(technicalContribution / technicalWeight * 1000) / 10 : 0,
      commercial: commercialWeight ? Math.round(commercialContribution / commercialWeight * 1000) / 10 : 0,
      breakdown
    };
  }

  function ownerRoleForStage(stageId) { return STAGE_BY_ID[stageId]?.ownerRole || "project_engineer"; }
  function visibleStageLimit(roleId) {
    return Object.prototype.hasOwnProperty.call(ROLE_STAGE_LIMITS, roleId) ? ROLE_STAGE_LIMITS[roleId] : ROLE_STAGE_LIMITS.client;
  }
  function stageVisibleForRole(roleId, stageId) {
    return Number.isInteger(STAGE_INDEX[stageId]) && STAGE_INDEX[stageId] <= visibleStageLimit(roleId);
  }
  function stageControllableByRole(roleId, stageId) {
    const index = STAGE_INDEX[stageId];
    if (!Number.isInteger(index)) return false;
    if (roleId === "director") return true;
    if (roleId === "engineering_manager") return index <= STAGE_INDEX.technical_review;
    if (roleId === "project_engineer") return index <= STAGE_INDEX.report_drafting;
    if (roleId === "admin") return ownerRoleForStage(stageId) === "admin";
    return roleId === ownerRoleForStage(stageId) && stageVisibleForRole(roleId, stageId);
  }
  function roleTitle(roleId) {
    return ({
      director: "Director", engineering_manager: "Engineering Manager", project_engineer: "Project Engineer",
      field_engineer: "Field Engineer", laboratory_staff: "Laboratory Staff", client: "Client", admin: "Admin Coordinator"
    })[roleId] || "Project Engineer";
  }

  function ownerForStage(stageId, input) {
    const source = input || {};
    const role = ownerRoleForStage(stageId);
    const candidates = {
      admin: source.adminCoordinator, field_engineer: source.fieldEngineer, project_engineer: source.projectEngineer || source.projectManager,
      engineering_manager: source.reviewer, laboratory_staff: source.laboratoryStaff
    };
    return text(source.currentOwner) || text(candidates[role]) || roleTitle(role);
  }

  function defaultTask(jobId, stageId, input, now) {
    const definition = STAGE_BY_ID[stageId] || STAGES[0];
    const at = now || new Date().toISOString();
    return {
      id: uid("task"), jobId, stageId, title: text(input && input.nextAction) || definition.action,
      ownerId: text(input && input.ownerId), ownerName: ownerForStage(stageId, input), ownerRole: ownerRoleForStage(stageId),
      dueDate: isoDate(input && input.nextActionDue) || addBusinessDays(at, definition.dueDays),
      status: "open", progress: 0, required: true, source: text(input && input.source) || "workflow", createdAt: at, updatedAt: at
    };
  }

  function nextRequiredStage(stages, currentStageId) {
    const currentIndex = STAGE_INDEX[currentStageId];
    if (!Number.isInteger(currentIndex)) return null;
    return (stages || []).filter((record) => record && record.status !== "not_required" && record.status !== "complete"
      && (record.sequence ?? STAGE_INDEX[record.stageId] ?? 999) > currentIndex)
      .sort((left, right) => (left.sequence ?? STAGE_INDEX[left.stageId] ?? 999) - (right.sequence ?? STAGE_INDEX[right.stageId] ?? 999))[0] || null;
  }

  function completeTaskForHandover(jobInput, stagesInput, tasksInput, taskId, details, actor, now) {
    const job = clone(jobInput); const stages = clone(stagesInput || []); const tasks = clone(tasksInput || []);
    const task = tasks.find((item) => item.id === taskId && item.jobId === job.id);
    const at = now || new Date().toISOString(); const input = details || {};
    const errors = [];
    if (!task) errors.push("The workflow task was not found.");
    else if (task.stageId !== job.currentStageId) errors.push("Only a task in the current workflow stage can be completed.");
    else if (task.status === "complete" || task.completedAt) errors.push("The workflow task is already complete.");
    if (!text(input.note)) errors.push("A completion update is required for the handover record.");
    if (task && task.ownerRole === "laboratory_staff") {
      if (!text(input.resultSummary)) errors.push("A laboratory result summary is required.");
      if (!text(input.resultReference)) errors.push("A laboratory certificate or result reference is required.");
    }
    if (errors.length) return { ok: false, errors, job, stages, tasks, audit: [] };

    task.status = "complete"; task.progress = 100; task.completedAt = at; task.updatedAt = at;
    task.completedBy = { id: text(actor && actor.id), name: text(actor && actor.name) || "Current user", role: text(actor && actor.role), at };
    task.completionNote = text(input.note);
    if (task.ownerRole === "laboratory_staff") {
      task.result = {
        summary: text(input.resultSummary), reference: text(input.resultReference), fileId: text(input.fileId),
        fileName: text(input.fileName), receivedAt: at
      };
    }
    const audit = [{
      id: uid("audit"), jobId: job.id, taskId: task.id, stageId: task.stageId,
      actorId: text(actor && actor.id), actorName: text(actor && actor.name) || "Current user", at,
      action: task.ownerRole === "laboratory_staff" ? "laboratory.result.submitted" : "task.completed",
      previousValue: "open", newValue: "complete", reason: task.completionNote
    }];
    const required = tasks.filter((item) => item.jobId === job.id && item.stageId === job.currentStageId && item.required !== false && item.status !== "cancelled");
    if (required.length && required.every((item) => item.status === "complete" || item.completedAt)) {
      const next = nextRequiredStage(stages, job.currentStageId);
      job.handoverStatus = "awaiting_assignment";
      job.handoverFromStageId = job.currentStageId;
      job.handoverToStageId = next && next.stageId || "";
      job.handoverReadyAt = at;
      job.handoverReadyBy = task.completedBy;
      job.handoverNote = task.completionNote;
      job.currentOwnerId = "";
      job.currentOwner = text(job.projectManager) || "Project Manager";
      job.nextAction = next ? `Assign ${STAGE_BY_ID[next.stageId].title} handover` : "Confirm workflow closure";
      job.nextActionDue = isoDate(at);
      audit.push({
        id: uid("audit"), jobId: job.id, taskId: task.id, stageId: job.currentStageId,
        actorId: text(actor && actor.id), actorName: text(actor && actor.name) || "Current user", at,
        action: "handover.ready", previousValue: job.currentStageId, newValue: next && next.stageId || "complete",
        reason: next ? `${STAGE_BY_ID[job.currentStageId].title} is complete and awaits Project Manager assignment` : "Final workflow stage awaits closure"
      });
    }
    job.updatedAt = at;
    return { ok: true, errors: [], job, stages, tasks, audit };
  }

  function assignHandover(jobInput, stagesInput, tasksInput, assignment, actor, now) {
    const job = clone(jobInput); const stages = clone(stagesInput || []); const tasks = clone(tasksInput || []);
    const at = now || new Date().toISOString(); const input = assignment || {}; const errors = [];
    if (job.handoverStatus !== "awaiting_assignment") errors.push("This job is not awaiting a workflow assignment.");
    const current = stages.find((record) => record.stageId === job.currentStageId);
    if (!current) errors.push("The current workflow stage is unavailable.");
    const next = nextRequiredStage(stages, job.currentStageId);
    if (next && !text(input.ownerName)) errors.push("The next task owner is required.");
    if (next && !isoDate(input.dueDate)) errors.push("The next task due date is required.");
    if (errors.length) return { ok: false, errors, job, stages, tasks, audit: [] };

    current.status = "complete"; current.completion = 1; current.completedAt = at; current.updatedAt = at;
    let task = null;
    if (next) {
      next.status = "active"; next.startedAt = next.startedAt || at; next.updatedAt = at;
      task = tasks.find((item) => item.jobId === job.id && item.stageId === next.stageId && item.status !== "cancelled");
      if (!task) { task = defaultTask(job.id, next.stageId, job, at); tasks.push(task); }
      task.ownerId = text(input.ownerId); task.ownerName = text(input.ownerName);
      task.ownerRole = ownerRoleForStage(next.stageId); task.title = text(input.title) || STAGE_BY_ID[next.stageId].action;
      task.dueDate = isoDate(input.dueDate); task.status = "open"; task.progress = 0; task.completedAt = ""; task.updatedAt = at;
      job.currentStageId = next.stageId; job.currentOwnerId = task.ownerId; job.currentOwner = task.ownerName;
      job.nextAction = task.title; job.nextActionDue = task.dueDate; job.stageEnteredAt = at;
    } else {
      job.workflowStatus = "complete"; job.currentOwnerId = ""; job.currentOwner = "";
      job.nextAction = "Workflow complete"; job.nextActionDue = "";
    }
    job.lastHandover = {
      fromStageId: job.handoverFromStageId || current.stageId, toStageId: next && next.stageId || "",
      assignedBy: { id: text(actor && actor.id), name: text(actor && actor.name) || "Project Manager", role: text(actor && actor.role) },
      assignedTo: task ? { id: task.ownerId, name: task.ownerName, role: task.ownerRole } : null, at
    };
    job.handoverStatus = ""; job.handoverFromStageId = ""; job.handoverToStageId = "";
    job.handoverReadyAt = ""; job.handoverReadyBy = null; job.handoverNote = ""; job.updatedAt = at;
    return {
      ok: true, errors: [], job, stages, tasks,
      audit: [{
        id: uid("audit"), jobId: job.id, taskId: task && task.id || "", stageId: current.stageId,
        actorId: text(actor && actor.id), actorName: text(actor && actor.name) || "Project Manager", at,
        action: next ? "handover.assigned" : "workflow.closed", previousValue: current.stageId,
        newValue: next && next.stageId || "complete", reason: next ? `${STAGE_BY_ID[next.stageId].title} assigned to ${task.ownerName}` : "Final workflow stage closed"
      }]
    };
  }

  function makeJob(input, now) {
    const source = input || {};
    const at = now || new Date().toISOString();
    const projectType = normaliseProjectType(source.projectType || source.type || (source.types && source.types[0]));
    const currentStageId = normaliseStage(source.currentStage || source.currentStageId || source.status, projectType);
    const id = text(source.id || source.pid) || uid("job");
    const task = defaultTask(id, currentStageId, source, at);
    const blockerReason = text(source.blockingReason || source.blockerReason);
    const job = {
      id, projectId: text(source.projectId || source.pid || id), jobNumber: text(source.jobNumber || source.number),
      projectName: text(source.projectName || source.name), client: text(source.client), siteAddress: text(source.siteAddress || source.address),
      projectType, proposalDate: isoDate(source.proposalDate), acceptanceDate: isoDate(source.acceptanceDate), purchaseOrder: text(source.purchaseOrder),
      projectManager: text(source.projectManager || source.pm), fieldEngineer: text(source.fieldEngineer),
      projectEngineer: text(source.projectEngineer || source.engineer), reviewer: text(source.reviewer), adminCoordinator: text(source.adminCoordinator),
      fieldworkStart: isoDate(source.fieldworkStart || source.fieldStart), fieldworkDue: isoDate(source.fieldworkDue || source.fieldEnd),
      reportDue: isoDate(source.reportDue || source.finalDue || source.draftDue), currentStageId,
      currentOwnerId: text(source.currentOwnerId), currentOwner: task.ownerName,
      nextAction: task.title, nextActionDue: task.dueDate,
      blockingCategory: normaliseBlockerCategory(source.blockingCategory), blockingReason: blockerReason,
      riskStatus: normaliseRisk(source.riskStatus), invoiceStatus: normaliseInvoiceStatus(source.invoiceStatus),
      invoiceNumber: text(source.invoiceNumber), invoiceAmount: numberOrNull(source.invoiceAmount), paymentStatus: text(source.paymentStatus) || "Not due",
      reportedProgress: percentNumber(source.progress), reportedTechnicalProgress: percentNumber(source.technicalProgress),
      reportedCommercialProgress: percentNumber(source.commercialProgress), archived: source.archived === true,
      source: text(source.source) || "local", createdAt: toDate(source.createdAt || source.created)?.toISOString() || at,
      stageEnteredAt: toDate(source.stageEnteredAt || source.lastUpdated || source.updated)?.toISOString() || at,
      updatedAt: toDate(source.lastUpdated || source.updated)?.toISOString() || at
    };
    return { job, stages: createStages(id, projectType, currentStageId, job.stageEnteredAt), task };
  }

  function percentNumber(value) {
    if (value == null || value === "") return null;
    const raw = typeof value === "string" ? value.replace(/%/g, "") : value;
    const number = Number(raw);
    if (!Number.isFinite(number)) return null;
    return clamp(number > 0 && number <= 1 && !String(value).includes("%") ? number * 100 : number, 0, 100);
  }

  function numberOrNull(value) {
    if (value == null || text(value) === "") return null;
    const number = Number(String(value).replace(/[$,\s]/g, ""));
    return Number.isFinite(number) ? number : null;
  }

  function normaliseRisk(value) {
    const raw = text(value).toLowerCase();
    if (/high|red|critical/.test(raw)) return "High";
    if (/medium|amber|watch/.test(raw)) return "Medium";
    if (/low|green|normal/.test(raw)) return "Low";
    return "Low";
  }

  function normaliseInvoiceStatus(value) {
    const raw = text(value).toLowerCase();
    if (/paid|closed/.test(raw)) return "Paid";
    if (/issue|sent/.test(raw)) return "Issued";
    if (/request|ready/.test(raw)) return "Requested";
    if (/hold|dispute/.test(raw)) return "On hold";
    return "Not requested";
  }

  function normaliseBlockerCategory(value) {
    const raw = text(value).toLowerCase();
    return BLOCKER_CATEGORIES.find((item) => raw.includes(item.toLowerCase())) || (raw ? "Internal" : "");
  }

  function validateNextAction(job) {
    const errors = [];
    if (!text(job && job.currentStageId) || !STAGE_BY_ID[job.currentStageId]) errors.push("Current stage is required.");
    if (!text(job && (job.currentOwner || job.currentOwnerId))) errors.push("Current owner is required.");
    if (!text(job && job.nextAction)) errors.push("Next required action is required.");
    if (!isoDate(job && job.nextActionDue)) errors.push("Next action due date is required.");
    return errors;
  }

  function validateStageCompletion(stageId, context) {
    const ctx = context || {};
    const job = ctx.job || {};
    const tasks = (ctx.tasks || []).filter((task) => task.jobId === job.id && task.stageId === stageId && task.required !== false && task.status !== "cancelled");
    const errors = [];
    const openTasks = tasks.filter((task) => task.status !== "complete" && !task.completedAt);
    if (openTasks.length) errors.push(`${openTasks.length} required task${openTasks.length === 1 ? " is" : "s are"} still open.`);
    if (stageId === "job_created") {
      if (!text(job.jobNumber)) errors.push("Job number is required.");
      if (!text(job.projectName)) errors.push("Project name is required.");
      if (!text(job.client)) errors.push("Client is required.");
      if (!text(job.siteAddress)) errors.push("Site address is required.");
      if (!text(job.projectType)) errors.push("Project type is required.");
    }
    if (stageId === "scope_reviewed" && !(ctx.scopeItems || []).some((item) => item.jobId === job.id && item.status !== "excluded")) errors.push("At least one reviewed scope item is required.");
    if (stageId === "fieldwork_planned") {
      if (!text(job.fieldEngineer) && !(ctx.assignments || []).some((item) => item.jobId === job.id && item.role === "field_engineer")) errors.push("A field engineer must be assigned.");
      if (!job.fieldworkStart && !job.fieldworkDue) errors.push("A fieldwork date is required.");
    }
    if (stageId === "fieldwork_in_progress" && !(ctx.fieldActivities || []).some((item) => item.jobId === job.id)) errors.push("At least one field activity is required.");
    if (stageId === "fieldwork_completed") {
      const activities = (ctx.fieldActivities || []).filter((item) => item.jobId === job.id && item.status !== "cancelled");
      if (!activities.length) errors.push("No field activities are recorded.");
      if (activities.some((item) => item.status !== "complete")) errors.push("All required field activities must be complete.");
    }
    if (stageId === "logs_in_progress" && !(ctx.boreholes || []).some((item) => item.jobId === job.id && (item.logged === true || Number(item.loggedIntervals) > 0))) errors.push("No completed factual log is recorded.");
    if (stageId === "logs_reviewed" && (ctx.boreholes || []).some((item) => item.jobId === job.id && item.reviewStatus !== "approved" && item.reviewStatus !== "reviewed")) errors.push("All factual logs must be reviewed.");
    if (stageId === "lab_results_pending") {
      const tests = (ctx.labTests || []).filter((item) => item.jobId === job.id && item.required !== false);
      if (tests.some((item) => item.status !== "complete" && item.status !== "approved")) errors.push("Required laboratory results are outstanding.");
    }
    if (stageId === "report_drafting" && !(ctx.reports || []).some((item) => item.jobId === job.id && item.status !== "not_started")) errors.push("A report draft is required.");
    if (stageId === "technical_review" && !(ctx.reports || []).some((item) => item.jobId === job.id && item.status === "approved")) errors.push("An independently approved report is required.");
    if (stageId === "report_issued" && !(ctx.reports || []).some((item) => item.jobId === job.id && item.status === "issued")) errors.push("Report issue and transmittal must be recorded.");
    if (stageId === "invoice_requested" && !["Requested", "Issued", "Paid"].includes(job.invoiceStatus)) errors.push("Invoice request must be recorded.");
    if (stageId === "invoice_issued" && (!job.invoiceNumber || !["Issued", "Paid"].includes(job.invoiceStatus))) errors.push("Issued invoice number is required.");
    if (stageId === "payment_follow_up" && job.invoiceStatus !== "Paid" && !/paid/i.test(job.paymentStatus)) errors.push("Payment must be recorded before closure.");
    return [...new Set(errors)];
  }

  function completeStage(jobInput, stagesInput, tasksInput, context, actor, now) {
    const job = clone(jobInput); const stages = clone(stagesInput || []); const tasks = clone(tasksInput || []);
    const at = now || new Date().toISOString();
    const current = stages.find((item) => item.stageId === job.currentStageId);
    if (!current || current.status === "not_required") return { ok: false, errors: ["The current workflow stage is unavailable."], job, stages, tasks, audit: [] };
    const errors = validateStageCompletion(current.stageId, Object.assign({}, context || {}, { job, tasks }));
    if (errors.length) return { ok: false, errors, job, stages, tasks, audit: [] };
    current.status = "complete"; current.completion = 1; current.completedAt = at; current.updatedAt = at;
    tasks.filter((task) => task.jobId === job.id && task.stageId === current.stageId && task.status !== "cancelled").forEach((task) => {
      task.status = "complete"; task.progress = 100; task.completedAt = task.completedAt || at; task.updatedAt = at;
    });
    const next = stages.filter((item) => item.status !== "not_required" && item.status !== "complete" && item.sequence > current.sequence).sort((a, b) => a.sequence - b.sequence)[0];
    let nextTask;
    if (next) {
      next.status = "active"; next.startedAt = at; next.updatedAt = at;
      nextTask = tasks.find((task) => task.jobId === job.id && task.stageId === next.stageId && task.status !== "cancelled");
      if (!nextTask) { nextTask = defaultTask(job.id, next.stageId, job, at); tasks.push(nextTask); }
      job.currentStageId = next.stageId; job.currentOwnerId = nextTask.ownerId; job.currentOwner = nextTask.ownerName;
      job.nextAction = nextTask.title; job.nextActionDue = nextTask.dueDate; job.stageEnteredAt = at;
    } else {
      job.currentStageId = "job_closed";
      job.currentOwner = job.adminCoordinator || roleTitle("admin");
      job.nextAction = "Confirm statutory record retention";
      job.nextActionDue = addBusinessDays(at, 5);
      job.stageEnteredAt = at;
    }
    job.updatedAt = at;
    return {
      ok: true, errors: [], job, stages, tasks,
      audit: [{
        id: uid("audit"), jobId: job.id, taskId: nextTask && nextTask.id || "", stageId: current.stageId,
        actorId: text(actor && actor.id), actorName: text(actor && actor.name) || "Local user", at,
        action: "stage.completed", previousValue: current.stageId, newValue: job.currentStageId,
        reason: text(context && context.reason) || `${STAGE_BY_ID[current.stageId].title} completed and handed over`
      }]
    };
  }

  function stuckThreshold(job) {
    const stageId = job.currentStageId;
    if (/fieldwork/.test(stageId)) return 2;
    if (/lab/.test(stageId)) return 5;
    if (/review/.test(stageId)) return 3;
    if (/invoice|payment|closed/.test(stageId)) return 4;
    if (/client/.test(stageId)) return 5;
    return 3;
  }

  function deriveHealth(job, now) {
    const today = toDate(now) || new Date();
    const due = toDate(job.nextActionDue);
    const daysInStage = daysBetween(job.stageEnteredAt || job.updatedAt, today);
    const overdueDays = due && due < new Date(today.toISOString().slice(0, 10)) ? daysBetween(due, today) : 0;
    const blocked = Boolean(text(job.blockingReason));
    const stuck = blocked || overdueDays > 0 || daysInStage > stuckThreshold(job);
    let risk = normaliseRisk(job.riskStatus);
    if (blocked && daysInStage >= 5 || overdueDays >= 7) risk = "High";
    else if (blocked || overdueDays > 0 || daysInStage > stuckThreshold(job)) risk = risk === "High" ? "High" : "Medium";
    return {
      daysInStage, overdueDays, blocked, stuck, risk,
      reason: blocked ? text(job.blockingReason) : overdueDays ? `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue` : daysInStage > stuckThreshold(job) ? `${daysInStage} days in stage` : "On track"
    };
  }

  function summariseJob(job, stages, tasks, now) {
    return Object.assign({}, calculateProgress(stages, tasks), deriveHealth(job, now), {
      currentStage: STAGE_BY_ID[job.currentStageId]?.title || "Job Created",
      currentOwner: text(job.currentOwner) || roleTitle(ownerRoleForStage(job.currentStageId)),
      invoiceStatus: normaliseInvoiceStatus(job.invoiceStatus)
    });
  }

  function headerMatchScore(header, columnDef) {
    const source = normaliseHeader(header);
    if (!source) return 0;
    const sourceTokens = source.split("_").filter(Boolean);
    return [columnDef.label, columnDef.key, ...(columnDef.aliases || [])].reduce((best, value) => {
      const candidate = normaliseHeader(value);
      if (!candidate) return best;
      if (source === candidate) return Math.max(best, 100);
      if (candidate.length > 3 && (source.includes(candidate) || candidate.includes(source))) {
        const ratio = Math.min(source.length, candidate.length) / Math.max(source.length, candidate.length);
        return Math.max(best, 72 + Math.round(ratio * 18));
      }
      const candidateTokens = candidate.split("_").filter(Boolean);
      const common = candidateTokens.filter((token) => sourceTokens.includes(token)).length;
      const coverage = candidateTokens.length ? common / candidateTokens.length : 0;
      if (common >= 2 && coverage >= 0.66) return Math.max(best, 52 + Math.round(coverage * 16));
      return best;
    }, 0);
  }

  function suggestColumnMapping(headers, columns) {
    const definitions = columns || PROJECT_COLUMNS;
    const mapping = Object.fromEntries(definitions.map((columnDef) => [columnDef.key, -1]));
    const pairs = [];
    (headers || []).forEach((header, sourceIndex) => definitions.forEach((columnDef, columnIndex) => {
      const score = headerMatchScore(header, columnDef);
      if (score >= 52) pairs.push({ sourceIndex, columnIndex, key: columnDef.key, score });
    }));
    pairs.sort((a, b) => b.score - a.score || a.sourceIndex - b.sourceIndex || a.columnIndex - b.columnIndex);
    const usedSources = new Set(); const usedColumns = new Set();
    pairs.forEach((pair) => {
      if (usedSources.has(pair.sourceIndex) || usedColumns.has(pair.key)) return;
      mapping[pair.key] = pair.sourceIndex; usedSources.add(pair.sourceIndex); usedColumns.add(pair.key);
    });
    return mapping;
  }

  function combineHeaderRows(first, second) {
    const upper = Array.isArray(first) ? first : []; const lower = Array.isArray(second) ? second : [];
    const length = Math.max(upper.length, lower.length); let group = "";
    return Array.from({ length }, (_, index) => {
      const top = text(upper[index]); const bottom = text(lower[index]);
      if (top) group = top;
      const prefix = top || group;
      if (prefix && bottom && normaliseHeader(prefix) !== normaliseHeader(bottom)) return `${prefix} ${bottom}`;
      return bottom || prefix;
    });
  }

  function nonEmptyRowCount(rows, start) {
    return (rows || []).slice(start || 0).filter((row) => Array.isArray(row) && row.some((value) => text(value))).length;
  }

  function detectionCandidate(rows, profileId, headerRow, headerDepth, headers) {
    const profile = IMPORT_PROFILES[profileId]; const mapping = suggestColumnMapping(headers, profile.columns);
    const mapped = profile.columns.filter((columnDef) => mapping[columnDef.key] >= 0);
    const required = profile.columns.filter((columnDef) => columnDef.required);
    const requiredMapped = required.filter((columnDef) => mapping[columnDef.key] >= 0).length;
    const quality = mapped.reduce((sum, columnDef) => sum + headerMatchScore(headers[mapping[columnDef.key]], columnDef), 0);
    const density = headers.filter((header) => text(header)).length;
    const dataStartRow = headerRow + headerDepth;
    const dataRows = nonEmptyRowCount(rows, dataStartRow);
    const coverage = required.length ? requiredMapped / required.length : 1;
    const rankScore = coverage * 500 + mapped.length * 24 + quality / 12 + Math.min(dataRows, 250) / 10 + Math.min(density, 40) / 100 - (headerDepth - 1) / 1000;
    const confidence = requiredMapped === required.length && mapped.length >= Math.min(5, profile.columns.length) ? "high" : mapped.length >= 2 && requiredMapped ? "medium" : "low";
    return {
      profile: profileId, columns: profile.columns, headerRow, headerDepth, dataStartRow,
      headers: headers.map(text), mapping, score: mapped.length, mappedCount: mapped.length,
      requiredMapped, requiredTotal: required.length, dataRows, confidence, rankScore
    };
  }

  function importTitle(rows, headerRow) {
    for (let index = headerRow - 1; index >= Math.max(0, headerRow - 4); index -= 1) {
      const values = (rows[index] || []).map(text).filter(Boolean);
      if (values.length === 1) return values[0];
    }
    return "";
  }

  function detectImportProfile(matrix, options) {
    const rows = Array.isArray(matrix) ? matrix : []; const config = options || {};
    const forcedProfile = IMPORT_PROFILES[config.profile] ? config.profile : "";
    const profiles = forcedProfile ? [forcedProfile] : Object.keys(IMPORT_PROFILES);
    const forcedHeader = Number.isInteger(Number(config.headerRow)) && Number(config.headerRow) >= 0 ? Number(config.headerRow) : null;
    const scanLimit = Math.min(rows.length, Math.max(1, Number(config.scanRows) || 100));
    const indexes = forcedHeader == null ? Array.from({ length: scanLimit }, (_, index) => index) : [Math.min(forcedHeader, Math.max(0, rows.length - 1))];
    const candidates = [];
    indexes.forEach((headerRow) => {
      const variants = [{ depth: 1, headers: (rows[headerRow] || []).map(text) }];
      if (headerRow + 1 < rows.length) variants.push({ depth: 2, headers: combineHeaderRows(rows[headerRow], rows[headerRow + 1]) });
      variants.forEach((variant) => profiles.forEach((profileId) => candidates.push(detectionCandidate(rows, profileId, headerRow, variant.depth, variant.headers))));
    });
    candidates.sort((a, b) => b.rankScore - a.rankScore || b.requiredMapped - a.requiredMapped || b.mappedCount - a.mappedCount || a.headerRow - b.headerRow || a.headerDepth - b.headerDepth);
    const fallbackProfile = forcedProfile || "project_register";
    const best = candidates[0] || detectionCandidate(rows, fallbackProfile, 0, 1, (rows[0] || []).map(text));
    best.title = importTitle(rows, best.headerRow);
    best.unmappedHeaders = best.headers.filter((header, index) => text(header) && !Object.values(best.mapping).includes(index));
    return best;
  }

  function analyseWorkbook(matrices) {
    return Object.entries(matrices || {}).map(([sheetName, matrix], sheetIndex) => {
      const detection = detectImportProfile(matrix);
      const rowCount = nonEmptyRowCount(matrix, 0);
      const columnCount = (matrix || []).reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
      return Object.assign({}, detection, {
        sheetName, sheetIndex, rowCount, columnCount,
        sheetRank: detection.rankScore + Math.min(rowCount, 1000) / 100
      });
    });
  }

  function refreshImportDetection(detection, mapping) {
    const next = Object.assign({}, detection, { mapping: Object.assign({}, mapping || detection.mapping || {}) });
    const columns = next.columns || IMPORT_PROFILES[next.profile]?.columns || PROJECT_COLUMNS;
    const mapped = columns.filter((columnDef) => Number(next.mapping[columnDef.key]) >= 0);
    const required = columns.filter((columnDef) => columnDef.required);
    next.score = next.mappedCount = mapped.length;
    next.requiredMapped = required.filter((columnDef) => Number(next.mapping[columnDef.key]) >= 0).length;
    next.requiredTotal = required.length;
    next.confidence = next.requiredMapped === required.length && mapped.length >= Math.min(5, columns.length) ? "high" : mapped.length >= 2 && next.requiredMapped ? "medium" : "low";
    const used = new Set(Object.values(next.mapping).map(Number).filter((index) => Number.isInteger(index) && index >= 0));
    next.unmappedHeaders = (next.headers || []).filter((header, index) => text(header) && !used.has(index));
    return next;
  }

  function valueAt(row, mapping, key) {
    const index = Number(mapping && mapping[key]);
    return Number.isInteger(index) && index >= 0 ? row[index] : "";
  }

  function sourceValue(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (value == null) return "";
    if (["string", "number", "boolean"].includes(typeof value)) return value;
    return text(value);
  }

  function unmappedSourceValues(row, detection) {
    const used = new Set(Object.values(detection && detection.mapping || {}).filter((index) => Number.isInteger(index) && index >= 0));
    const output = {}; const names = new Map();
    const headers = detection && detection.headers || []; const length = Math.max(headers.length, Array.isArray(row) ? row.length : 0);
    Array.from({ length }, (_, index) => headers[index]).forEach((header, index) => {
      if (used.has(index) || !text(row && row[index])) return;
      const base = text(header) || `Column ${index + 1}`; const count = (names.get(base) || 0) + 1;
      names.set(base, count); output[count === 1 ? base : `${base} (${count})`] = sourceValue(row[index]);
    });
    return output;
  }

  function importSource(detection, options, sourceRow) {
    const config = options || {};
    return {
      fileName: text(config.fileName), sheetName: text(config.sheetName), profile: detection.profile,
      headerRow: detection.headerRow + 1, headerDepth: detection.headerDepth || 1, sourceRow
    };
  }

  function projectRowInput(row, mapping) {
    const output = {};
    PROJECT_COLUMNS.forEach((columnDef) => { output[columnDef.key] = valueAt(row, mapping, columnDef.key); });
    return output;
  }

  function parseProjectRows(matrix, detection, options) {
    const config = options || {}; const existing = new Set((config.existingJobNumbers || []).map((value) => slug(value)));
    const dataStartRow = Number.isInteger(detection.dataStartRow) ? detection.dataStartRow : detection.headerRow + 1;
    const rows = (matrix || []).slice(dataStartRow);
    return rows.map((row, index) => {
      const input = projectRowInput(row, detection.mapping);
      const blank = !PROJECT_COLUMNS.some((columnDef) => text(input[columnDef.key]));
      if (blank) return null;
      const type = normaliseProjectType(input.projectType);
      const currentStageId = normaliseStage(input.currentStage, type);
      input.projectType = type; input.currentStage = currentStageId;
      input.nextAction = text(input.nextAction) || STAGE_BY_ID[currentStageId].action;
      input.currentOwner = text(input.currentOwner) || ownerForStage(currentStageId, input);
      input.nextActionDue = isoDate(input.nextActionDue || input.reportDue || input.fieldworkDue) || addBusinessDays(config.now || new Date(), STAGE_BY_ID[currentStageId].dueDays);
      input.source = "excel_project_register";
      const errors = PROJECT_COLUMNS.filter((columnDef) => columnDef.required && !text(input[columnDef.key])).map((columnDef) => `${columnDef.label} is required.`);
      const duplicate = existing.has(slug(input.jobNumber));
      if (duplicate && config.duplicateMode !== "update") errors.push("Duplicate job number.");
      const built = makeJob(input, config.now && toDate(config.now)?.toISOString());
      const sourceRow = dataStartRow + index + 1; const extras = unmappedSourceValues(row, detection);
      built.job.importSource = importSource(detection, config, sourceRow);
      built.job.importExtras = extras;
      errors.push(...validateNextAction(built.job));
      const warnings = Object.keys(extras).length ? [`${Object.keys(extras).length} unmapped source column${Object.keys(extras).length === 1 ? "" : "s"} retained.`] : [];
      return { sourceRow, input, built, duplicate, errors: [...new Set(errors)], warnings };
    }).filter(Boolean);
  }

  function parsePileRows(matrix, detection, options) {
    const config = options || {}; const jobId = text(config.jobId);
    const dataStartRow = Number.isInteger(detection.dataStartRow) ? detection.dataStartRow : detection.headerRow + 1;
    return (matrix || []).slice(dataStartRow).map((row, index) => {
      const values = {};
      PILE_COLUMNS.forEach((columnDef) => { values[columnDef.key] = valueAt(row, detection.mapping, columnDef.key); });
      if (!PILE_COLUMNS.some((columnDef) => text(values[columnDef.key]))) return null;
      const errors = [];
      if (!jobId) errors.push("Select a target job for the pile schedule.");
      if (!text(values.pileNumber)) errors.push("Pile Number is required.");
      const at = new Date().toISOString(); const sourceRow = dataStartRow + index + 1;
      const extras = unmappedSourceValues(row, detection); const source = importSource(detection, config, sourceRow);
      const warnings = Object.keys(extras).length ? [`${Object.keys(extras).length} unmapped source column${Object.keys(extras).length === 1 ? "" : "s"} retained.`] : [];
      return {
        sourceRow, input: values, duplicate: false, errors, warnings,
        activity: {
          id: `${jobId || "unassigned"}:pile:${slug(values.pileNumber) || index + 1}`, jobId,
          activityType: "Pile Inspection", reference: `Pile ${text(values.pileNumber)}`, status: "planned",
          dueDate: isoDate(config.dueDate), assignedTo: text(config.owner), source: "excel_pile_schedule",
          sourceTitle: detection.title, importSource: source,
          details: Object.assign(clone(values), { sourceColumns: extras }), createdAt: at, updatedAt: at
        }
      };
    }).filter(Boolean);
  }

  function parseImport(matrix, detection, options) {
    const profileInfo = detection || detectImportProfile(matrix);
    const rows = profileInfo.profile === "pile_schedule" ? parsePileRows(matrix, profileInfo, options) : parseProjectRows(matrix, profileInfo, options);
    return {
      profile: profileInfo.profile, detection: profileInfo, rows,
      accepted: rows.filter((row) => !row.errors.length), rejected: rows.filter((row) => row.errors.length),
      duplicates: rows.filter((row) => row.duplicate)
    };
  }

  function exportRow(job, summary) {
    const s = summary || {};
    const values = {
      jobNumber: job.jobNumber, projectName: job.projectName, client: job.client, siteAddress: job.siteAddress,
      projectType: job.projectType, proposalDate: job.proposalDate, acceptanceDate: job.acceptanceDate,
      purchaseOrder: job.purchaseOrder, projectManager: job.projectManager, fieldEngineer: job.fieldEngineer,
      projectEngineer: job.projectEngineer, reviewer: job.reviewer, adminCoordinator: job.adminCoordinator,
      fieldworkStart: job.fieldworkStart, fieldworkDue: job.fieldworkDue, reportDue: job.reportDue,
      currentStage: STAGE_BY_ID[job.currentStageId]?.title || job.currentStageId, currentOwner: job.currentOwner,
      progress: s.overall == null ? job.reportedProgress : s.overall, technicalProgress: s.technical == null ? job.reportedTechnicalProgress : s.technical,
      commercialProgress: s.commercial == null ? job.reportedCommercialProgress : s.commercial, riskStatus: s.risk || job.riskStatus,
      nextAction: job.nextAction, nextActionDue: job.nextActionDue, blockingCategory: job.blockingCategory,
      blockingReason: job.blockingReason, invoiceStatus: job.invoiceStatus, invoiceNumber: job.invoiceNumber,
      invoiceAmount: job.invoiceAmount, paymentStatus: job.paymentStatus, lastUpdated: job.updatedAt
    };
    return PROJECT_COLUMNS.map((columnDef) => values[columnDef.key] == null ? "" : values[columnDef.key]);
  }

  function viewForRole(roleId) {
    return ({
      director: "tower", engineering_manager: "review", project_engineer: "my_work",
      field_engineer: "fieldwork", laboratory_staff: "logs_lab", admin: "invoice", client: "my_work"
    })[roleId] || "tower";
  }

  function ownerMatchesUser(job, user) {
    const source = job || {}; const actor = user || {};
    const owner = slug(source.currentOwner); const name = slug(actor.name);
    return text(source.currentOwnerId) === text(actor.id) || Boolean(name && (owner === name || owner.includes(name.split("_")[0])));
  }

  function jobInMyWork(job, assignments, user, roleId) {
    if (roleId === "client") return true;
    return ownerMatchesUser(job, user) || (Array.isArray(assignments) ? assignments : []).some((assignment) =>
      text(assignment.userId) === text(user && user.id) || slug(assignment.userName) === slug(user && user.name)
    );
  }

  return Object.freeze({
    VERSION, GROUPS, STAGES, STAGE_BY_ID, STAGE_INDEX, ROLE_STAGE_LIMITS, PROJECT_TYPES, PROJECT_COLUMNS, PILE_COLUMNS,
    IMPORT_PROFILES, SUPPORTED_WORKBOOK_EXTENSIONS, BLOCKER_CATEGORIES,
    text, clone, clamp, uid, slug, normaliseHeader, normaliseProjectType, projectProfile, stageActive, normaliseStage,
    toDate, isoDate, addBusinessDays, daysBetween, createStages, effectiveStageWeights, stageCompletion, calculateProgress,
    ownerRoleForStage, visibleStageLimit, stageVisibleForRole, stageControllableByRole, roleTitle, ownerForStage, defaultTask,
    nextRequiredStage, completeTaskForHandover, assignHandover, makeJob, percentNumber, numberOrNull, normaliseRisk,
    normaliseInvoiceStatus, normaliseBlockerCategory, validateNextAction, validateStageCompletion, completeStage,
    stuckThreshold, deriveHealth, summariseJob, headerMatchScore, suggestColumnMapping, combineHeaderRows,
    detectImportProfile, analyseWorkbook, refreshImportDetection, unmappedSourceValues, parseProjectRows, parsePileRows,
    parseImport, exportRow, viewForRole, ownerMatchesUser, jobInMyWork
  });
});

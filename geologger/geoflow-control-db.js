(function (root, factory) {
  let core = root && root.GeoFlowControlCore;
  if (!core && typeof require === "function") core = require("./geoflow-control-core.js");
  const api = factory(core, root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GeoFlowControlDB = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core, root) {
  "use strict";

  if (!Core) throw new Error("GeoFlowControlDB requires GeoFlowControlCore");

  const DB_NAME = "sts-geoflow-control";
  const DB_VERSION = 1;
  const FALLBACK_KEY = "sts-geoflow-control-fallback-v1";
  const STORE_NAMES = Object.freeze([
    "users", "roles", "jobs", "job_stages", "job_tasks", "job_assignments", "job_scope_items",
    "field_activities", "boreholes", "samples", "lab_tests", "reports", "review_comments",
    "variations", "invoices", "blockers", "activity_history"
  ]);

  let databasePromise = null;

  function emptySnapshot() { return Object.fromEntries(STORE_NAMES.map((name) => [name, []])); }

  function fallbackRead() {
    if (!root || !root.localStorage) return emptySnapshot();
    try {
      const parsed = JSON.parse(root.localStorage.getItem(FALLBACK_KEY) || "null");
      const snapshot = emptySnapshot();
      STORE_NAMES.forEach((name) => { snapshot[name] = Array.isArray(parsed && parsed[name]) ? parsed[name] : []; });
      return snapshot;
    } catch (error) { return emptySnapshot(); }
  }

  function fallbackWrite(snapshot) {
    if (root && root.localStorage) root.localStorage.setItem(FALLBACK_KEY, JSON.stringify(snapshot));
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    });
  }

  function open() {
    if (databasePromise) return databasePromise;
    if (!root || !root.indexedDB) return Promise.resolve(null);
    databasePromise = new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        STORE_NAMES.forEach((name) => {
          const store = db.objectStoreNames.contains(name) ? request.transaction.objectStore(name) : db.createObjectStore(name, { keyPath: "id" });
          if (name !== "users" && name !== "roles" && name !== "jobs" && !store.indexNames.contains("jobId")) store.createIndex("jobId", "jobId", { unique: false });
          if (name === "jobs" && !store.indexNames.contains("jobNumber")) store.createIndex("jobNumber", "jobNumber", { unique: false });
          if (name === "job_tasks" && !store.indexNames.contains("dueDate")) store.createIndex("dueDate", "dueDate", { unique: false });
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { databasePromise = null; reject(request.error || new Error("Unable to open local project database")); };
      request.onblocked = () => { databasePromise = null; reject(new Error("Local project database upgrade is blocked by another tab")); };
    });
    return databasePromise;
  }

  async function getAll(storeName) {
    assertStore(storeName);
    const db = await open();
    if (!db) return Core.clone(fallbackRead()[storeName]);
    return requestResult(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
  }

  async function get(storeName, id) {
    assertStore(storeName);
    const db = await open();
    if (!db) return Core.clone(fallbackRead()[storeName].find((item) => item.id === id) || null);
    return requestResult(db.transaction(storeName, "readonly").objectStore(storeName).get(id));
  }

  async function put(storeName, value) {
    assertStore(storeName); assertRecord(value);
    const db = await open();
    if (!db) {
      const snapshot = fallbackRead(); const index = snapshot[storeName].findIndex((item) => item.id === value.id);
      if (index >= 0) snapshot[storeName][index] = Core.clone(value); else snapshot[storeName].push(Core.clone(value));
      fallbackWrite(snapshot); return Core.clone(value);
    }
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(Core.clone(value));
    await transactionDone(transaction);
    return Core.clone(value);
  }

  async function bulkPut(storeName, values) {
    assertStore(storeName);
    const rows = (values || []).filter(Boolean);
    rows.forEach(assertRecord);
    if (!rows.length) return [];
    const db = await open();
    if (!db) {
      const snapshot = fallbackRead(); const byId = new Map(snapshot[storeName].map((item) => [item.id, item]));
      rows.forEach((item) => byId.set(item.id, Core.clone(item))); snapshot[storeName] = [...byId.values()]; fallbackWrite(snapshot);
      return Core.clone(rows);
    }
    const transaction = db.transaction(storeName, "readwrite"); const store = transaction.objectStore(storeName);
    rows.forEach((item) => store.put(Core.clone(item))); await transactionDone(transaction); return Core.clone(rows);
  }

  async function remove(storeName, id) {
    assertStore(storeName);
    const db = await open();
    if (!db) {
      const snapshot = fallbackRead(); snapshot[storeName] = snapshot[storeName].filter((item) => item.id !== id); fallbackWrite(snapshot); return;
    }
    const transaction = db.transaction(storeName, "readwrite"); transaction.objectStore(storeName).delete(id); await transactionDone(transaction);
  }

  async function transact(changes) {
    const puts = changes && changes.put || {}; const deletes = changes && changes.delete || {};
    const stores = [...new Set([...Object.keys(puts), ...Object.keys(deletes)])];
    stores.forEach(assertStore);
    if (!stores.length) return;
    const db = await open();
    if (!db) {
      const snapshot = fallbackRead();
      stores.forEach((name) => {
        const byId = new Map(snapshot[name].map((item) => [item.id, item]));
        (puts[name] || []).forEach((item) => { assertRecord(item); byId.set(item.id, Core.clone(item)); });
        (deletes[name] || []).forEach((id) => byId.delete(id)); snapshot[name] = [...byId.values()];
      });
      fallbackWrite(snapshot); return;
    }
    const transaction = db.transaction(stores, "readwrite");
    stores.forEach((name) => {
      const store = transaction.objectStore(name);
      (puts[name] || []).forEach((item) => { assertRecord(item); store.put(Core.clone(item)); });
      (deletes[name] || []).forEach((id) => store.delete(id));
    });
    await transactionDone(transaction);
  }

  async function loadAll() {
    const db = await open();
    if (!db) return fallbackRead();
    const transaction = db.transaction(STORE_NAMES, "readonly");
    const pending = Object.fromEntries(STORE_NAMES.map((name) => [name, requestResult(transaction.objectStore(name).getAll())]));
    const snapshot = emptySnapshot();
    await Promise.all(STORE_NAMES.map(async (name) => { snapshot[name] = await pending[name]; }));
    return snapshot;
  }

  function assertStore(name) { if (!STORE_NAMES.includes(name)) throw new Error(`Unknown control-tower store: ${name}`); }
  function assertRecord(value) { if (!value || !Core.text(value.id)) throw new Error("Local database records require an id"); }

  function projectState(project, stateResolver) {
    try { return stateResolver ? stateResolver(project) : null; }
    catch (error) { return null; }
  }

  function stageStatusFromProject(project, state) {
    const source = state || {};
    const jobNumber = Core.text(project && project.number).replace(/^[\u2013\u2014-]+$/, "");
    const metadataReady = Boolean(jobNumber && Core.text(project && project.name) && Core.text(project && project.client) && Core.text(project && project.address));
    if (!metadataReady) return "Job Created";
    const scopeCount = Object.values(project && project.scope || {}).reduce((sum, value) => sum + (Number(value) || 0), 0)
      + (source.scope && Array.isArray(source.scope.items) ? source.scope.items.length : 0);
    if (!scopeCount) return "Job Created";
    let stage = "Scope Reviewed";
    const team = project && project.team || {};
    const dates = project && project.dates || {};
    if (Core.text(dates.fieldStart || dates.fieldEnd || team.tech || team.fieldEngineer)) stage = "Fieldwork Planned";
    const boreholes = source.boreholes || [];
    const logs = source.logs || {};
    const fieldEvidence = boreholes.some((borehole) => Number(borehole.termDepth || borehole.finalDepth) > 0)
      || Object.values(logs).some((log) => (log.spt || []).some((row) => row && row.depth !== "" && row.depth != null) || (log.dcp || []).some((row) => row && Object.keys(row).length));
    if (fieldEvidence) stage = "Fieldwork In Progress";
    const enteredBoreholes = boreholes.filter((borehole) => Number(borehole.termDepth || borehole.finalDepth) > 0);
    if (enteredBoreholes.length && enteredBoreholes.length === boreholes.length) stage = "Fieldwork Completed";
    const loggedIds = boreholes.filter((borehole) => {
      const log = logs[borehole.id] || {};
      return (log.soil || []).some((row) => row && (row.material || row.description))
        || (log.rock || []).some((row) => row && (row.rockType || row.description) && !row.defectType);
    });
    if (loggedIds.length) stage = "Logs In Progress";
    if (loggedIds.length && loggedIds.length === boreholes.length && boreholes.every((borehole) => borehole.checked === true || borehole.approved === true || /reviewed|approved/i.test(borehole.reviewStatus || ""))) stage = "Logs Reviewed";
    const labRows = source.laboratory && (source.laboratory.tests || source.laboratory.results) || source.labTests || [];
    if (Array.isArray(labRows) && labRows.some((row) => row && Object.keys(row).length)) stage = "Lab Results Pending";
    const legacy = Core.normaliseStage(project && project.status, project && (project.types && project.types[0] || project.type));
    if (Core.STAGE_INDEX[legacy] >= Core.STAGE_INDEX.engineering_assessment && Core.STAGE_INDEX[stage] >= Core.STAGE_INDEX.logs_reviewed) stage = legacy;
    return stage;
  }

  function scopeRecords(job, project, at) {
    return Object.entries(project.scope || {}).filter(([, quantity]) => Number(quantity) > 0).map(([name, quantity]) => ({
      id: `${job.id}:scope:${Core.slug(name)}`, jobId: job.id, name, quantity: Number(quantity), unit: "item",
      status: "reviewed", source: "geoflow_project", createdAt: at, updatedAt: at
    }));
  }

  function assignmentRecords(job, project, accessState, at) {
    const rows = [];
    const add = (role, name) => {
      if (!Core.text(name)) return;
      rows.push({ id: `${job.id}:${role}:${Core.slug(name)}`, jobId: job.id, userId: "", userName: Core.text(name), role, active: true, source: "geoflow_project", createdAt: at, updatedAt: at });
    };
    add("project_manager", project.pm || job.projectManager);
    add("project_engineer", project.team && (project.team.engineer || project.team.projectEngineer) || job.projectEngineer);
    add("field_engineer", project.team && (project.team.tech || project.team.fieldEngineer) || job.fieldEngineer);
    add("engineering_manager", project.team && project.team.reviewer || job.reviewer);
    add("admin", project.team && project.team.admin || job.adminCoordinator);
    const policyAssignments = accessState && accessState.projectAssignments && accessState.projectAssignments[job.projectId] || {};
    Object.entries(policyAssignments).forEach(([userId, assignment]) => {
      if (!assignment || assignment.active === false) return;
      const user = (accessState.users || []).find((item) => item.id === userId);
      const role = Core.slug(assignment.projectRole || user && user.role || "team_member");
      const id = `${job.id}:${role}:${userId}`;
      if (!rows.some((item) => item.id === id)) rows.push({ id, jobId: job.id, userId, userName: Core.text(user && user.name), role, active: true, source: "access_policy", createdAt: at, updatedAt: at });
    });
    return rows;
  }

  function boreholeRecords(job, state, at) {
    return (state && state.boreholes || []).map((borehole) => {
      const log = state.logs && state.logs[borehole.id] || {};
      const soil = (log.soil || []).filter((item) => item && (item.material || item.description));
      const rock = (log.rock || []).filter((item) => item && (item.rockType || item.description) && !item.defectType);
      const loggedIntervals = soil.length + rock.length;
      const approved = borehole.approved === true || /approved/i.test(borehole.reviewStatus || "");
      const reviewed = approved || borehole.checked === true || /reviewed|checked/i.test(borehole.reviewStatus || "");
      return {
        id: `${job.id}:borehole:${borehole.id}`, jobId: job.id, boreholeId: borehole.id,
        plannedDepth: Number(borehole.plannedDepth) || null, actualDepth: Number(borehole.termDepth || borehole.finalDepth) || null,
        logged: loggedIntervals > 0, loggedIntervals, reviewStatus: approved ? "approved" : reviewed ? "reviewed" : "draft",
        source: "geoflow_project", createdAt: at, updatedAt: at
      };
    });
  }

  function sampleRecords(job, state, at) {
    const rows = [];
    Object.entries(state && state.logs || {}).forEach(([boreholeId, log]) => {
      (log.samples || []).forEach((sample, index) => {
        if (!sample || !Core.text(sample.sid || sample.sampleId)) return;
        rows.push({
          id: `${job.id}:sample:${Core.slug(sample.sid || sample.sampleId)}:${index}`, jobId: job.id, boreholeId,
          sampleId: Core.text(sample.sid || sample.sampleId), sampleType: Core.text(sample.stype || sample.type),
          from: Number(sample.from) || null, to: Number(sample.to) || null, status: Core.text(sample.status) || "collected",
          source: "geoflow_project", createdAt: at, updatedAt: at
        });
      });
    });
    return rows;
  }

  function fieldActivityRecords(job, project, state, at) {
    const rows = [];
    const scope = project.scope || {};
    Object.entries(scope).forEach(([name, quantity]) => {
      const count = Math.max(0, Number(quantity) || 0);
      for (let index = 0; index < count; index += 1) {
        const matchingBh = /borehole/i.test(name) && state && state.boreholes && state.boreholes[index];
        const complete = Boolean(matchingBh && (matchingBh.termDepth || matchingBh.finalDepth));
        rows.push({
          id: `${job.id}:field:${Core.slug(name)}:${index + 1}`, jobId: job.id, activityType: name,
          reference: matchingBh && matchingBh.id || `${name} ${index + 1}`, status: complete ? "complete" : "planned",
          dueDate: job.fieldworkDue, assignedTo: job.fieldEngineer, source: "geoflow_project", createdAt: at, updatedAt: at
        });
      }
    });
    return rows;
  }

  function historyRecords(job, project, at) {
    const source = Array.isArray(project.activity) ? project.activity : [];
    const rows = source.map((event, index) => ({
      id: `${job.id}:history:${index}:${Core.slug(event.t || event.ts || at)}`, jobId: job.id, taskId: "", stageId: "",
      actorId: "", actorName: "Imported GeoFlow history", at: new Date(event.t || event.ts || at).toISOString(),
      action: "project.activity", previousValue: "", newValue: "", reason: Core.text(event.m || event.msg || event.message)
    }));
    rows.push({
      id: `${job.id}:history:control-migration`, jobId: job.id, taskId: "", stageId: job.currentStageId,
      actorId: "", actorName: "STS GeoFlow", at, action: "control.migrated", previousValue: "", newValue: job.currentStageId,
      reason: "Project linked to the local Project Control Tower"
    });
    return rows;
  }

  function roleAndUserRecords(accessState, at) {
    const roles = [];
    if (root && root.GeoFlowAccessCore && root.GeoFlowAccessCore.ROLES) {
      Object.values(root.GeoFlowAccessCore.ROLES).forEach((role) => roles.push({ id: role.id, title: role.title, rank: role.rank, scope: role.scope, permissions: Core.clone(role.permissions), createdAt: at, updatedAt: at }));
    } else {
      ["director", "engineering_manager", "project_engineer", "field_engineer", "laboratory_staff", "client", "admin"].forEach((id, index) => roles.push({ id, title: Core.roleTitle(id), rank: 700 - index * 75, scope: ["director", "engineering_manager"].includes(id) ? "all" : "assigned", permissions: [], createdAt: at, updatedAt: at }));
    }
    const users = (accessState && accessState.users || []).map((user) => ({
      id: user.id, name: Core.text(user.name), email: Core.text(user.email), role: user.role, active: user.active !== false,
      source: "access_policy", createdAt: user.createdAt || at, updatedAt: user.updatedAt || at
    }));
    return { roles, users };
  }

  async function migrateProjects(projects, stateResolver, accessState) {
    const snapshot = await loadAll();
    const existingIds = new Set(snapshot.jobs.map((job) => job.id));
    const at = new Date().toISOString();
    const records = emptySnapshot();
    const identity = roleAndUserRecords(accessState, at); records.roles.push(...identity.roles); records.users.push(...identity.users);
    (projects || []).forEach((project) => {
      const id = Core.text(project.pid || project.id);
      if (!id || existingIds.has(id)) return;
      const state = projectState(project, stateResolver);
      const input = Object.assign({}, project, {
        id, projectId: id, jobNumber: project.number, projectName: project.name, siteAddress: project.address,
        projectType: project.types && project.types[0] || project.type, currentStage: stageStatusFromProject(project, state),
        projectManager: project.pm, fieldEngineer: project.team && (project.team.tech || project.team.fieldEngineer),
        projectEngineer: project.team && (project.team.engineer || project.team.projectEngineer),
        reviewer: project.team && project.team.reviewer, adminCoordinator: project.team && project.team.admin,
        fieldworkStart: project.dates && project.dates.fieldStart, fieldworkDue: project.dates && project.dates.fieldEnd,
        reportDue: project.dates && (project.dates.finalDue || project.dates.draftDue), source: "geoflow_project",
        createdAt: project.created, lastUpdated: project.updated
      });
      const built = Core.makeJob(input, at); const job = built.job;
      records.jobs.push(job); records.job_stages.push(...built.stages); records.job_tasks.push(built.task);
      records.job_scope_items.push(...scopeRecords(job, project, at));
      records.job_assignments.push(...assignmentRecords(job, project, accessState, at));
      records.field_activities.push(...fieldActivityRecords(job, project, state, at));
      records.boreholes.push(...boreholeRecords(job, state, at)); records.samples.push(...sampleRecords(job, state, at));
      records.activity_history.push(...historyRecords(job, project, at));
      if (job.invoiceStatus !== "Not requested" || job.invoiceNumber || job.invoiceAmount != null) records.invoices.push({
        id: `${job.id}:invoice:${Core.slug(job.invoiceNumber || "current")}`, jobId: job.id, status: job.invoiceStatus,
        invoiceNumber: job.invoiceNumber, amount: job.invoiceAmount, paymentStatus: job.paymentStatus, createdAt: at, updatedAt: at
      });
      if (job.blockingReason) records.blockers.push({
        id: `${job.id}:blocker:current`, jobId: job.id, category: job.blockingCategory || "Internal", reason: job.blockingReason,
        status: "open", owner: job.currentOwner, openedAt: job.stageEnteredAt || at, createdAt: at, updatedAt: at
      });
    });
    const put = Object.fromEntries(STORE_NAMES.map((name) => [name, records[name]]));
    await transact({ put });
    return loadAll();
  }

  return Object.freeze({
    DB_NAME, DB_VERSION, STORE_NAMES, open, getAll, get, put, bulkPut, remove, transact, loadAll,
    migrateProjects, emptySnapshot
  });
});

(function (root, factory) {
  let core = root && root.GeoFlowControlCore;
  let database = root && root.GeoFlowControlDB;
  if (!core && typeof require === "function") core = require("./geoflow-control-core.js");
  if (!database && typeof require === "function") database = require("./geoflow-control-db.js");
  const api = factory(core, database, root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GeoFlowControlLive = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core, DB, root) {
  "use strict";

  if (!Core || !DB) throw new Error("GeoFlowControlLive requires GeoFlowControlCore and GeoFlowControlDB");

  const PROJECT_STORES = Object.freeze([
    "jobs", "job_stages", "job_tasks", "job_assignments", "job_scope_items", "field_activities", "boreholes", "samples",
    "lab_tests", "reports", "review_comments", "variations", "invoices", "blockers", "activity_history"
  ]);
  const WORKFLOW_JOB_FIELDS = Object.freeze([
    "currentStageId", "currentOwnerId", "currentOwner", "nextAction", "nextActionDue", "stageEnteredAt",
    "handoverStatus", "handoverFromStageId", "handoverToStageId", "handoverReadyAt", "handoverReadyBy",
    "handoverNote", "lastHandover", "workflowStatus"
  ]);
  const state = {
    started: false, socket: null, status: "offline", lastSyncAt: "", lastRevision: 0,
    reconnectAttempt: 0, reconnectTimer: null, pollTimer: null, syncTimer: null,
    local: DB.emptySnapshot(), pending: new Map(), applyQueue: Promise.resolve(), channel: null
  };

  function access() { return root && root.GeoFlowAccess; }
  function actor() {
    try {
      const user = access() && access().currentUser ? access().currentUser() : null;
      const role = access() && access().currentRole ? access().currentRole() : null;
      return { id: Core.text(user && user.id) || "u_local", name: Core.text(user && user.name) || "Local user", role: Core.text(role && role.id || user && user.role) || "client" };
    } catch (error) { return { id: "u_local", name: "Local user", role: "client" }; }
  }

  function accessPolicy() {
    try { return access() && access().loadPolicy ? access().loadPolicy() : null; }
    catch (error) { return null; }
  }

  function accessibleJobs(snapshot) {
    return (snapshot && snapshot.jobs || []).filter(job => {
      try { return !access() || !access().canAccessProject || access().canAccessProject(job.projectId || job.id); }
      catch (error) { return true; }
    });
  }

  function projectScope(snapshot) {
    const user = actor(); const policy = accessPolicy(); const jobs = accessibleJobs(snapshot);
    const projectIds = [...new Set(jobs.map(job => Core.text(job.projectId || job.id)).filter(Boolean))];
    const pmProjectIds = projectIds.filter(projectId => {
      const assignment = policy && policy.projectAssignments && policy.projectAssignments[projectId] && policy.projectAssignments[projectId][user.id];
      if (assignment && /project manager/i.test(Core.text(assignment.projectRole))) return true;
      const job = jobs.find(item => (item.projectId || item.id) === projectId);
      return Core.slug(job && job.projectManager) === Core.slug(user.name) || Core.text(job && job.projectManagerId) === user.id;
    });
    return { projectIds, pmProjectIds };
  }

  function endpoint(snapshot, websocket) {
    const user = actor(); const scope = projectScope(snapshot || state.local);
    const params = new URLSearchParams({ role: user.role, user: user.id, name: user.name });
    if (scope.projectIds.length) params.set("projects", scope.projectIds.join(","));
    if (scope.pmProjectIds.length) params.set("pm", scope.pmProjectIds.join(","));
    const path = `/api/v1/control/live?${params.toString()}`;
    if (!websocket) return path;
    const protocol = root.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${root.location.host}${path}`;
  }

  function requestHeaders(projectId, recordKey) {
    let headers = { "Content-Type": "application/json" };
    try { if (typeof syncHeaders === "function") headers = Object.assign({}, syncHeaders(), headers); } catch (error) {}
    if (projectId) headers["X-GeoFlow-Project"] = projectId;
    if (recordKey) headers["X-GeoFlow-Record-Key"] = recordKey;
    return headers;
  }

  function setStatus(status, detail) {
    state.status = status;
    if (detail && detail.lastSyncAt) state.lastSyncAt = detail.lastSyncAt;
    if (root && root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new CustomEvent("geoflow:control-connection", { detail: Object.assign(statusSnapshot(), detail || {}) }));
  }

  function statusSnapshot() {
    return { status: state.status, lastSyncAt: state.lastSyncAt, revision: state.lastRevision };
  }

  function projectProjection(snapshot, job) {
    const projectId = Core.text(job.projectId || job.id);
    const projection = { projectId };
    PROJECT_STORES.forEach(store => {
      if (store === "jobs") projection.jobs = [Core.clone(job)];
      else projection[store] = (snapshot[store] || []).filter(row => row.jobId === job.id).map(Core.clone);
    });
    return projection;
  }

  function projections(snapshot) {
    return accessibleJobs(snapshot).map(job => projectProjection(snapshot, job));
  }

  function updateLocalRows(store, rows) {
    const byId = new Map((state.local[store] || []).map(row => [row.id, row]));
    rows.forEach(row => byId.set(row.id, Core.clone(row)));
    state.local[store] = [...byId.values()];
  }

  function applyRemote(payload) {
    if (!payload || !Array.isArray(payload.projects)) return Promise.resolve();
    state.applyQueue = state.applyQueue.then(async () => {
      const puts = Object.fromEntries(PROJECT_STORES.map(store => [store, []]));
      payload.projects.forEach(project => {
        PROJECT_STORES.forEach(store => {
          (project[store] || []).forEach(row => {
            let next = Core.clone(row);
            if (store === "jobs" && row.scopeCapped) {
              const local = (state.local.jobs || []).find(item => item.id === row.id);
              if (local) {
                WORKFLOW_JOB_FIELDS.forEach(field => { next[field] = Core.clone(local[field]); });
                delete next.scopeCapped;
              }
            }
            puts[store].push(next);
          });
        });
      });
      const nonEmpty = Object.fromEntries(Object.entries(puts).filter(([, rows]) => rows.length));
      if (Object.keys(nonEmpty).length) {
        await DB.transact({ put: nonEmpty });
        Object.entries(nonEmpty).forEach(([store, rows]) => updateLocalRows(store, rows));
      }
      state.lastRevision = Number(payload.revision) || state.lastRevision;
      state.lastSyncAt = payload.updatedAt || new Date().toISOString();
      setStatus(state.socket && state.socket.readyState === 1 ? "live" : "polling", { lastSyncAt: state.lastSyncAt });
      if (root && root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new CustomEvent("geoflow:control-live", { detail: statusSnapshot() }));
      if (state.channel) state.channel.postMessage({ type: "refresh", revision: state.lastRevision, at: state.lastSyncAt });
    }).catch(error => setStatus("offline", { error: error && error.message || "Local workflow cache could not be updated." }));
    return state.applyQueue;
  }

  function handleMessage(event) {
    let payload;
    try { payload = JSON.parse(event.data); }
    catch (error) { return; }
    if (payload.type === "snapshot") applyRemote(payload);
    if (payload.snapshot) applyRemote(payload.snapshot);
    if (payload.type === "operation_result" && payload.requestId) {
      const pending = state.pending.get(payload.requestId);
      if (!pending) return;
      state.pending.delete(payload.requestId); root.clearTimeout(pending.timer);
      if (payload.ok) pending.resolve(payload); else pending.reject(new Error(payload.message || payload.error || "The workflow operation failed."));
    }
  }

  function scheduleReconnect() {
    root.clearTimeout(state.reconnectTimer);
    const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(5, state.reconnectAttempt++)));
    state.reconnectTimer = root.setTimeout(openSocket, delay);
    schedulePoll();
  }

  function openSocket() {
    if (!state.started || !root.WebSocket || !root.location || !root.location.host) { schedulePoll(); return; }
    if (state.socket && [0, 1].includes(state.socket.readyState)) return;
    setStatus("connecting");
    try {
      const socket = new WebSocket(endpoint(state.local, true)); state.socket = socket;
      socket.addEventListener("open", () => {
        state.reconnectAttempt = 0; root.clearTimeout(state.pollTimer); setStatus("live");
        sendSocket({ type: "sync_projects", projects: projections(state.local) }).catch(() => schedulePoll());
      });
      socket.addEventListener("message", handleMessage);
      socket.addEventListener("close", () => { if (state.socket === socket) state.socket = null; setStatus("offline"); scheduleReconnect(); });
      socket.addEventListener("error", () => { try { socket.close(); } catch (error) {} });
    } catch (error) { state.socket = null; setStatus("offline", { error: error.message }); scheduleReconnect(); }
  }

  function schedulePoll() {
    root.clearTimeout(state.pollTimer);
    state.pollTimer = root.setTimeout(async () => {
      try {
        const response = await fetch(endpoint(state.local, false), { headers: requestHeaders() });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || `Workflow refresh failed (${response.status}).`);
        await applyRemote(payload);
      } catch (error) { setStatus("offline", { error: error.message }); }
      schedulePoll();
    }, 12000);
  }

  function sendSocket(operation) {
    return new Promise((resolve, reject) => {
      if (!state.socket || state.socket.readyState !== 1) { reject(new Error("The live workflow connection is not ready.")); return; }
      const requestId = operation.requestId || Core.uid("live"); const body = Object.assign({}, operation, { requestId });
      const timer = root.setTimeout(() => { state.pending.delete(requestId); reject(new Error("The live workflow operation timed out.")); }, 15000);
      state.pending.set(requestId, { resolve, reject, timer });
      try { state.socket.send(JSON.stringify(body)); }
      catch (error) { state.pending.delete(requestId); root.clearTimeout(timer); reject(error); }
    });
  }

  async function sendHttp(operation) {
    const requestId = operation.requestId || Core.uid("live");
    const response = await fetch(endpoint(state.local, false), { method: "POST", headers: requestHeaders(), body: JSON.stringify(Object.assign({}, operation, { requestId })) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || `Workflow operation failed (${response.status}).`);
    if (payload.snapshot) await applyRemote(payload.snapshot);
    return payload;
  }

  async function perform(operation) {
    if (!state.started) start(await DB.loadAll());
    if (state.socket && state.socket.readyState === 1) {
      try { return await sendSocket(operation); }
      catch (error) { return sendHttp(operation); }
    }
    return sendHttp(operation);
  }

  function scheduleSync(snapshot) {
    if (snapshot) state.local = snapshot;
    root.clearTimeout(state.syncTimer);
    state.syncTimer = root.setTimeout(() => perform({ type: "sync_projects", projects: projections(state.local) }).catch(error => setStatus("offline", { error: error.message })), 250);
  }

  function start(snapshot) {
    state.local = snapshot || state.local;
    if (state.started) { scheduleSync(state.local); return api; }
    state.started = true;
    if (root.BroadcastChannel) {
      state.channel = new BroadcastChannel("sts-geoflow-control-live");
      state.channel.addEventListener("message", event => {
        if (event.data && event.data.type === "refresh" && Number(event.data.revision) > state.lastRevision) schedulePoll();
      });
    }
    openSocket();
    root.setTimeout(() => {
      if (!state.socket || state.socket.readyState !== 1) scheduleSync(state.local);
    }, 1800);
    return api;
  }

  function projectStorageKey(projectId) {
    try {
      const registry = typeof PJ !== "undefined" && PJ && Array.isArray(PJ.projects) ? PJ : JSON.parse(root.localStorage.getItem("geoflow-projects") || "{}");
      const project = (registry.projects || []).find(item => item.pid === projectId);
      return Core.text(project && project.syncKey) || `__project_${projectId}__`;
    } catch (error) { return `__project_${projectId}__`; }
  }

  function fileData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error || new Error("The result file could not be read.")); reader.readAsDataURL(file);
    });
  }

  async function uploadLabResult(file, projectId, taskId) {
    if (!file) return { id: "", name: "" };
    if (file.size > 14 * 1024 * 1024) throw new Error("Laboratory result attachments must be 14 MB or smaller.");
    const project = projectStorageKey(projectId); const id = `lab-${Core.slug(taskId)}-${Date.now().toString(36)}`.slice(0, 80);
    const response = await fetch("/api/v1/files", {
      method: "POST", headers: requestHeaders(projectId, project),
      body: JSON.stringify({ project, projectId, id, name: file.name, kind: "lab-result", data: await fileData(file) })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || `Laboratory result upload failed (${response.status}).`);
    return { id: payload.id || id, name: file.name };
  }

  function stop() {
    state.started = false; root.clearTimeout(state.reconnectTimer); root.clearTimeout(state.pollTimer); root.clearTimeout(state.syncTimer);
    if (state.socket) { try { state.socket.close(1000, "Control Tower closed"); } catch (error) {} state.socket = null; }
    if (state.channel) { state.channel.close(); state.channel = null; }
  }

  if (root && root.addEventListener) root.addEventListener("geoflow:report-workflow", event => {
    const detail = event && event.detail || {};
    perform({
      type: "report_event", projectId: Core.text(detail.projectId), jobId: Core.text(detail.jobId || detail.projectId),
      reportId: Core.text(detail.reportId), title: Core.text(detail.title), action: Core.text(detail.action),
      status: Core.text(detail.status), revision: Core.text(detail.revision)
    }).catch(() => {});
  });

  const api = Object.freeze({ start, stop, perform, scheduleSync, uploadLabResult, status: statusSnapshot, projections, state });
  return api;
});

(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GeoFlowScopeBoreholes = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function number(value) {
    if (value === "" || value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function hasLogData(log) {
    if (!log) return false;
    if (["soil", "rock", "spt", "samples", "dcp", "groundwater"].some(key => Array.isArray(log[key]) && log[key].length)) return true;
    if (log.gw && (log.gw.depth || log.gw.state || log.gw.note)) return true;
    return Boolean(log.corebox && (log.corebox.img || (log.corebox.defects || []).length));
  }

  function isBlankPlaceholder(record, log) {
    const factualKeys = ["plannedDepth", "planned", "termDepth", "termReason", "startDate", "endDate", "rl", "easting", "northing", "surface", "locationDesc"];
    return !factualKeys.some(key => text(record && record[key])) && !hasLogData(log);
  }

  function boreholeRequirements(plan, plannedBorehole) {
    const boreholes = Array.isArray(plan && plan.bhs) ? plan.bhs : [];
    const id = text(plannedBorehole && plannedBorehole.id);
    const spt = (plan.spt || []).find(row => text(row.bh) === id);
    const groundwater = (plan.gw || []).find(row => text(row.bh) === id);
    const dcpQuantity = number(plan.dcp && plan.dcp.qty);
    const dcpRequired = Boolean(plan.dcp) && (plan.dcp.perBorehole === true || dcpQuantity == null || dcpQuantity >= boreholes.length);
    const samplesRequired = Boolean((plan.samples || []).length || (plan.labs || []).length);
    const coreRequired = Boolean(plan.core && plan.core.required);
    const monitoringWell = Boolean(groundwater && /standpipe|piezometer|monitoring\s+well/i.test(text(groundwater.task)));
    const depth = number(plannedBorehole && plannedBorehole.depth);
    const parts = [];
    if (depth != null) parts.push(`Target ${depth} m${plannedBorehole.refusal ? " or refusal" : ""}`);
    else if (plannedBorehole && plannedBorehole.refusal) parts.push("Terminate at refusal");
    if (spt) parts.push(`SPT ${typeof spt.tests === "number" ? `${spt.tests} test(s)` : "required"}${spt.interval ? ` at ${spt.interval} m intervals` : ""}`);
    if (dcpRequired) parts.push("DCP required");
    if (samplesRequired) {
      const names = (plan.samples || []).map(row => text(row.type)).filter(Boolean);
      parts.push(names.length ? `Samples: ${names.join(", ")}` : "Sampling required");
    }
    if (groundwater) parts.push("Groundwater observation required");
    if (coreRequired) parts.push("Rock coring required");
    const labNames = (plan.labs || []).map(row => text(row.test)).filter(Boolean);
    if (labNames.length) parts.push(`Lab: ${labNames.join(", ")}`);
    return {
      depth,
      refusalAllowed: Boolean(plannedBorehole && plannedBorehole.refusal),
      samplesReq: samplesRequired,
      sptReq: Boolean(spt),
      dcpReq: dcpRequired,
      gwReq: Boolean(groundwater),
      coreReq: coreRequired,
      standpipeReq: monitoringWell,
      photoReq: coreRequired,
      details: parts.join("; ")
    };
  }

  function materialise(state, plan, options) {
    const settings = options || {};
    const blankBorehole = settings.blankBorehole || (id => ({ id }));
    const blankLogs = settings.blankLogs || (() => ({ soil: [], rock: [], spt: [], samples: [] }));
    const source = text(settings.source);
    const approvedAt = text(settings.approvedAt) || new Date().toISOString();
    const version = settings.version == null ? null : settings.version;
    state.boreholes = Array.isArray(state.boreholes) ? state.boreholes : [];
    state.logs = state.logs && typeof state.logs === "object" ? state.logs : {};
    const result = { added: 0, updated: 0, total: 0, ids: [] };

    for (const planned of Array.isArray(plan && plan.bhs) ? plan.bhs : []) {
      const id = text(planned && planned.id);
      if (!id) continue;
      let record = state.boreholes.find(row => text(row && row.id) === id);
      const isNew = !record;
      if (isNew) {
        record = Object.assign({}, blankBorehole(id), { id });
        state.boreholes.push(record);
        result.added++;
      }
      const before = JSON.stringify(record);
      const requirements = boreholeRequirements(plan, planned);
      const adoptScope = isNew || record.scopeManaged === true || isBlankPlaceholder(record, state.logs[id]);
      const existingDepth = number(record.plannedDepth) != null ? number(record.plannedDepth) : number(record.planned);
      const plannedDepth = existingDepth != null ? existingDepth : requirements.depth;
      if (plannedDepth != null) {
        record.plannedDepth = plannedDepth;
        record.planned = plannedDepth;
      }
      record.refusalAllowed = Boolean(record.refusalAllowed || requirements.refusalAllowed);
      if (adoptScope) {
        record.samplesReq = requirements.samplesReq;
        record.sptReq = requirements.sptReq;
        record.dcpReq = requirements.dcpReq;
        record.gwReq = requirements.gwReq;
        record.coreReq = requirements.coreReq;
        record.standpipeReq = requirements.standpipeReq;
        record.photoReq = requirements.photoReq;
        record.scopeManaged = true;
      } else {
        for (const key of ["samplesReq", "sptReq", "dcpReq", "gwReq", "coreReq", "standpipeReq", "photoReq"]) {
          if (requirements[key]) record[key] = true;
        }
      }
      record.scopeLinked = true;
      record.scopeDetails = requirements.details;
      record.scopeSource = source;
      record.scopeApprovedAt = approvedAt;
      if (version != null) record.scopeVersion = version;
      if (!state.logs[id]) state.logs[id] = blankLogs();
      if (!isNew && JSON.stringify(record) !== before) result.updated++;
      result.ids.push(id);
    }
    result.total = result.ids.length;
    if ((!state.activeBh || !state.boreholes.some(row => row.id === state.activeBh)) && result.ids.length) state.activeBh = result.ids[0];
    return result;
  }

  return { boreholeRequirements, isBlankPlaceholder, materialise };
});

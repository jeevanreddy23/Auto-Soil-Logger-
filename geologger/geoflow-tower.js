(function (root, factory) {
  let core = root && root.GeoFlowUICore;
  if (!core && typeof require === "function") core = require("./geoflow-ui-core.js");
  const api = factory(core, root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.GeoFlowTower = api;
    if (root.document) api.install();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core, root) {
  "use strict";

  if (!Core) throw new Error("GeoFlowTower requires GeoFlowUICore");

  const REVIEW_RANK = { draft: 1, "field-entered": 2, submitted: 3, reviewed: 4, approved: 5 };
  const WEATHER_RANK = { RS: 0, XW: 0, EW: 0, HW: 1, DW: 2, MW: 2, SW: 3, FR: 4 };
  const STRENGTH_RANK = { EL: 0, VL: 0, L: 1, M: 2, H: 3, VH: 4, EH: 5 };
  const SERIES = [
    { colour: "#0A4C3A", dash: "", marker: "circle" },
    { colour: "#303B35", dash: "7 4", marker: "square" },
    { colour: "#14734B", dash: "2 3", marker: "diamond" },
    { colour: "#66716A", dash: "10 3 2 3", marker: "triangle" },
    { colour: "#95651E", dash: "4 3", marker: "cross" }
  ];
  const MATERIAL_LABELS = {
    FILL: "Fill", TOPSOIL: "Topsoil", NATURAL: "Natural soil", RESIDUAL: "Residual soil",
    XW: "Extremely weathered rock", HW: "Highly weathered rock", MW: "Moderately weathered rock",
    SW: "Slightly weathered rock", FR: "Fresh rock"
  };
  const CELL_META = {
    complete: { symbol: "&#10003;", label: "Complete" },
    missing: { symbol: "!", label: "Missing or incomplete" },
    "not-required": { symbol: "&#9675;", label: "Not required" },
    "no-data": { symbol: "&mdash;", label: "No data" }
  };

  let ui = {
    towerId: "ALL", boreholeId: "ALL", depthFrom: "", depthTo: "", depthMode: "depth",
    includeDraft: false, material: "ALL", testType: "ALL", selectedId: "", detail: null
  };
  let cloudFiles = [];
  let cloudFilesLoaded = false;
  let cloudFilesLoading = false;
  let lazyObserver = null;
  let legacyObserver = null;

  function text(value) { return Core.text(value); }
  function num(value) { return Core.num(value); }
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function attr(value) { return esc(value).replace(/'/g, "&#39;"); }
  function formatNumber(value, digits) {
    const parsed = num(value);
    return parsed == null ? "-" : parsed.toFixed(digits == null ? 2 : digits);
  }
  function formatDepth(value) { const parsed = num(value); return parsed == null ? "-" : `${parsed.toFixed(2)} m`; }
  function formatRl(value) { const parsed = num(value); return parsed == null ? "-" : `${parsed.toFixed(2)} m AHD`; }
  function entered(row, keys) {
    if (!row || typeof row !== "object") return false;
    return keys.some((key) => typeof row[key] === "boolean" ? row[key] : text(row[key]) !== "");
  }
  function statusToken(value) {
    const raw = text(value).toLowerCase().replace(/[_\s]+/g, "-");
    if (/approve/.test(raw)) return "approved";
    if (/review|check|confirm/.test(raw)) return "reviewed";
    if (/submit/.test(raw)) return "submitted";
    if (/field|entered|logged|complete/.test(raw)) return "field-entered";
    if (/draft|incomplete|not-started/.test(raw)) return "draft";
    return "";
  }

  function recordStatus(row, parent) {
    const source = row && typeof row === "object" ? row : {};
    if (source.approved === true || source.isApproved === true) return "approved";
    if (source.reviewed === true || source.checked === true || source.confirmed === true) return "reviewed";
    if (source.submitted === true) return "submitted";
    const explicit = statusToken(source.reviewStatus || source.approvalStatus || source.recordStatus || source.status);
    if (explicit) return explicit;
    const owner = parent && typeof parent === "object" ? parent : {};
    if (owner.approved === true || statusToken(owner.reviewStatus || owner.status) === "approved") return "approved";
    if (owner.reviewed === true || owner.checked === true || statusToken(owner.reviewStatus) === "reviewed") return "reviewed";
    return Object.keys(source).length ? "field-entered" : "draft";
  }

  function recordVisible(row, parent, includeDraft) {
    return includeDraft || REVIEW_RANK[recordStatus(row, parent)] >= REVIEW_RANK.reviewed;
  }

  function depthToRl(depth, groundRl) {
    const d = num(depth); const rl = num(groundRl);
    return d == null || rl == null ? null : rl - d;
  }

  function groundRl(state, borehole) {
    return num(borehole && (borehole.rl != null ? borehole.rl : borehole.groundRL)) ?? num(state && state.project && state.project.groundRL);
  }

  function classifySoil(row) {
    const haystack = [row && row.fillNatural, row && row.origin, row && row.material, row && row.description]
      .map(text).join(" ").toUpperCase();
    if (/\bFILL\b|ANTHROPOGENIC/.test(haystack)) return "FILL";
    if (/TOPSOIL|TOP SOIL/.test(haystack)) return "TOPSOIL";
    if (/RESIDUAL/.test(haystack)) return "RESIDUAL";
    return "NATURAL";
  }

  function normaliseWeathering(value) {
    const raw = text(value).toUpperCase().replace(/[^A-Z]/g, "");
    if (raw === "RS" || raw === "EW") return "XW";
    return Object.prototype.hasOwnProperty.call(WEATHER_RANK, raw) ? raw : "MW";
  }

  function geologyIntervals(state, boreholeId, options) {
    const source = state || {};
    const borehole = (source.boreholes || []).find((item) => item.id === boreholeId) || {};
    const log = Core.normaliseLog(source.logs && source.logs[boreholeId]);
    const config = Object.assign({ includeDraft: true, material: "ALL", depthFrom: null, depthTo: null }, options || {});
    const rows = [];
    log.soil.forEach((row, index) => {
      const from = num(row.from); const to = num(row.to);
      if (from == null || to == null || to <= from || !entered(row, ["material", "description", "origin", "fillNatural"])) return;
      if (!recordVisible(row, borehole, config.includeDraft)) return;
      const material = classifySoil(row);
      rows.push({ boreholeId, source: "soil", index, from, to, material, label: text(row.description || row.material || MATERIAL_LABELS[material]), status: recordStatus(row, borehole), row });
    });
    log.rock.forEach((row, index) => {
      const from = num(row.from); const to = num(row.to);
      if (from == null || to == null || to <= from || row.defectType || !entered(row, ["rockType", "description", "weathering", "strength"])) return;
      if (!recordVisible(row, borehole, config.includeDraft)) return;
      const material = normaliseWeathering(row.weathering);
      rows.push({ boreholeId, source: "rock", index, from, to, material, label: text(row.description || `${row.rockType || "Rock"} ${row.weathering || ""}`), status: recordStatus(row, borehole), row });
    });
    return rows.filter((row) => {
      if (config.material !== "ALL" && row.material !== config.material) return false;
      if (num(config.depthFrom) != null && row.to <= num(config.depthFrom)) return false;
      if (num(config.depthTo) != null && row.from >= num(config.depthTo)) return false;
      return true;
    }).sort((a, b) => a.from - b.from || a.to - b.to);
  }

  function competentRockRule(project) {
    const source = project && typeof project === "object" ? project : {};
    const raw = source.competentRockRule;
    if (raw && typeof raw === "object") {
      const weathering = normaliseWeathering(raw.minimumWeathering || raw.maxWeathering || raw.weathering || "");
      return {
        configured: Boolean(raw.minimumWeathering || raw.maxWeathering || raw.weathering || raw.minimumStrength || raw.minStrength || num(raw.minimumRqd) != null || num(raw.minRqd) != null),
        weathering,
        strength: text(raw.minimumStrength || raw.minStrength).toUpperCase(),
        rqd: num(raw.minimumRqd != null ? raw.minimumRqd : raw.minRqd),
        label: text(raw.label)
      };
    }
    if (text(source.competentRockWeathering)) {
      return { configured: true, weathering: normaliseWeathering(source.competentRockWeathering), strength: "", rqd: null, label: "" };
    }
    return { configured: false, weathering: "", strength: "", rqd: null, label: "" };
  }

  function intervalMeetsCompetentRule(interval, rule) {
    if (!rule || !rule.configured || interval.source !== "rock") return false;
    const row = interval.row || {};
    if (rule.weathering && WEATHER_RANK[normaliseWeathering(row.weathering)] < WEATHER_RANK[rule.weathering]) return false;
    if (rule.strength && STRENGTH_RANK[text(row.strength).toUpperCase()] < STRENGTH_RANK[rule.strength]) return false;
    if (rule.rqd != null) {
      const rqd = num(row.rqd);
      if (rqd == null || rqd < rule.rqd) return false;
    }
    return true;
  }

  function extractCriticalDepths(state, boreholeId, options) {
    const source = state || {};
    const borehole = (source.boreholes || []).find((item) => item.id === boreholeId) || {};
    const config = Object.assign({ includeDraft: true }, options || {});
    const intervals = geologyIntervals(source, boreholeId, { includeDraft: config.includeDraft });
    const fill = intervals.filter((row) => row.material === "FILL");
    const residual = intervals.filter((row) => row.material === "RESIDUAL");
    const rock = intervals.filter((row) => row.source === "rock");
    const rule = competentRockRule(source.project);
    const competent = rule.configured ? rock.find((row) => intervalMeetsCompetentRule(row, rule)) : null;
    const termination = num(borehole.termDepth != null ? borehole.termDepth : borehole.finalDepth);
    return {
      boreholeId,
      fillBase: fill.length ? Math.max(...fill.map((row) => row.to)) : null,
      residualBase: residual.length ? Math.max(...residual.map((row) => row.to)) : null,
      rockhead: rock.length ? Math.min(...rock.map((row) => row.from)) : null,
      competentRock: competent ? competent.from : null,
      competentRule: rule,
      termination: termination != null ? termination : Core.loggedBoreholeDepth(source, boreholeId) || null,
      terminationMeasured: termination != null,
      groundRl: groundRl(source, borehole)
    };
  }

  function groundwaterObservations(log) {
    const source = Core.normaliseLog(log);
    const rows = source.groundwater.slice();
    if (!rows.length && entered(source.gw, ["state", "depth", "stabilisedDepth", "stableDepth", "date", "time", "remarks"])) rows.push(source.gw);
    return rows;
  }

  function groundwaterState(log) {
    const rows = groundwaterObservations(log);
    if (!rows.length) return { state: "Not recorded", category: "no-data", depth: null, stableDepth: null, observations: [] };
    const latest = rows.slice().sort((a, b) => `${b.date || ""} ${b.time || ""}`.localeCompare(`${a.date || ""} ${a.time || ""}`))[0];
    const state = text(latest.state || latest.observation || "Observed");
    const negative = /not encountered|dry|none|gwne/i.test(state);
    const depth = negative ? null : num(latest.depth);
    const stableDepth = negative ? null : num(latest.stabilisedDepth != null ? latest.stabilisedDepth : latest.stableDepth);
    return { state, category: negative ? "not-encountered" : depth != null || stableDepth != null ? "observed" : "state-only", depth, stableDepth, observations: rows };
  }

  function coverageCell(status, detail, nav) {
    return { status, detail: text(detail), nav: nav || "bh-overview" };
  }

  function explicitRequirement(borehole, keys) {
    for (const key of keys) if (typeof borehole[key] === "boolean") return borehole[key];
    return null;
  }

  function requirementCell(required, count, complete, detail, nav) {
    if (count > 0) return coverageCell(complete === false ? "missing" : "complete", detail, nav);
    if (required === true) return coverageCell("missing", detail || "Required record is missing", nav);
    if (required === false) return coverageCell("not-required", "Marked not required", nav);
    return coverageCell("no-data", "Requirement not recorded", nav);
  }

  function fileReady(files, boreholeId) {
    return (Array.isArray(files) ? files : []).some((file) => {
      const id = text(file.id).toLowerCase(); const name = text(file.name).toLowerCase();
      const bh = text(boreholeId).toLowerCase();
      return id === `report-${bh}` || name === `log-${bh}.pdf` || (name.includes(bh) && name.endsWith(".pdf") && /borehole|log/.test(name));
    });
  }

  function coverageRows(state, files) {
    const source = state || {};
    const labStatus = source.labStatus || {};
    return (source.boreholes || []).map((borehole) => {
      const id = borehole.id;
      const log = Core.normaliseLog(source.logs && source.logs[id]);
      const loggedDepth = Core.loggedBoreholeDepth(source, id);
      const planned = num(borehole.plannedDepth != null ? borehole.plannedDepth : borehole.planned);
      const spt = log.spt.filter((row) => Core.deriveSpt(row).hasData);
      const sptComplete = spt.length > 0 && spt.every((row) => ["Complete", "Refusal", "Hammer bounce"].includes(Core.deriveSpt(row).status));
      const samples = log.samples.filter((row) => entered(row, ["sid", "sampleId", "from", "stype", "type"]));
      const coreRuns = log.rock.filter((row) => num(row.from) != null && num(row.to) != null && entered(row, ["tcr", "scr", "rqd"]));
      const gw = groundwaterState(log);
      const requestedLab = samples.filter((row) => text(row.tests || row.labTests));
      const pendingLab = requestedLab.filter((row) => !/returned|complete|approved/i.test(text(labStatus[row.sid || row.sampleId] || row.labStatus || row.status)));
      const hasCoords = num(borehole.easting) != null && num(borehole.northing) != null;
      const oneCoord = num(borehole.easting) != null || num(borehole.northing) != null;
      const reviewed = ["reviewed", "approved"].includes(recordStatus({}, borehole));
      const anyLog = loggedDepth > 0 || spt.length > 0 || samples.length > 0;
      const cells = {
        location: hasCoords ? coverageCell("complete", `${borehole.easting}, ${borehole.northing}`, "boreholes") : oneCoord ? coverageCell("missing", "One coordinate is blank", "boreholes") : coverageCell("no-data", "Coordinates not entered", "boreholes"),
        planned: planned != null ? coverageCell("complete", formatDepth(planned), "boreholes") : coverageCell("no-data", "Planned depth not entered", "boreholes"),
        actual: loggedDepth > 0 ? coverageCell(borehole.termDepth || borehole.finalDepth ? "complete" : "missing", `${formatDepth(loggedDepth)}${borehole.termDepth || borehole.finalDepth ? " final" : " logged; termination not set"}`, "boreholes") : coverageCell("missing", "No investigated depth", "boreholes"),
        spt: requirementCell(explicitRequirement(borehole, ["sptReq", "sptRequired"]), spt.length, sptComplete, spt.length ? `${spt.length} test(s)` : "Required SPT is missing", "spt"),
        samples: requirementCell(explicitRequirement(borehole, ["samplesReq", "samplesRequired"]), samples.length, true, samples.length ? `${samples.length} sample(s)` : "Required samples are missing", "samples"),
        core: requirementCell(explicitRequirement(borehole, ["coreReq", "coreRequired"]), coreRuns.length, coreRuns.every((row) => num(row.tcr) != null && num(row.rqd) != null), coreRuns.length ? `${coreRuns.length} core run(s)` : "Required core log is missing", "rock"),
        groundwater: requirementCell(explicitRequirement(borehole, ["groundwaterReq", "standpipeReq", "gwRequired"]), gw.observations.length, true, gw.observations.length ? gw.state : "Required observation is missing", "groundwater"),
        laboratory: requestedLab.length ? coverageCell(pendingLab.length ? "missing" : "complete", pendingLab.length ? `${pendingLab.length} requested sample(s) pending` : `${requestedLab.length} requested sample(s) returned`, "laboratory") : coverageCell("not-required", "No laboratory tests requested", "laboratory"),
        reviewed: reviewed ? coverageCell("complete", recordStatus({}, borehole), "validation") : anyLog ? coverageCell("missing", "Log review status is not Reviewed or Approved", "validation") : coverageCell("no-data", "No log to review", "validation"),
        pdf: fileReady(files, id) ? coverageCell("complete", "Cloudflare PDF available", "preview") : reviewed ? coverageCell("missing", "Reviewed log has no PDF", "preview") : coverageCell("no-data", "PDF is not expected before review", "preview")
      };
      return { id, borehole, log, loggedDepth, plannedDepth: planned, cells };
    });
  }

  function coreRuns(state, boreholeId, options) {
    const source = state || {}; const borehole = (source.boreholes || []).find((item) => item.id === boreholeId) || {};
    const config = Object.assign({ includeDraft: true, depthFrom: null, depthTo: null }, options || {});
    return Core.normaliseLog(source.logs && source.logs[boreholeId]).rock.map((row, index) => ({
      boreholeId, index, row, from: num(row.from), to: num(row.to), tcr: num(row.tcr), scr: num(row.scr), rqd: num(row.rqd), is50: num(row.is50), status: recordStatus(row, borehole)
    })).filter((run) => run.from != null && run.to != null && run.to > run.from && [run.tcr, run.scr, run.rqd, run.is50].some((value) => value != null))
      .filter((run) => recordVisible(run.row, borehole, config.includeDraft))
      .filter((run) => num(config.depthFrom) == null || run.to > num(config.depthFrom))
      .filter((run) => num(config.depthTo) == null || run.from < num(config.depthTo));
  }

  function sptPoints(state, boreholeId, options) {
    const source = state || {}; const borehole = (source.boreholes || []).find((item) => item.id === boreholeId) || {};
    const config = Object.assign({ includeDraft: true, depthFrom: null, depthTo: null }, options || {});
    return Core.normaliseLog(source.logs && source.logs[boreholeId]).spt.map((row, index) => {
      const result = Core.deriveSpt(row); const depth = num(row.depth != null ? row.depth : row.from);
      return { boreholeId, index, row, depth, result, n: result.calculatedN != null ? result.calculatedN : num(row.n), status: recordStatus(row, borehole) };
    }).filter((point) => point.depth != null && point.result.hasData && recordVisible(point.row, borehole, config.includeDraft))
      .filter((point) => num(config.depthFrom) == null || point.depth >= num(config.depthFrom))
      .filter((point) => num(config.depthTo) == null || point.depth <= num(config.depthTo));
  }

  function significantDefects(state, boreholeId, options) {
    const source = state || {}; const borehole = (source.boreholes || []).find((item) => item.id === boreholeId) || {};
    const config = Object.assign({ includeDraft: true }, options || {});
    const defects = Core.normaliseLog(source.logs && source.logs[boreholeId]).corebox.defects || [];
    return defects.map((row, index) => ({ boreholeId, index, row, from: num(row.from), to: num(row.to), code: text(row.code || row.defectType) }))
      .filter((item) => item.from != null && recordVisible(item.row, borehole, config.includeDraft))
      .filter((item) => item.row.significant === true || /^(FZ|SZ|CZ|CL|V)$/i.test(item.code));
  }

  function towerIdFor(borehole, project) {
    return text(borehole && (borehole.towerId || borehole.tower || borehole.structureId)) || text(project && (project.towerId || project.tower || project.structureId)) || "Project tower";
  }

  function reviewIssues(state, coverage, critical) {
    const ids = new Set(coverage.map((row) => row.id));
    const issues = Core.collectValidation(state).filter((issue) => !issue.boreholeId || ids.has(issue.boreholeId));
    coverage.forEach((row) => Object.entries(row.cells).forEach(([key, cell]) => {
      if (cell.status !== "missing") return;
      issues.push({ id: `tower-${row.id}-${key}`, severity: key === "actual" ? "error" : "warning", area: "Coverage", nav: cell.nav, boreholeId: row.id, depth: null, code: `coverage-${key}`, message: `${row.id}: ${cell.detail}.` });
    }));
    if (critical.some((item) => item.rockhead != null) && !critical.some((item) => item.competentRule.configured)) {
      issues.push({ id: "tower-competent-rule", severity: "suggestion", area: "Foundation depths", nav: "project", boreholeId: "", depth: null, code: "competent-rule", message: "Competent-rock depth is unavailable because no project criterion is configured." });
    }
    const order = { error: 0, warning: 1, suggestion: 2 };
    return issues.sort((a, b) => order[a.severity] - order[b.severity] || `${a.boreholeId}-${a.depth || 0}`.localeCompare(`${b.boreholeId}-${b.depth || 0}`));
  }

  function aggregateTower(state, filters, files) {
    const source = state || { project: {}, boreholes: [], logs: {} };
    const config = Object.assign({}, ui, filters || {});
    let boreholes = (source.boreholes || []).filter((borehole) => config.towerId === "ALL" || towerIdFor(borehole, source.project) === config.towerId);
    if (config.boreholeId !== "ALL") boreholes = boreholes.filter((borehole) => borehole.id === config.boreholeId);
    const ids = boreholes.map((borehole) => borehole.id);
    const intervalOptions = { includeDraft: config.includeDraft, material: config.material, depthFrom: config.depthFrom, depthTo: config.depthTo };
    const allCoverage = coverageRows(source, files).filter((row) => ids.includes(row.id));
    const critical = ids.map((id) => extractCriticalDepths(source, id, { includeDraft: config.includeDraft }));
    const intervals = Object.fromEntries(ids.map((id) => [id, geologyIntervals(source, id, intervalOptions)]));
    const spt = Object.fromEntries(ids.map((id) => [id, sptPoints(source, id, intervalOptions)]));
    const quality = Object.fromEntries(ids.map((id) => [id, coreRuns(source, id, intervalOptions)]));
    const groundwater = Object.fromEntries(ids.map((id) => [id, groundwaterState(source.logs && source.logs[id])]));
    const defects = Object.fromEntries(ids.map((id) => [id, significantDefects(source, id, intervalOptions)]));
    return {
      state: source, project: source.project || {}, config, boreholes, ids, coverage: allCoverage, critical, intervals, spt, quality, groundwater, defects,
      issues: reviewIssues(source, allCoverage, critical),
      maxDepth: Math.max(1, ...ids.map((id) => Core.maxBoreholeDepth(source, id))),
      towerOptions: [...new Set((source.boreholes || []).map((borehole) => towerIdFor(borehole, source.project)))]
    };
  }

  function coverageSummary(rows) {
    const pointDone = rows.filter((row) => row.cells.actual.status === "complete").length;
    const requiredSpt = rows.filter((row) => row.cells.spt.status !== "not-required" && row.cells.spt.status !== "no-data");
    const completeSpt = requiredSpt.filter((row) => row.cells.spt.status === "complete");
    const requiredCore = rows.filter((row) => row.cells.core.status !== "not-required" && row.cells.core.status !== "no-data");
    const completeCore = requiredCore.filter((row) => row.cells.core.status === "complete");
    const pendingLab = rows.filter((row) => row.cells.laboratory.status === "missing").length;
    return { pointDone, pointTotal: rows.length, sptDone: completeSpt.length, sptTotal: requiredSpt.length, coreDone: completeCore.length, coreTotal: requiredCore.length, pendingLab };
  }

  function markerShape(x, y, shape, colour, size) {
    const r = size || 5;
    if (shape === "square") return `<rect x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" fill="${colour}"/>`;
    if (shape === "diamond") return `<path d="M ${x} ${y - r - 1} L ${x + r + 1} ${y} L ${x} ${y + r + 1} L ${x - r - 1} ${y} Z" fill="${colour}"/>`;
    if (shape === "triangle") return `<path d="M ${x} ${y - r - 1} L ${x + r + 1} ${y + r} L ${x - r - 1} ${y + r} Z" fill="${colour}"/>`;
    if (shape === "cross") return `<path d="M ${x - r} ${y - r} L ${x + r} ${y + r} M ${x + r} ${y - r} L ${x - r} ${y + r}" fill="none" stroke="${colour}" stroke-width="2.2"/>`;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${colour}"/>`;
  }

  function projectContext(model) {
    const project = model.project;
    let registry = null;
    try { if (typeof pjActive === "function") registry = pjActive(); } catch (error) { registry = null; }
    return {
      tower: ui.towerId !== "ALL" ? ui.towerId : model.towerOptions.length === 1 ? model.towerOptions[0] : "All tower locations",
      number: text(project.projectNumber || registry && registry.number) || "Project number not set",
      name: text(project.projectName || registry && registry.name) || "Geotechnical investigation",
      client: text(project.clientName || registry && registry.client) || "Client not set",
      site: text([project.siteAddress, project.suburb, project.state].filter(Boolean).join(", ") || registry && registry.address) || "Site location not set",
      towerType: text(project.towerType) || "-",
      foundationType: text(project.foundationType) || "-",
      status: text(project.reviewStatus || registry && registry.status) || "Engineering review pending",
      updated: text(project.updated || registry && registry.updated),
      reviewedBy: text(project.reviewedBy || project.checkedBy || project.approvedBy) || "-"
    };
  }

  function icon(name) {
    const premium = root && root.GeoFlowPremium;
    return premium && premium.icon ? premium.icon(name) : `<i data-lucide="${esc(name)}" aria-hidden="true"></i>`;
  }

  function contextHeader(model) {
    const context = projectContext(model);
    return `<header class="tower-context">
      <div class="tower-context-title"><span class="tower-kicker">Tower engineering review</span><h1>${esc(context.tower)}</h1><p><strong>${esc(context.number)}</strong> &nbsp; ${esc(context.name)} &nbsp; ${esc(context.site)}</p></div>
      <div class="tower-actions" aria-label="Tower actions">
        <button type="button" class="tower-button" data-tower-go="boreholes">${icon("map-pin")}<span>Open Boreholes</span></button>
        <button type="button" class="tower-button" data-tower-go="site-map">${icon("map")}<span>Open Site Map</span></button>
        <button type="button" class="tower-button" data-tower-review>${icon("list-checks")}<span>Review Missing Data</span></button>
        <button type="button" class="tower-button primary" data-tower-go="preview">${icon("file-text")}<span>Tower Summary</span></button>
      </div>
      <dl class="tower-context-meta">
        <div><dt>Client</dt><dd>${esc(context.client)}</dd></div><div><dt>Tower type</dt><dd>${esc(context.towerType)}</dd></div>
        <div><dt>Foundation</dt><dd>${esc(context.foundationType)}</dd></div><div><dt>Review status</dt><dd><span class="tower-status ${/approve|complete/i.test(context.status) ? "approved" : "pending"}">${esc(context.status)}</span></dd></div>
        <div><dt>Last updated</dt><dd>${context.updated ? esc(new Date(context.updated).toLocaleString()) : "-"}</dd></div><div><dt>Reviewed by</dt><dd>${esc(context.reviewedBy)}</dd></div>
      </dl>
    </header>`;
  }

  function filterBar(model) {
    const maxDepth = Math.ceil(model.maxDepth);
    return `<form class="tower-filterbar" id="towerFilters" aria-label="Tower dashboard filters">
      <label><span>Tower</span><select name="towerId"><option value="ALL">All tower locations</option>${model.towerOptions.map((id) => `<option value="${attr(id)}" ${ui.towerId === id ? "selected" : ""}>${esc(id)}</option>`).join("")}</select></label>
      <label><span>Investigation point</span><select name="boreholeId"><option value="ALL">All points</option>${(model.state.boreholes || []).map((borehole) => `<option value="${attr(borehole.id)}" ${ui.boreholeId === borehole.id ? "selected" : ""}>${esc(borehole.id)}</option>`).join("")}</select></label>
      <fieldset class="tower-segment"><legend>Vertical axis</legend><label><input type="radio" name="depthMode" value="depth" ${ui.depthMode === "depth" ? "checked" : ""}><span>Depth</span></label><label><input type="radio" name="depthMode" value="rl" ${ui.depthMode === "rl" ? "checked" : ""}><span>RL</span></label></fieldset>
      <div class="tower-depth-filter"><label><span>From (m)</span><input name="depthFrom" type="number" min="0" max="${maxDepth}" step="0.1" value="${attr(ui.depthFrom)}" placeholder="0"></label><label><span>To (m)</span><input name="depthTo" type="number" min="0" max="${maxDepth}" step="0.1" value="${attr(ui.depthTo)}" placeholder="${maxDepth}"></label></div>
      <label><span>Material</span><select name="material"><option value="ALL">All materials</option>${Object.entries(MATERIAL_LABELS).map(([value, label]) => `<option value="${value}" ${ui.material === value ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
      <label><span>Evidence</span><select name="testType">${[["ALL", "All evidence"], ["SPT", "SPT"], ["SAMPLE", "Samples"], ["CORE", "Rock core"], ["GW", "Groundwater"]].map(([value, label]) => `<option value="${value}" ${ui.testType === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <label class="tower-toggle"><input type="checkbox" name="includeDraft" ${ui.includeDraft ? "checked" : ""}><span aria-hidden="true"></span><b>Include draft / field data</b></label>
    </form>`;
  }

  function trustBanner(model) {
    const allIntervals = model.ids.reduce((count, id) => count + geologyIntervals(model.state, id, { includeDraft: true }).length, 0);
    const visible = model.ids.reduce((count, id) => count + model.intervals[id].length, 0);
    if (ui.includeDraft) return `<div class="tower-trust warning" role="status">${icon("triangle-alert")}<span><strong>Draft and field-entered records are visible.</strong> Use them for review, not as approved design inputs.</span></div>`;
    if (allIntervals > 0 && visible === 0) return `<div class="tower-trust empty" role="status">${icon("shield-check")}<span><strong>No Reviewed or Approved geological intervals match this view.</strong> ${allIntervals} field record${allIntervals === 1 ? " is" : "s are"} excluded.</span><button type="button" data-tower-include-draft>Include field data</button></div>`;
    return `<div class="tower-trust" role="status">${icon("shield-check")}<span><strong>Reviewed and Approved records only.</strong> Draft, submitted and unreviewed field records are excluded from engineering plots.</span></div>`;
  }

  function coverageMatrix(model) {
    const summary = coverageSummary(model.coverage);
    const columns = [
      ["location", "Location"], ["planned", "Planned depth"], ["actual", "Actual depth"], ["spt", "SPT"], ["samples", "Samples"],
      ["core", "Rock core"], ["groundwater", "Groundwater"], ["laboratory", "Laboratory"], ["reviewed", "Log reviewed"], ["pdf", "PDF ready"]
    ];
    const summaryLine = (label, done, total) => `<div><span>${esc(label)}</span><strong>${done}${total != null ? ` of ${total}` : ""}</strong></div>`;
    return `<section class="tower-section tower-coverage" id="towerCoverage" aria-labelledby="towerCoverageTitle">
      <div class="tower-section-head"><div><span class="tower-order">01 / Coverage</span><h2 id="towerCoverageTitle">Investigation coverage</h2></div><div class="tower-key" aria-label="Coverage symbols"><span class="complete">&#10003; Complete</span><span class="not-required">&#9675; Not required</span><span class="missing">! Missing</span><span>&mdash; No data</span></div></div>
      <div class="tower-coverage-summary">${summaryLine("Investigation points completed", summary.pointDone, summary.pointTotal)}${summaryLine("Required SPT coverage", summary.sptDone, summary.sptTotal)}${summaryLine("Required rock core logged", summary.coreDone, summary.coreTotal)}${summaryLine("Laboratory items pending", summary.pendingLab, null)}</div>
      <div class="tower-table-scroll"><table class="tower-table tower-coverage-table"><thead><tr><th scope="col">Point</th>${columns.map(([, label]) => `<th scope="col">${esc(label)}</th>`).join("")}</tr></thead><tbody>
        ${model.coverage.length ? model.coverage.map((row) => `<tr class="${ui.selectedId === row.id ? "selected" : ""}" data-tower-row="${attr(row.id)}"><th scope="row"><button type="button" class="tower-row-link" data-tower-select="${attr(row.id)}">${esc(row.id)}</button><small>${esc(Core.boreholeStatus(model.state, row.id))}</small></th>${columns.map(([key]) => {
          const cell = row.cells[key]; const meta = CELL_META[cell.status];
          return `<td><button type="button" class="tower-cell ${cell.status}" data-tower-cell="${key}" data-bh="${attr(row.id)}" data-nav="${attr(cell.nav)}" title="${attr(cell.detail || meta.label)}" aria-label="${attr(`${row.id} ${key}: ${meta.label}. ${cell.detail}`)}"><span aria-hidden="true">${meta.symbol}</span><small>${esc(meta.label)}</small></button></td>`;
        }).join("")}</tr>`).join("") : `<tr><td colspan="11" class="tower-empty-cell">No investigation points match the active filters.</td></tr>`}
      </tbody></table></div>
    </section>`;
  }

  function investigationType(id) {
    if (/^DCP/i.test(id)) return "DCP";
    if (/^(TP|TEST\s*PIT)/i.test(id)) return "TP";
    if (/^(GW|PZ)/i.test(id)) return "GW";
    return "BH";
  }

  function mapMarker(x, y, id, type, selected) {
    const cls = `tower-map-point ${selected ? "selected" : ""}`;
    let shape = `<circle cx="${x}" cy="${y}" r="9"/>`;
    if (type === "DCP") shape = `<path d="M ${x} ${y - 10} L ${x + 10} ${y + 8} L ${x - 10} ${y + 8} Z"/>`;
    if (type === "TP") shape = `<rect x="${x - 9}" y="${y - 9}" width="18" height="18"/>`;
    if (type === "GW") shape = `<path d="M ${x} ${y - 11} L ${x + 11} ${y} L ${x} ${y + 11} L ${x - 11} ${y} Z"/>`;
    return `<g class="${cls}" data-tower-select="${attr(id)}" role="button" tabindex="0" aria-label="Select ${attr(id)}">${shape}<text x="${x + 14}" y="${y + 4}">${esc(id)}</text></g>`;
  }

  function planView(model) {
    const points = model.boreholes.map((borehole) => ({ borehole, id: borehole.id, e: num(borehole.easting), n: num(borehole.northing), type: investigationType(borehole.id) }));
    const located = points.filter((point) => point.e != null && point.n != null);
    const coordSystem = text(model.project.coordSystem || model.project.coordinateSystem) || "Coordinate system not entered";
    let body;
    if (located.length) {
      const W = 1000; const H = 330; const pad = 58;
      let minE = Math.min(...located.map((point) => point.e)); let maxE = Math.max(...located.map((point) => point.e));
      let minN = Math.min(...located.map((point) => point.n)); let maxN = Math.max(...located.map((point) => point.n));
      if (maxE === minE) { minE -= 1; maxE += 1; }
      if (maxN === minN) { minN -= 1; maxN += 1; }
      const extentE = maxE - minE; const extentN = maxN - minN;
      const x = (value) => pad + (value - minE) / extentE * (W - pad * 2);
      const y = (value) => H - pad - (value - minN) / extentN * (H - pad * 2);
      const scale = Math.max(1, Math.pow(10, Math.floor(Math.log10(Math.max(extentE, extentN))) - 1));
      const towerE = num(model.project.towerEasting != null ? model.project.towerEasting : model.project.centreEasting);
      const towerN = num(model.project.towerNorthing != null ? model.project.towerNorthing : model.project.centreNorthing);
      body = `<div class="tower-plan-canvas"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Investigation location plan using entered coordinates">
        <defs><pattern id="towerPlanGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E8ECE9" stroke-width="1"/></pattern></defs>
        <rect x="${pad}" y="${pad / 2}" width="${W - pad * 2}" height="${H - pad * 1.5}" fill="url(#towerPlanGrid)" stroke="#DCE2DE"/>
        ${towerE != null && towerN != null ? `<g class="tower-centre" transform="translate(${x(towerE)} ${y(towerN)})"><path d="M -16 0 H 16 M 0 -16 V 16"/><circle r="5"/><text x="21" y="4">Tower centre</text></g>` : ""}
        ${located.map((point) => mapMarker(x(point.e), y(point.n), point.id, point.type, ui.selectedId === point.id)).join("")}
        <g class="tower-north" transform="translate(${W - 45} 45)"><text x="0" y="-18">N</text><path d="M 0 -12 L 8 9 L 0 5 L -8 9 Z"/></g>
        <g class="tower-scale" transform="translate(${pad} ${H - 18})"><path d="M 0 0 V -6 M 0 -3 H ${(scale / extentE) * (W - pad * 2)} M ${(scale / extentE) * (W - pad * 2)} 0 V -6"/><text x="${(scale / extentE) * (W - pad * 2) / 2}" y="13">${formatNumber(scale, scale < 10 ? 1 : 0)} m</text></g>
        <text class="tower-coord-label" x="${W - pad}" y="${H - 8}" text-anchor="end">${esc(coordSystem)}</text>
      </svg></div>`;
    } else {
      body = `<div class="tower-schematic" role="img" aria-label="Ordered investigation point schematic; coordinates are not entered"><div class="tower-schematic-label">Ordered schematic <span>Coordinates not entered</span></div><div class="tower-schematic-line"></div><div class="tower-schematic-points">${points.length ? points.map((point, index) => `<button type="button" class="${ui.selectedId === point.id ? "selected" : ""}" data-tower-select="${attr(point.id)}" style="--point-index:${index};--point-count:${Math.max(1, points.length - 1)}"><i class="${point.type.toLowerCase()}"></i><strong>${esc(point.id)}</strong><span>${point.type}</span></button>`).join("") : `<p>No investigation points are recorded.</p>`}</div><p class="tower-schematic-note">This is not a spatial map. Add easting and northing values to show measured relative positions.</p></div>`;
    }
    const omitted = points.length - located.length;
    return `<section class="tower-section" aria-labelledby="towerPlanTitle"><div class="tower-section-head"><div><span class="tower-order">02 / Context</span><h2 id="towerPlanTitle">Tower plan and investigation locations</h2></div><div class="tower-section-meta">${located.length ? `${located.length} coordinate${located.length === 1 ? "" : "s"} plotted${omitted ? `; ${omitted} omitted` : ""}` : "Schematic view"}</div></div>${body}</section>`;
  }

  function profileScale(model) {
    const from = num(ui.depthFrom) ?? 0; const to = num(ui.depthTo) ?? model.maxDepth;
    if (ui.depthMode === "depth") return { mode: "depth", min: from, max: Math.max(from + 0.1, to), value: (depth) => depth, label: "Depth below ground (m)" };
    const values = [];
    model.boreholes.forEach((borehole) => {
      const rl = groundRl(model.state, borehole);
      if (rl == null) return;
      values.push(rl - from, rl - to);
    });
    return values.length ? { mode: "rl", min: Math.min(...values), max: Math.max(...values), value: (depth, borehole) => depthToRl(depth, groundRl(model.state, borehole)), label: "Reduced level (m AHD)" } : { mode: "rl", min: 0, max: 1, value: () => null, label: "Reduced level unavailable" };
  }

  function geologyFill(material) {
    if (material === "FILL") return "url(#towerFill)";
    if (material === "TOPSOIL") return "url(#towerTopsoil)";
    if (material === "RESIDUAL") return "url(#towerResidual)";
    if (material === "NATURAL") return "#EEF1EF";
    if (material === "XW") return "url(#towerXw)";
    if (material === "HW") return "#C7D1CB";
    if (material === "MW") return "#AABCB0";
    if (material === "SW") return "#809D8B";
    return "#5E806B";
  }

  function profileDefs() {
    return `<defs>
      <pattern id="towerFill" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#E5E1D8"/><path d="M -2 2 L 2 -2 M 0 8 L 8 0 M 6 10 L 10 6" stroke="#8A8174" stroke-width="1"/></pattern>
      <pattern id="towerTopsoil" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#E7E4DD"/><circle cx="2" cy="2" r="1" fill="#6F6A60"/><circle cx="6" cy="6" r="1" fill="#6F6A60"/></pattern>
      <pattern id="towerResidual" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#DCE7DF"/><circle cx="3" cy="3" r="1.2" fill="#789080"/><circle cx="8" cy="7" r="1.2" fill="#789080"/></pattern>
      <pattern id="towerXw" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="#D3DDD6"/><path d="M 0 8 L 8 0 M 5 9 L 9 5" stroke="#7A8D80" stroke-width="1"/></pattern>
    </defs>`;
  }

  function axisTicks(scale, top, height, x) {
    const span = scale.max - scale.min; const count = 6;
    let markup = "";
    for (let index = 0; index <= count; index += 1) {
      const ratio = index / count;
      const value = scale.mode === "depth" ? scale.min + ratio * span : scale.max - ratio * span;
      const y = top + ratio * height;
      markup += `<line x1="${x}" y1="${y}" x2="980" y2="${y}" class="tower-grid-line"/><text x="${x - 10}" y="${y + 4}" text-anchor="end" class="tower-axis-text">${formatNumber(value, span < 5 ? 1 : 0)}</text>`;
    }
    return markup;
  }

  function crossSectionProfile(model) {
    const ids = model.ids; const lane = 138; const W = Math.max(900, 120 + ids.length * lane); const H = 455; const top = 52; const h = 350; const x0 = 82;
    const scale = profileScale(model); const span = Math.max(0.1, scale.max - scale.min);
    const yFor = (depth, borehole) => {
      const value = scale.value(depth, borehole);
      if (value == null) return null;
      return scale.mode === "depth" ? top + (value - scale.min) / span * h : top + (scale.max - value) / span * h;
    };
    const labelFor = (interval) => interval.material.length <= 4 ? interval.material : interval.material.slice(0, 3);
    let lanes = "";
    ids.forEach((id, index) => {
      const borehole = model.boreholes.find((item) => item.id === id) || {};
      const x = x0 + 34 + index * lane;
      const selected = ui.selectedId === id;
      const intervals = model.intervals[id] || [];
      const rl = groundRl(model.state, borehole);
      lanes += `<g class="tower-profile-lane ${selected ? "selected" : ""}" data-tower-select="${attr(id)}" role="button" tabindex="0" aria-label="Select ${attr(id)}"><text x="${x + 32}" y="25" text-anchor="middle" class="tower-lane-title">${esc(id)}</text><text x="${x + 32}" y="40" text-anchor="middle" class="tower-lane-meta">${scale.mode === "rl" ? rl == null ? "RL missing" : `GL ${formatNumber(rl, 2)}` : esc(recordStatus({}, borehole))}</text><rect x="${x}" y="${top}" width="64" height="${h}" class="tower-lane-backdrop"/>`;
      intervals.forEach((interval) => {
        const y1 = yFor(Math.max(interval.from, num(ui.depthFrom) ?? interval.from), borehole);
        const y2 = yFor(Math.min(interval.to, num(ui.depthTo) ?? interval.to), borehole);
        if (y1 == null || y2 == null) return;
        const y = Math.min(y1, y2); const height = Math.max(2, Math.abs(y2 - y1));
        lanes += `<g data-tower-detail="interval" data-bh="${attr(id)}" data-source="${interval.source}" data-index="${interval.index}" tabindex="0"><rect x="${x + 1}" y="${y}" width="62" height="${height}" fill="${geologyFill(interval.material)}" class="tower-stratum"><title>${esc(`${id}: ${formatDepth(interval.from)} to ${formatDepth(interval.to)}; ${interval.label}; ${interval.status}`)}</title></rect>${height >= 18 ? `<text x="${x + 32}" y="${y + Math.min(15, height / 2 + 4)}" text-anchor="middle" class="tower-stratum-label">${esc(labelFor(interval))}</text>` : ""}</g>`;
      });
      if (!intervals.length) lanes += `<rect x="${x + 1}" y="${top + 1}" width="62" height="${h - 2}" class="tower-no-strata"/><text x="${x + 32}" y="${top + h / 2}" text-anchor="middle" transform="rotate(-90 ${x + 32} ${top + h / 2})" class="tower-empty-label">No matching factual intervals</text>`;
      (model.spt[id] || []).forEach((point) => { const y = yFor(point.depth, borehole); if (y != null) lanes += `<path d="M ${x + 70} ${y} l 6 -6 l 6 6 l -6 6 Z" class="tower-event spt"><title>${esc(`${id} SPT ${formatDepth(point.depth)}: ${point.result.status}${point.n != null ? `, N=${point.n}` : ""}`)}</title></path>`; });
      Core.normaliseLog(model.state.logs && model.state.logs[id]).samples.filter((sample) => recordVisible(sample, borehole, ui.includeDraft)).forEach((sample) => { const depth = num(sample.from); const y = yFor(depth, borehole); if (y != null) lanes += `<circle cx="${x + 82}" cy="${y}" r="4" class="tower-event sample"><title>${esc(`${id} sample ${sample.sid || sample.sampleId || ""} at ${formatDepth(depth)}`)}</title></circle>`; });
      const gw = model.groundwater[id];
      if (gw && gw.depth != null) { const y = yFor(gw.depth, borehole); if (y != null) lanes += `<path d="M ${x - 9} ${y} h 72" class="tower-gw-line"/><path d="M ${x - 8} ${y - 5} l 5 5 l -5 5 Z" class="tower-gw-marker"><title>${esc(`${id} groundwater at ${formatDepth(gw.depth)}`)}</title></path>`; }
      lanes += `</g>`;
    });
    const legend = Object.entries(MATERIAL_LABELS).map(([code, label]) => `<span><i class="material ${code.toLowerCase()}"></i>${esc(label)}</span>`).join("");
    return `<section class="tower-section tower-profile-section" aria-labelledby="towerProfileTitle"><div class="tower-section-head"><div><span class="tower-order">03 / Primary profile</span><h2 id="towerProfileTitle">Cross-borehole subsurface profile</h2></div><div class="tower-section-meta">Exact logged intervals only &middot; no interpolation</div></div>
      <div class="tower-profile-scroll"><svg class="tower-profile" viewBox="0 0 ${W} ${H}" style="min-width:${W}px" role="img" aria-label="Subsurface interval comparison by ${esc(scale.label)}">${profileDefs()}<text x="15" y="18" class="tower-axis-label">${esc(scale.label)}</text>${axisTicks(scale, top, h, x0)}${lanes}</svg></div>
      <div class="tower-profile-legend">${legend}<span><i class="evidence spt"></i>SPT</span><span><i class="evidence sample"></i>Sample</span><span><i class="evidence gw"></i>Groundwater</span></div>
    </section>`;
  }

  function criticalDepths(model) {
    const maxDepth = Math.max(1, ...model.critical.map((row) => row.termination || row.rockhead || row.fillBase || 0));
    const marker = (value, cls, label) => value == null ? "" : `<span class="tower-depth-marker ${cls}" style="left:${Math.min(100, value / maxDepth * 100)}%" title="${attr(`${label}: ${formatDepth(value)}`)}"><i></i><small>${esc(label)}</small></span>`;
    const display = (row, key) => {
      const value = row[key]; if (value == null) return "-";
      const rl = depthToRl(value, row.groundRl);
      return `<strong>${formatNumber(value, 2)} m</strong>${rl != null ? `<small>RL ${formatNumber(rl, 2)}</small>` : ""}`;
    };
    return `<section class="tower-section" aria-labelledby="towerCriticalTitle"><div class="tower-section-head"><div><span class="tower-order">04 / Foundation depths</span><h2 id="towerCriticalTitle">Foundation-relevant depth comparison</h2></div><div class="tower-section-meta"><span class="tower-evidence-tag calculated">Calculated from factual intervals</span></div></div>
      <div class="tower-critical-layout"><div class="tower-depth-tracks">${model.critical.length ? model.critical.map((row) => `<button type="button" class="tower-depth-row ${ui.selectedId === row.boreholeId ? "selected" : ""}" data-tower-select="${attr(row.boreholeId)}"><strong>${esc(row.boreholeId)}</strong><span class="tower-depth-track">${marker(row.fillBase, "fill", "Fill")}${marker(row.residualBase, "residual", "Residual")}${marker(row.rockhead, "rockhead", "Rockhead")}${marker(row.competentRock, "competent", "Competent")}${marker(row.termination, "termination", "End")}</span><span>${formatDepth(row.termination)}</span></button>`).join("") : `<div class="tower-empty">No investigation points match the active filters.</div>`}</div>
      <div class="tower-table-scroll"><table class="tower-table tower-critical-table"><thead><tr><th>Point</th><th>Fill base</th><th>Residual base</th><th>Rockhead</th><th>Competent rock</th><th>Termination</th></tr></thead><tbody>${model.critical.map((row) => `<tr><th>${esc(row.boreholeId)}</th><td>${display(row, "fillBase")}</td><td>${display(row, "residualBase")}</td><td>${display(row, "rockhead")}</td><td>${row.competentRule.configured ? display(row, "competentRock") : `<span class="tower-not-configured">Rule not configured</span>`}</td><td>${display(row, "termination")}<small>${row.terminationMeasured ? "Measured final depth" : "Calculated deepest record"}</small></td></tr>`).join("")}</tbody></table></div></div>
    </section>`;
  }

  function chartVertical(model, depths) {
    const scale = profileScale(model); const top = 28; const height = 270;
    return { scale, top, height, y: (depth, borehole) => {
      const value = scale.value(depth, borehole); if (value == null) return null;
      const span = Math.max(0.1, scale.max - scale.min);
      return scale.mode === "depth" ? top + (value - scale.min) / span * height : top + (scale.max - value) / span * height;
    } };
  }

  function sptProfile(model) {
    const ids = model.ids.filter((id) => (model.spt[id] || []).length).slice(0, 5);
    if (!ids.length) return emptyEvidence("SPT depth profile", "No SPT results match the active trust and depth filters.", "spt");
    const W = 760; const H = 340; const left = 62; const right = 26; const chart = chartVertical(model);
    const maxN = Math.max(50, ...ids.flatMap((id) => model.spt[id].map((point) => point.n || 0))); const x = (value) => left + Math.min(maxN, value) / maxN * (W - left - right);
    let grid = "";
    for (let n = 0; n <= maxN; n += maxN / 5) grid += `<line x1="${x(n)}" y1="${chart.top}" x2="${x(n)}" y2="${chart.top + chart.height}" class="tower-grid-line"/><text x="${x(n)}" y="${H - 16}" text-anchor="middle" class="tower-axis-text">${Math.round(n)}</text>`;
    let seriesMarkup = "";
    ids.forEach((id, seriesIndex) => {
      const style = SERIES[seriesIndex]; const borehole = model.boreholes.find((item) => item.id === id) || {};
      const points = model.spt[id].map((point) => ({ point, y: chart.y(point.depth, borehole) })).filter((item) => item.y != null);
      const valid = points.filter((item) => item.point.n != null && !item.point.result.refusal);
      if (valid.length > 1) seriesMarkup += `<polyline points="${valid.map((item) => `${x(item.point.n)},${item.y}`).join(" ")}" fill="none" stroke="${style.colour}" stroke-width="1.6" stroke-dasharray="${style.dash}" class="tower-spt-guide"><title>Visual guide between ${esc(id)} measured points; not an interpolation</title></polyline>`;
      points.forEach((item) => {
        const point = item.point; const px = point.result.refusal || point.n == null ? x(maxN) : x(point.n);
        seriesMarkup += `<g data-tower-detail="spt" data-bh="${attr(id)}" data-index="${point.index}" tabindex="0">${markerShape(px, item.y, style.marker, style.colour, 5)}${point.result.refusal ? `<text x="${px - 9}" y="${item.y - 7}" class="tower-refusal">R</text>` : point.result.hammerBounce ? `<text x="${px + 8}" y="${item.y - 7}" class="tower-refusal">HB</text>` : ""}<title>${esc(`${id}: ${formatDepth(point.depth)}, ${point.result.status}${point.n != null ? `, N=${point.n}` : ""}`)}</title></g>`;
      });
    });
    const legend = ids.map((id, index) => `<span><svg viewBox="0 0 28 12"><line x1="1" y1="6" x2="27" y2="6" stroke="${SERIES[index].colour}" stroke-width="1.5" stroke-dasharray="${SERIES[index].dash}"/>${markerShape(14, 6, SERIES[index].marker, SERIES[index].colour, 3)}</svg>${esc(id)}</span>`).join("");
    return evidencePanel("SPT depth profile", "Measured penetration resistance", `<div class="tower-chart-scroll"><svg class="tower-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="SPT N values by ${esc(chart.scale.label)}"><text x="14" y="16" class="tower-axis-label">${esc(chart.scale.label)}</text>${axisTicks(chart.scale, chart.top, chart.height, left)}${grid}${seriesMarkup}<text x="${(left + W - right) / 2}" y="${H - 2}" text-anchor="middle" class="tower-axis-label">SPT N value</text></svg></div><div class="tower-series-legend">${legend}<span>R = refusal</span><span>HB = hammer bounce</span></div>`, "spt");
  }

  function rockQualityProfile(model) {
    const runs = model.ids.flatMap((id) => (model.quality[id] || []).filter((run) => [run.tcr, run.scr, run.rqd].some((value) => value != null)));
    if (!runs.length) return emptyEvidence("Rock core quality", "No TCR, SCR or RQD core-run results match the active filters.", "rock");
    const rows = runs.slice(0, 30).map((run) => {
      const metric = (label, value, cls) => `<div class="tower-quality-metric"><span>${label}</span><i><b class="${cls}" style="width:${Math.max(0, Math.min(100, value == null ? 0 : value))}%"></b></i><strong>${value == null ? "-" : `${formatNumber(value, 0)}%`}</strong></div>`;
      return `<button type="button" class="tower-quality-run ${ui.selectedId === run.boreholeId ? "selected" : ""}" data-tower-detail="core" data-bh="${attr(run.boreholeId)}" data-index="${run.index}"><span class="tower-run-id"><strong>${esc(run.boreholeId)}</strong><small>${formatDepth(run.from)}-${formatDepth(run.to)}</small></span><span class="tower-quality-bars">${metric("TCR", run.tcr, "tcr")}${metric("SCR", run.scr, "scr")}${metric("RQD", run.rqd, "rqd")}</span></button>`;
    }).join("");
    return evidencePanel("Rock core quality", "Exact core-run recovery and quality", `<div class="tower-quality-list">${rows}</div><div class="tower-chart-note">Each band is one recorded core run. Gaps remain gaps; runs are not connected.</div>`, "rock");
  }

  function groundwaterReview(model) {
    const rows = model.ids.map((id) => ({ id, value: model.groundwater[id] }));
    const hasAny = rows.some((row) => row.value.observations.length);
    const body = `<div class="tower-table-scroll"><table class="tower-table"><thead><tr><th>Point</th><th>Observation state</th><th>Observed depth</th><th>Stabilised depth</th><th>Observation count</th><th>Review</th></tr></thead><tbody>${rows.map((row) => {
      const value = row.value; const warning = value.category === "no-data" || value.category === "state-only";
      return `<tr class="${ui.selectedId === row.id ? "selected" : ""}"><th><button type="button" class="tower-row-link" data-tower-select="${attr(row.id)}">${esc(row.id)}</button></th><td><span class="tower-gw-state ${value.category}">${esc(value.state)}</span></td><td>${formatDepth(value.depth)}</td><td>${formatDepth(value.stableDepth)}</td><td>${value.observations.length}</td><td>${warning ? `<span class="tower-warning-text">${value.category === "no-data" ? "Observation missing" : "Depth not recorded"}</span>` : "Recorded"}</td></tr>`;
    }).join("")}</tbody></table></div>${!hasAny ? `<div class="tower-inline-warning">No groundwater observations are recorded. No groundwater surface has been inferred.</div>` : `<div class="tower-chart-note">Point observations are shown independently. The dashboard does not infer a continuous groundwater surface.</div>`}`;
    return evidencePanel("Groundwater review", "Recorded states and point observations", body, "groundwater");
  }

  function testCoverage(model) {
    const types = ui.testType === "ALL" ? ["SPT", "SAMPLE", "CORE", "GW"] : [ui.testType];
    const events = [];
    model.ids.forEach((id) => {
      const borehole = model.boreholes.find((item) => item.id === id) || {};
      if (types.includes("SPT")) (model.spt[id] || []).forEach((point) => events.push({ id, type: "SPT", depth: point.depth, label: point.result.status }));
      if (types.includes("SAMPLE")) Core.normaliseLog(model.state.logs && model.state.logs[id]).samples.filter((row) => recordVisible(row, borehole, ui.includeDraft)).forEach((row) => { const depth = num(row.from); if (depth != null) events.push({ id, type: "SAMPLE", depth, label: row.sid || row.sampleId || "Sample" }); });
      if (types.includes("CORE")) (model.quality[id] || []).forEach((run) => events.push({ id, type: "CORE", depth: run.from, label: `${formatDepth(run.from)}-${formatDepth(run.to)}` }));
      if (types.includes("GW") && model.groundwater[id].depth != null) events.push({ id, type: "GW", depth: model.groundwater[id].depth, label: model.groundwater[id].state });
    });
    if (!events.length) return emptyEvidence("Test and sample coverage", "No matching evidence records are available.", "samples");
    const maxDepth = num(ui.depthTo) ?? model.maxDepth; const minDepth = num(ui.depthFrom) ?? 0; const span = Math.max(0.1, maxDepth - minDepth);
    const rows = model.ids.map((id) => `<div class="tower-evidence-row"><button type="button" data-tower-select="${attr(id)}">${esc(id)}</button><div class="tower-evidence-track">${events.filter((event) => event.id === id).map((event) => `<button type="button" class="tower-evidence-point ${event.type.toLowerCase()}" style="left:${Math.max(0, Math.min(100, (event.depth - minDepth) / span * 100))}%" title="${attr(`${event.type} ${formatDepth(event.depth)}: ${event.label}`)}" data-tower-select="${attr(id)}"><i></i></button>`).join("")}</div><span>${formatDepth(maxDepth)}</span></div>`).join("");
    return evidencePanel("Test and sample coverage", "Measured evidence by depth", `<div class="tower-evidence-timeline">${rows}</div><div class="tower-profile-legend"><span><i class="evidence spt"></i>SPT</span><span><i class="evidence sample"></i>Sample</span><span><i class="evidence core"></i>Core run</span><span><i class="evidence gw"></i>Groundwater</span></div>`, "samples");
  }

  function strengthProfile(model) {
    const values = model.ids.flatMap((id) => (model.quality[id] || []).filter((run) => run.is50 != null));
    if (!values.length) return "";
    const max = Math.max(1, ...values.map((run) => run.is50));
    const rows = values.map((run) => `<button type="button" class="tower-strength-row" data-tower-detail="core" data-bh="${attr(run.boreholeId)}" data-index="${run.index}"><span><strong>${esc(run.boreholeId)}</strong><small>${formatDepth(run.from)}</small></span><i><b style="width:${run.is50 / max * 100}%"></b></i><strong>${formatNumber(run.is50, 2)} MPa</strong></button>`).join("");
    return evidencePanel("Point-load strength index", "Measured Is(50) results", `<div class="tower-strength-list">${rows}</div><div class="tower-chart-note">Point-load index values are shown as entered. No UCS conversion or design strength is inferred.</div>`, "rock");
  }

  function defectProfile(model) {
    const values = model.ids.flatMap((id) => model.defects[id] || []);
    if (!values.length) return "";
    return evidencePanel("Significant discontinuities", "Reviewed significant defects", `<div class="tower-defect-list">${values.map((item) => `<button type="button" data-tower-go="corebox" data-bh="${attr(item.boreholeId)}"><strong>${esc(item.boreholeId)}</strong><span>${esc(item.code)}</span><span>${formatDepth(item.from)}${item.to != null && item.to > item.from ? `-${formatDepth(item.to)}` : ""}</span><small>${esc(item.row.comments || item.row.remarks || item.row.orientation || "Reviewed corebox annotation")}</small></button>`).join("")}</div>`, "corebox");
  }

  function evidencePanel(title, meta, body, nav) {
    return `<section class="tower-evidence-panel"><div class="tower-evidence-head"><div><h3>${esc(title)}</h3><p>${esc(meta)}</p></div><button type="button" class="tower-icon-button" data-tower-go="${attr(nav)}" title="Open ${attr(title)}" aria-label="Open ${attr(title)}">${icon("arrow-up-right")}</button></div>${body}</section>`;
  }

  function emptyEvidence(title, message, nav) {
    return evidencePanel(title, "No qualifying records", `<div class="tower-empty"><strong>No data to plot</strong><span>${esc(message)}</span><button type="button" class="tower-button" data-tower-go="${attr(nav)}">Open source records</button></div>`, nav);
  }

  function reviewTable(model) {
    const summary = Core.validationSummary(model.issues);
    return `<section class="tower-section tower-review" id="towerReview" aria-labelledby="towerReviewTitle"><div class="tower-section-head"><div><span class="tower-order">08 / Review actions</span><h2 id="towerReviewTitle">Engineering review table</h2></div><div class="tower-issue-summary"><span class="error">${summary.error} errors</span><span class="warning">${summary.warning} warnings</span><span>${summary.suggestion} checks</span></div></div>
      <div class="tower-table-scroll"><table class="tower-table"><thead><tr><th>Priority</th><th>Point</th><th>Depth</th><th>Area</th><th>Issue</th><th>Next action</th></tr></thead><tbody>${model.issues.length ? model.issues.slice(0, 60).map((issue) => `<tr><td><span class="tower-severity ${attr(issue.severity)}">${esc(issue.severity)}</span></td><td>${esc(issue.boreholeId || "Project")}</td><td>${formatDepth(issue.depth)}</td><td>${esc(issue.area)}</td><td>${esc(issue.message)}</td><td><button type="button" class="tower-row-action" data-tower-go="${attr(issue.nav || "validation")}" data-bh="${attr(issue.boreholeId || "")}">Open record ${icon("arrow-right")}</button></td></tr>`).join("") : `<tr><td colspan="6" class="tower-empty-cell"><strong>No review issues in this filtered view.</strong> Recheck draft visibility before treating the review as complete.</td></tr>`}</tbody></table></div>
    </section>`;
  }

  function detailDrawer(model) {
    const detail = ui.detail;
    if (!detail) return "";
    const log = Core.normaliseLog(model.state.logs && model.state.logs[detail.bhId]);
    let row = null; let title = "Record detail"; let nav = "bh-overview";
    if (detail.type === "interval") { row = detail.source === "soil" ? log.soil[detail.index] : log.rock[detail.index]; title = `${detail.bhId} ${detail.source === "soil" ? "soil interval" : "rock interval"}`; nav = detail.source; }
    if (detail.type === "spt") { row = log.spt[detail.index]; title = `${detail.bhId} SPT result`; nav = "spt"; }
    if (detail.type === "core") { row = log.rock[detail.index]; title = `${detail.bhId} core run`; nav = "rock"; }
    if (!row) return "";
    const fields = Object.entries(row).filter(([, value]) => value !== "" && value != null && typeof value !== "object" && !/^_/.test(String(value))).slice(0, 24);
    return `<div class="tower-drawer-backdrop" data-tower-close></div><aside class="tower-drawer" role="dialog" aria-modal="true" aria-labelledby="towerDrawerTitle"><header><div><span>${esc(detail.bhId)} &middot; ${esc(recordStatus(row, model.boreholes.find((item) => item.id === detail.bhId)))}</span><h2 id="towerDrawerTitle">${esc(title)}</h2></div><button type="button" class="tower-icon-button" data-tower-close title="Close" aria-label="Close detail">${icon("x")}</button></header><div class="tower-drawer-body"><dl>${fields.map(([key, value]) => `<div><dt>${esc(key.replace(/([A-Z])/g, " $1"))}</dt><dd>${esc(typeof value === "boolean" ? value ? "Yes" : "No" : value)}</dd></div>`).join("")}</dl></div><footer><button type="button" class="tower-button" data-tower-close>Close</button><button type="button" class="tower-button primary" data-tower-go="${nav}" data-bh="${attr(detail.bhId)}">Open source record ${icon("arrow-right")}</button></footer></aside>`;
  }

  function phoneSummary(model) {
    const summary = coverageSummary(model.coverage); const critical = model.critical;
    const shallowRock = critical.filter((row) => row.rockhead != null).sort((a, b) => a.rockhead - b.rockhead)[0];
    const deepestFill = critical.filter((row) => row.fillBase != null).sort((a, b) => b.fillBase - a.fillBase)[0];
    return `<section class="tower-phone-summary"><h2>Field review summary</h2><dl><div><dt>Completed points</dt><dd>${summary.pointDone} / ${summary.pointTotal}</dd></div><div><dt>Shallowest rockhead</dt><dd>${shallowRock ? `${esc(shallowRock.boreholeId)} &middot; ${formatDepth(shallowRock.rockhead)}` : "-"}</dd></div><div><dt>Deepest fill</dt><dd>${deepestFill ? `${esc(deepestFill.boreholeId)} &middot; ${formatDepth(deepestFill.fillBase)}` : "-"}</dd></div><div><dt>Open review items</dt><dd>${model.issues.length}</dd></div></dl><p>Open the full analytical profile on a tablet or desktop.</p></section>`;
  }

  function lazySlot(name, title) { return `<div class="tower-lazy" data-tower-lazy="${name}" aria-label="${attr(title)}"><span class="tower-loading-line"></span><span class="tower-loading-line short"></span></div>`; }

  function renderMarkup(model) {
    return `<main class="tower-workspace" data-tower-route="tower">
      ${contextHeader(model)}${filterBar(model)}${trustBanner(model)}${phoneSummary(model)}
      ${coverageMatrix(model)}${planView(model)}${crossSectionProfile(model)}${criticalDepths(model)}
      <div class="tower-analytics" aria-label="Field and laboratory evidence">
        ${lazySlot("spt", "SPT depth profile")}${lazySlot("quality", "Rock core quality")}${lazySlot("groundwater", "Groundwater review")}${lazySlot("coverage", "Test and sample coverage")}
      </div>
      <div class="tower-conditional" data-tower-conditional></div>
      ${reviewTable(model)}${detailDrawer(model)}
    </main>`;
  }

  function renderLazy(name, model) {
    if (name === "spt") return sptProfile(model);
    if (name === "quality") return rockQualityProfile(model);
    if (name === "groundwater") return groundwaterReview(model);
    if (name === "coverage") return testCoverage(model);
    return "";
  }

  function hydrateLazy(page, model) {
    if (lazyObserver) lazyObserver.disconnect();
    const slots = [...page.querySelectorAll("[data-tower-lazy]")];
    const hydrate = (slot) => { if (!slot || slot.dataset.hydrated) return; slot.dataset.hydrated = "true"; slot.innerHTML = renderLazy(slot.dataset.towerLazy, model); };
    if (typeof IntersectionObserver !== "function") slots.forEach(hydrate);
    else {
      lazyObserver = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { hydrate(entry.target); lazyObserver.unobserve(entry.target); } }), { rootMargin: "280px 0px" });
      slots.forEach((slot) => lazyObserver.observe(slot));
    }
    const conditional = page.querySelector("[data-tower-conditional]");
    if (conditional) {
      const strength = strengthProfile(model); const defects = defectProfile(model);
      conditional.innerHTML = strength || defects ? `${strength}${defects}` : "";
      conditional.hidden = !(strength || defects);
    }
  }

  function currentState() {
    try { return typeof S !== "undefined" ? S : { project: {}, boreholes: [], logs: {} }; }
    catch (error) { return { project: {}, boreholes: [], logs: {} }; }
  }

  function paintIcons() {
    const premium = root && root.GeoFlowPremium;
    if (premium && premium.paintIcons) premium.paintIcons();
    else if (root && root.lucide) root.lucide.createIcons();
  }

  function selectedModel() { return aggregateTower(currentState(), ui, cloudFiles); }

  function renderDashboard() {
    const page = document.getElementById("page-dashboard");
    if (!page) return;
    const model = selectedModel();
    page.innerHTML = renderMarkup(model);
    page.classList.add("tower-page");
    bindEvents(page);
    hydrateLazy(page, model);
    paintIcons();
    setTimeout(removeLegacyTowerStrip, 90);
    if (!cloudFilesLoaded && !cloudFilesLoading) loadCloudFiles();
  }

  function applyFilters(form) {
    const data = new FormData(form);
    ui.towerId = text(data.get("towerId")) || "ALL";
    ui.boreholeId = text(data.get("boreholeId")) || "ALL";
    ui.depthMode = data.get("depthMode") === "rl" ? "rl" : "depth";
    ui.depthFrom = text(data.get("depthFrom")); ui.depthTo = text(data.get("depthTo"));
    ui.material = text(data.get("material")) || "ALL"; ui.testType = text(data.get("testType")) || "ALL";
    ui.includeDraft = data.has("includeDraft");
    renderDashboard();
  }

  function navigate(tab, boreholeId) {
    const source = currentState();
    if (boreholeId && (source.boreholes || []).some((item) => item.id === boreholeId)) source.activeBh = boreholeId;
    try { if (typeof showTab === "function") showTab(tab); else if (root && root.showTab) root.showTab(tab); } catch (error) { if (root && root.showTab) root.showTab(tab); }
  }

  function bindEvents(page) {
    const form = page.querySelector("#towerFilters");
    if (form) form.addEventListener("change", () => applyFilters(form));
    page.addEventListener("click", (event) => {
      const draft = event.target.closest("[data-tower-include-draft]");
      if (draft) { ui.includeDraft = true; renderDashboard(); return; }
      const close = event.target.closest("[data-tower-close]");
      if (close) { ui.detail = null; renderDashboard(); return; }
      const review = event.target.closest("[data-tower-review]");
      if (review) { page.querySelector("#towerReview")?.scrollIntoView({ behavior: root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); return; }
      const detail = event.target.closest("[data-tower-detail]");
      if (detail) { ui.detail = { type: detail.dataset.towerDetail, bhId: detail.dataset.bh, source: detail.dataset.source, index: Number(detail.dataset.index) }; ui.selectedId = detail.dataset.bh; renderDashboard(); return; }
      const cell = event.target.closest("[data-tower-cell]");
      if (cell) { ui.selectedId = cell.dataset.bh; navigate(cell.dataset.nav, cell.dataset.bh); return; }
      const go = event.target.closest("[data-tower-go]");
      if (go) { navigate(go.dataset.towerGo, go.dataset.bh); return; }
      const select = event.target.closest("[data-tower-select]");
      if (select) { ui.selectedId = select.dataset.towerSelect; renderDashboard(); }
    });
    page.addEventListener("keydown", (event) => {
      if (!/[Enter ]/.test(event.key)) return;
      const target = event.target.closest("[data-tower-select], [data-tower-detail]");
      if (target) { event.preventDefault(); target.click(); }
    });
  }

  function projectStorageKey() {
    try {
      if (root.GeoFlowPremium && root.GeoFlowPremium.projectStorageKey) return root.GeoFlowPremium.projectStorageKey();
      if (typeof pjSyncKey === "function") return pjSyncKey();
    } catch (error) { return "__autosoil_project__"; }
    return "__autosoil_project__";
  }

  function requestHeaders() {
    try { return typeof syncHeaders === "function" ? syncHeaders() : {}; }
    catch (error) { return {}; }
  }

  async function loadCloudFiles() {
    cloudFilesLoading = true;
    try {
      const response = await fetch(`/api/v1/files?project=${encodeURIComponent(projectStorageKey())}`, { headers: requestHeaders() });
      if (!response.ok) throw new Error("File metadata unavailable");
      const payload = await response.json();
      cloudFiles = Array.isArray(payload.files) ? payload.files : [];
    } catch (error) { cloudFiles = []; }
    finally {
      cloudFilesLoading = false; cloudFilesLoaded = true;
      const page = document.getElementById("page-dashboard");
      if (page && page.classList.contains("show")) renderDashboard();
    }
  }

  function removeLegacyTowerStrip() {
    const page = document.getElementById("page-dashboard");
    if (!page || !page.querySelector(".tower-workspace")) return;
    page.querySelectorAll(":scope > .tower-strip").forEach((node) => node.remove());
  }

  function install() {
    root.renderDashboard = renderDashboard;
    if (!legacyObserver && document.body) {
      legacyObserver = new MutationObserver(removeLegacyTowerStrip);
      legacyObserver.observe(document.getElementById("page-dashboard") || document.body, { childList: true });
    }
    const source = currentState();
    if (source.activeTab === "dashboard" || location.hash.endsWith("/tower")) setTimeout(renderDashboard, 0);
  }

  return Object.freeze({
    recordStatus, depthToRl, classifySoil, normaliseWeathering, geologyIntervals, competentRockRule,
    intervalMeetsCompetentRule, extractCriticalDepths, groundwaterState, coverageRows, sptPoints,
    coreRuns, significantDefects, aggregateTower, renderMarkup, install
  });
});

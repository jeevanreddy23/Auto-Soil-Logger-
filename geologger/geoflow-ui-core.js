(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GeoFlowUICore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SEVERITY_ORDER = { error: 0, warning: 1, suggestion: 2 };
  const PROJECT_REQUIRED = [
    ["projectNumber", "Project number", "error"],
    ["clientName", "Client", "error"],
    ["siteAddress", "Site address", "warning"],
    ["loggedBy", "Logged by", "warning"]
  ];

  function num(value) {
    if (value === "" || value === null || value === undefined || typeof value === "boolean") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatDepth(value) {
    const parsed = num(value);
    return parsed == null ? "-" : `${parsed.toFixed(2)} m`;
  }

  function entered(row, keys) {
    if (!row || typeof row !== "object") return false;
    return keys.some((key) => {
      const value = row[key];
      if (typeof value === "boolean") return value;
      return text(value) !== "";
    });
  }

  function normaliseLog(log) {
    const source = log && typeof log === "object" ? log : {};
    return {
      soil: Array.isArray(source.soil) ? source.soil : [],
      rock: Array.isArray(source.rock) ? source.rock : [],
      spt: Array.isArray(source.spt) ? source.spt : [],
      dcp: Array.isArray(source.dcp) ? source.dcp : [],
      samples: Array.isArray(source.samples) ? source.samples : [],
      photos: Array.isArray(source.photos) ? source.photos : [],
      groundwater: Array.isArray(source.groundwater) ? source.groundwater : [],
      gw: source.gw && typeof source.gw === "object" ? source.gw : {},
      corebox: source.corebox && typeof source.corebox === "object" ? source.corebox : {}
    };
  }

  function rowDepth(row) {
    return Math.max(num(row && row.to) || 0, num(row && row.from) || 0, num(row && row.depth) || 0);
  }

  function loggedBoreholeDepth(state, boreholeId) {
    const borehole = (state && state.boreholes || []).find((item) => item.id === boreholeId) || {};
    const log = normaliseLog(state && state.logs && state.logs[boreholeId]);
    const values = [
      num(borehole.termDepth) || 0,
      num(borehole.finalDepth) || 0,
      ...log.soil.map(rowDepth),
      ...log.rock.map(rowDepth),
      ...log.spt.map(rowDepth),
      ...log.samples.map(rowDepth),
      ...dcpProfile(log.dcp).map((point) => point.to)
    ];
    return Math.max(0, ...values);
  }

  function maxBoreholeDepth(state, boreholeId) {
    const borehole = (state && state.boreholes || []).find((item) => item.id === boreholeId) || {};
    return Math.max(loggedBoreholeDepth(state, boreholeId), num(borehole.plannedDepth) || num(borehole.planned) || 0);
  }

  function boreholeStatus(state, boreholeId) {
    const borehole = (state && state.boreholes || []).find((item) => item.id === boreholeId) || {};
    const log = normaliseLog(state && state.logs && state.logs[boreholeId]);
    if (num(borehole.termDepth) != null || num(borehole.finalDepth) != null) return "Complete";
    if (log.rock.some((row) => entered(row, ["rockType", "weathering", "strength", "description"]))) return "Rock logging";
    if (log.soil.some((row) => entered(row, ["material", "description"]))) return "Soil logging";
    if (log.spt.some((row) => entered(row, ["depth", "b1", "b2", "b3", "refusal"]))) return "Field testing";
    if (dcpProfile(log.dcp).some((point) => point.hasData)) return "Field testing";
    return "Not started";
  }

  function deriveSpt(row) {
    const source = row || {};
    const first = num(source.b1 != null ? source.b1 : source.first150);
    const second = num(source.b2 != null ? source.b2 : source.second150);
    const third = num(source.b3 != null ? source.b3 : source.third150);
    const hasData = entered(source, ["depth", "to", "seat", "seating", "b1", "b2", "b3", "first150", "second150", "third150", "refusal", "hammerBounce", "hb", "remarks"]);
    const calculatedN = second != null && third != null ? second + third : null;
    const refusal = Boolean(source.refusal);
    const hammerBounce = Boolean(source.hammerBounce || source.hb);
    let status = "Not started";
    if (hasData) status = refusal ? "Refusal" : hammerBounce ? "Hammer bounce" : calculatedN != null ? "Complete" : "Incomplete";
    return { first, second, third, calculatedN, refusal, hammerBounce, hasData, status };
  }

  function dcpProfile(rows) {
    let depth = 0;
    return (Array.isArray(rows) ? rows : []).map((row, index) => {
      let incrementMm = num(row.incrementMm != null ? row.incrementMm : row.increment);
      const explicitFrom = num(row.from);
      const explicitTo = num(row.to != null ? row.to : row.depth);
      const from = explicitFrom != null ? explicitFrom : depth;
      let to = explicitTo;
      if (to == null && incrementMm != null) to = from + incrementMm / 1000;
      if (to == null) to = from;
      if (incrementMm == null && to > from) incrementMm = (to - from) * 1000;
      depth = Math.max(depth, to);
      return {
        index,
        from,
        to,
        incrementMm,
        blows: num(row.blows != null ? row.blows : row.blowCount),
        refusal: Boolean(row.refusal),
        remarks: text(row.remarks),
        hasData: entered(row, ["from", "to", "depth", "incrementMm", "increment", "blows", "blowCount", "refusal", "remarks"])
      };
    });
  }

  function makeIssue(input) {
    return Object.assign({
      severity: "warning",
      area: "Project",
      nav: "dashboard",
      boreholeId: "",
      rowIndex: null,
      depth: null,
      code: "review"
    }, input);
  }

  function intervalIssues(rows, options) {
    const config = Object.assign({ area: "Soil", nav: "soil", boreholeId: "", keys: [], allowPointRows: false }, options || {});
    const candidates = (Array.isArray(rows) ? rows : []).map((row, rowIndex) => ({ row, rowIndex }))
      .filter(({ row }) => {
        if (!entered(row, ["from", "to", ...config.keys])) return false;
        if (!config.allowPointRows) return true;
        const from = num(row.from);
        const to = num(row.to);
        return !(from != null && to != null && from === to && !entered(row, config.keys));
      });
    const issues = [];
    const complete = [];

    candidates.forEach(({ row, rowIndex }) => {
      const from = num(row.from);
      const to = num(row.to);
      if (from == null || to == null) {
        issues.push(makeIssue({
          id: `${config.nav}-${config.boreholeId}-${rowIndex}-depth-missing`,
          severity: "error",
          area: config.area,
          nav: config.nav,
          boreholeId: config.boreholeId,
          rowIndex,
          depth: from,
          code: "interval-boundary",
          message: `${config.boreholeId} ${config.area.toLowerCase()} row ${rowIndex + 1} needs both From and To depths.`
        }));
        return;
      }
      if (to <= from) {
        issues.push(makeIssue({
          id: `${config.nav}-${config.boreholeId}-${rowIndex}-depth-order`,
          severity: "error",
          area: config.area,
          nav: config.nav,
          boreholeId: config.boreholeId,
          rowIndex,
          depth: from,
          code: "interval-order",
          message: `${config.boreholeId} ${formatDepth(from)}-${formatDepth(to)} has a To depth that is not below From.`
        }));
        return;
      }
      complete.push({ from, to, rowIndex });
    });

    complete.sort((a, b) => a.from - b.from || a.to - b.to);
    for (let index = 1; index < complete.length; index += 1) {
      const previous = complete[index - 1];
      const current = complete[index];
      if (current.from < previous.to - 1e-9) {
        issues.push(makeIssue({
          id: `${config.nav}-${config.boreholeId}-${current.rowIndex}-overlap`,
          severity: "error",
          area: config.area,
          nav: config.nav,
          boreholeId: config.boreholeId,
          rowIndex: current.rowIndex,
          depth: current.from,
          code: "interval-overlap",
          message: `${config.boreholeId} ${config.area.toLowerCase()} intervals overlap at ${formatDepth(current.from)}.`
        }));
      } else if (current.from > previous.to + 1e-9) {
        issues.push(makeIssue({
          id: `${config.nav}-${config.boreholeId}-${current.rowIndex}-gap`,
          severity: "error",
          area: config.area,
          nav: config.nav,
          boreholeId: config.boreholeId,
          rowIndex: current.rowIndex,
          depth: previous.to,
          code: "interval-gap",
          message: `${config.boreholeId} is missing a ${config.area.toLowerCase()} interval from ${formatDepth(previous.to)} to ${formatDepth(current.from)}.`
        }));
      }
    }
    return issues;
  }

  function collectValidation(state) {
    const source = state && typeof state === "object" ? state : {};
    const project = source.project && typeof source.project === "object" ? source.project : {};
    const boreholes = Array.isArray(source.boreholes) ? source.boreholes : [];
    const issues = [];

    PROJECT_REQUIRED.forEach(([key, label, severity]) => {
      if (text(project[key])) return;
      issues.push(makeIssue({
        id: `project-${key}`,
        severity,
        area: "Project",
        nav: "project",
        code: "project-metadata",
        message: `${label} is blank.`
      }));
    });

    const seenIds = new Set();
    boreholes.forEach((borehole, boreholeIndex) => {
      const id = text(borehole && borehole.id);
      if (!id) {
        issues.push(makeIssue({
          id: `borehole-${boreholeIndex}-id`, severity: "error", area: "Borehole", nav: "boreholes",
          rowIndex: boreholeIndex, code: "borehole-id", message: `Borehole row ${boreholeIndex + 1} has no ID.`
        }));
        return;
      }
      if (seenIds.has(id)) {
        issues.push(makeIssue({
          id: `borehole-${id}-duplicate`, severity: "error", area: "Borehole", nav: "boreholes",
          boreholeId: id, rowIndex: boreholeIndex, code: "duplicate-borehole", message: `Duplicate borehole ID ${id}.`
        }));
      }
      seenIds.add(id);

      const log = normaliseLog(source.logs && source.logs[id]);
      issues.push(...intervalIssues(log.soil, { area: "Soil", nav: "soil", boreholeId: id, keys: ["material", "description"] }));
      issues.push(...intervalIssues(log.rock, { area: "Rock", nav: "rock", boreholeId: id, keys: ["rockType", "description", "weathering", "strength", "tcr", "rqd"], allowPointRows: true }));

      if (!log.soil.some((row) => entered(row, ["material", "description"])) && !log.rock.some((row) => entered(row, ["rockType", "description"]))) {
        issues.push(makeIssue({
          id: `borehole-${id}-empty`, severity: "suggestion", area: "Borehole", nav: "bh-overview",
          boreholeId: id, code: "empty-log", message: `${id} has no geological intervals yet.`
        }));
      }

      log.spt.forEach((row, rowIndex) => {
        const result = deriveSpt(row);
        if (!result.hasData) return;
        if (result.status === "Incomplete") {
          issues.push(makeIssue({
            id: `spt-${id}-${rowIndex}-incomplete`, severity: "warning", area: "SPT", nav: "spt",
            boreholeId: id, rowIndex, depth: num(row.depth), code: "spt-incomplete",
            message: `${id} SPT at ${formatDepth(row.depth)} is incomplete.`
          }));
        }
        const enteredN = num(row.n);
        if (!result.refusal && enteredN != null && result.calculatedN != null && enteredN !== result.calculatedN) {
          issues.push(makeIssue({
            id: `spt-${id}-${rowIndex}-n`, severity: "error", area: "SPT", nav: "spt",
            boreholeId: id, rowIndex, depth: num(row.depth), code: "spt-n",
            message: `${id} SPT at ${formatDepth(row.depth)} records N=${enteredN}; increments calculate N=${result.calculatedN}.`
          }));
        }
      });

      const sampleIds = new Map();
      log.samples.forEach((sample, rowIndex) => {
        const sampleId = text(sample.sid || sample.sampleId);
        if (!sampleId) return;
        if (sampleIds.has(sampleId)) {
          issues.push(makeIssue({
            id: `sample-${id}-${rowIndex}-duplicate`, severity: "error", area: "Samples", nav: "samples",
            boreholeId: id, rowIndex, depth: num(sample.from), code: "duplicate-sample",
            message: `${id} contains duplicate sample ID ${sampleId}.`
          }));
        }
        sampleIds.set(sampleId, rowIndex);
      });

      dcpProfile(log.dcp).forEach((point) => {
        if (!point.hasData) return;
        if (point.incrementMm == null || point.incrementMm <= 0) {
          issues.push(makeIssue({
            id: `dcp-${id}-${point.index}-increment`, severity: "error", area: "DCP", nav: "dcp",
            boreholeId: id, rowIndex: point.index, depth: point.from, code: "dcp-increment",
            message: `${id} DCP row ${point.index + 1} needs a positive depth increment.`
          }));
        }
        if (!point.refusal && (point.blows == null || point.blows < 0)) {
          issues.push(makeIssue({
            id: `dcp-${id}-${point.index}-blows`, severity: "warning", area: "DCP", nav: "dcp",
            boreholeId: id, rowIndex: point.index, depth: point.from, code: "dcp-blows",
            message: `${id} DCP row ${point.index + 1} needs a blow count or refusal state.`
          }));
        }
      });

      const finalDepth = num(borehole.termDepth != null ? borehole.termDepth : borehole.finalDepth);
      if (finalDepth != null) {
        const deepest = maxBoreholeDepth(Object.assign({}, source, {
          boreholes: [Object.assign({}, borehole, { plannedDepth: "", planned: "" })]
        }), id);
        if (deepest > finalDepth + 1e-9) {
          issues.push(makeIssue({
            id: `borehole-${id}-termination`, severity: "error", area: "Borehole", nav: "boreholes",
            boreholeId: id, depth: finalDepth, code: "termination-depth",
            message: `${id} contains records below its final depth of ${formatDepth(finalDepth)}.`
          }));
        }
      }

      const hasGroundwater = text(log.gw.state) || text(log.gw.depth) || log.groundwater.length;
      if (!hasGroundwater) {
        issues.push(makeIssue({
          id: `groundwater-${id}-blank`, severity: "suggestion", area: "Groundwater", nav: "groundwater",
          boreholeId: id, code: "groundwater-blank", message: `${id} has no groundwater observation state.`
        }));
      }
    });

    return issues.sort((a, b) => {
      const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (severity) return severity;
      return `${a.area}-${a.boreholeId}-${a.depth == null ? "" : a.depth}`.localeCompare(`${b.area}-${b.boreholeId}-${b.depth == null ? "" : b.depth}`);
    });
  }

  function validationSummary(issues) {
    const summary = { error: 0, warning: 0, suggestion: 0, total: 0 };
    (Array.isArray(issues) ? issues : []).forEach((issue) => {
      if (Object.prototype.hasOwnProperty.call(summary, issue.severity)) summary[issue.severity] += 1;
      summary.total += 1;
    });
    return summary;
  }

  function reportRows(state, files) {
    const source = state && typeof state === "object" ? state : {};
    const fileList = Array.isArray(files) ? files : [];
    const issues = collectValidation(source);
    const approvals = source.reportApprovals && typeof source.reportApprovals === "object" ? source.reportApprovals : {};
    const metadata = source.reportMeta && typeof source.reportMeta === "object" ? source.reportMeta : {};
    return (Array.isArray(source.boreholes) ? source.boreholes : []).map((borehole) => {
      const id = text(borehole.id);
      const file = fileList.find((item) => item.id === `report-${id}` || item.name === `log-${id}.pdf`);
      const blockers = issues.filter((issue) => issue.severity === "error" && (!issue.boreholeId || issue.boreholeId === id));
      const approval = approvals[id] || null;
      const meta = metadata[id] || {};
      return {
        id: `report-${id}`,
        boreholeId: id,
        name: `Borehole Log - ${id}`,
        category: "Borehole Logs",
        template: meta.template || "STS Standard Borehole Log",
        revision: meta.revision || "P01",
        status: file ? "Ready" : blockers.length ? "Draft" : "Draft",
        generatedBy: file && (file.generatedBy || meta.generatedBy) || "-",
        generatedDate: file && (file.ts || file.generatedDate) || null,
        file,
        approval,
        blockers
      };
    });
  }

  function syncStateFromLabel(label, online) {
    const value = text(label).toLowerCase();
    if (online === false || value.includes("offline")) return { id: "offline", label: "Offline", detail: "Changes remain on this device." };
    if (value.includes("conflict")) return { id: "conflict", label: "Conflict", detail: "Review competing field and office changes." };
    if (value.includes("fail") || value.includes("error") || value.includes("local only") || value.includes("sync off")) return { id: "failed", label: "Sync failed", detail: "Saved locally; server sync needs attention." };
    if (value.includes("syncing") || value.includes("saving")) return { id: "syncing", label: "Syncing", detail: "Uploading the latest saved records." };
    if (value.includes("synced")) return { id: "synced", label: "Synced", detail: "Local and Cloudflare records match." };
    if (value.includes("saved") || value.includes("local")) return { id: "local", label: "Saved locally", detail: "Stored on this device; server confirmation is pending." };
    return { id: "unknown", label: "Sync status unknown", detail: "No confirmed save or sync signal is available." };
  }

  function projectMetrics(state) {
    const source = state && typeof state === "object" ? state : {};
    const boreholes = Array.isArray(source.boreholes) ? source.boreholes : [];
    let logged = 0;
    let spt = 0;
    let samples = 0;
    let depth = 0;
    let warnings = 0;
    boreholes.forEach((borehole) => {
      const log = normaliseLog(source.logs && source.logs[borehole.id]);
      if (log.soil.some((row) => entered(row, ["material", "description"])) || log.rock.some((row) => entered(row, ["rockType", "description"]))) logged += 1;
      spt += log.spt.filter((row) => deriveSpt(row).hasData).length;
      samples += log.samples.filter((sample) => text(sample.sid || sample.sampleId)).length;
      depth += loggedBoreholeDepth(source, borehole.id);
    });
    const issueSummary = validationSummary(collectValidation(source));
    warnings = issueSummary.error + issueSummary.warning;
    return { boreholes: boreholes.length, logged, spt, samples, depth, warnings, progress: boreholes.length ? Math.round(logged / boreholes.length * 100) : 0 };
  }

  function buildSearchItems(context) {
    const input = context && typeof context === "object" ? context : {};
    const state = input.state || {};
    const projects = Array.isArray(input.projects) ? input.projects : [];
    const commands = Array.isArray(input.commands) ? input.commands : [];
    const items = [];
    commands.forEach((command) => items.push(Object.assign({ type: "Command", keywords: "" }, command)));
    projects.forEach((project) => items.push({
      id: `project:${project.pid}`,
      type: "Project",
      label: `${text(project.number)} ${text(project.name)}`.trim(),
      detail: [project.client, project.address].map(text).filter(Boolean).join(" | "),
      keywords: [project.number, project.name, project.client, project.address, project.status].map(text).join(" "),
      projectId: project.pid
    }));
    (Array.isArray(state.boreholes) ? state.boreholes : []).forEach((borehole) => items.push({
      id: `borehole:${borehole.id}`,
      type: "Borehole",
      label: text(borehole.id),
      detail: `${boreholeStatus(state, borehole.id)} | ${formatDepth(maxBoreholeDepth(state, borehole.id))}`,
      keywords: [borehole.id, borehole.location, borehole.locationDescription, borehole.easting, borehole.northing].map(text).join(" "),
      boreholeId: borehole.id
    }));
    return items;
  }

  function searchItems(items, query, limit) {
    const words = text(query).toLowerCase().split(/\s+/).filter(Boolean);
    const max = Math.max(1, num(limit) || 12);
    return (Array.isArray(items) ? items : []).map((item, index) => {
      const label = text(item.label).toLowerCase();
      const haystack = `${label} ${text(item.detail).toLowerCase()} ${text(item.keywords).toLowerCase()} ${text(item.type).toLowerCase()}`;
      let score = words.length ? 0 : Math.max(1, 100 - index);
      words.forEach((word) => {
        if (label === word) score += 120;
        else if (label.startsWith(word)) score += 70;
        else if (label.includes(word)) score += 45;
        else if (haystack.includes(word)) score += 20;
        else score -= 200;
      });
      return { item, score, index };
    }).filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, max)
      .map((entry) => entry.item);
  }

  return Object.freeze({
    num,
    text,
    clamp,
    formatDepth,
    normaliseLog,
    loggedBoreholeDepth,
    maxBoreholeDepth,
    boreholeStatus,
    deriveSpt,
    dcpProfile,
    intervalIssues,
    collectValidation,
    validationSummary,
    reportRows,
    syncStateFromLabel,
    projectMetrics,
    buildSearchItems,
    searchItems
  });
});

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GeoFlowDomain = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SOIL_BASIS_KEYS = [
    "material", "secondary", "colour", "plasticity", "consistency",
    "moisture", "structure", "inclusions", "origin", "fillNatural"
  ];

  const SOIL_ROW_KEYS = [
    "from", "to", "material", "secondary", "colour", "moisture", "consistency",
    "plasticity", "structure", "origin", "inclusions", "fillNatural", "uscs",
    "description", "samples", "sptN", "dcp", "envNotes", "remarks"
  ];

  const ROCK_ROW_KEYS = [
    "from", "to", "rockType", "colour", "weathering", "strength", "defectType",
    "defectAngle", "defectSpacing", "defectRough", "defectInfill", "defectAperture",
    "defectPersist", "bedding", "tcr", "scr", "rqd", "is50", "rockClass",
    "description", "remarks", "_cbunit"
  ];

  const ROCK_GEOLOGY_KEYS = ["rockType", "description"];

  const CORE_RUN_KEYS = ["tcr", "scr", "rqd", "is50", "_cbunit"];

  function hasValue(value) {
    return value !== "" && value !== null && value !== undefined;
  }

  function isEntered(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.trim() !== "";
    return value !== null && value !== undefined;
  }

  function hasAnyEntered(row, keys) {
    return keys.some(key => isEntered(row && row[key]));
  }

  function numberOrNull(value) {
    if (!hasValue(value) || typeof value === "boolean" || (typeof value === "string" && !value.trim())) return null;
    const valueNumber = Number(value);
    return Number.isFinite(valueNumber) ? valueNumber : null;
  }

  function isGranular(material) {
    const value = String(material || "");
    if (/\b(CLAY|SILT)$/i.test(value)) return false;
    return /\b(SAND|GRAVEL)$/i.test(value);
  }

  function soilDescription(row) {
    const material = String(row.material || "").trim();
    if (!material) return "";
    const parts = [];
    if (row.plasticity) parts.push(String(row.plasticity).trim());
    if (!row.plasticity && isGranular(material) && row.consistency) {
      parts.push(String(row.consistency).trim());
    }
    if (row.colour) parts.push(String(row.colour).trim());
    let output = material;
    if (parts.length) output += `: ${parts.join(", ")}`;
    const segments = [row.secondary, row.inclusions]
      .filter(Boolean)
      .map(value => String(value).trim());
    const extras = segments.length === 2
      ? segments[0] + (/^(with|trace|and)\b/i.test(segments[1]) ? " " : " and ") + segments[1]
      : (segments[0] || "");
    if (extras) output += (parts.length ? ", " : ": ") + extras;
    if (row.fillNatural === "FILL" && !/^FILL/i.test(material)) output = "FILL: " + output;
    else if (row.origin && !["", "fill"].includes(String(row.origin).toLowerCase())) {
      output += ` (${row.origin})`;
    }
    return output.trim();
  }

  function soilDescriptionBasis(row) {
    return JSON.stringify(SOIL_BASIS_KEYS.map(key => String(row[key] == null ? "" : row[key])));
  }

  function soilDescriptionState(row) {
    const generated = soilDescription(row);
    const basis = soilDescriptionBasis(row);
    if (classifySoilRow(row) === "empty") {
      return { kind: "empty", label: "Not started", generated, basis };
    }
    if (!row.descTouched) {
      return { kind: "structured", label: "Structured", generated, basis };
    }
    if (row.descBasis && row.descBasis !== basis) {
      return { kind: "out-of-sync", label: "Manual, structured fields changed", generated, basis };
    }
    return { kind: "manual", label: "Manual", generated, basis };
  }

  function validInterval(row) {
    const from = numberOrNull(row && row.from);
    const to = numberOrNull(row && row.to);
    return from !== null && from >= 0 && to !== null && to > from;
  }

  function classifySoilRow(row = {}) {
    if (!hasAnyEntered(row, SOIL_ROW_KEYS)) return "empty";
    if (validInterval(row) && hasAnyEntered(row, ["material", "description"])) return "geology";
    return "draft";
  }

  function classifyRockRow(row = {}) {
    if (!hasAnyEntered(row, ROCK_ROW_KEYS)) return "empty";
    if (isEntered(row.defectType) && numberOrNull(row.from) !== null) return "defect";
    if (validInterval(row) && hasAnyEntered(row, ROCK_GEOLOGY_KEYS)) return "geology";
    if (validInterval(row) && hasAnyEntered(row, CORE_RUN_KEYS)) return "core-run";
    return "draft";
  }

  function reportCounts(log = {}) {
    const soilKinds = (log.soil || []).map(classifySoilRow);
    const rockRows = log.rock || [];
    const rockKinds = rockRows.map(classifyRockRow);
    return {
      soil: soilKinds.filter(kind => kind === "geology").length,
      rock: rockKinds.filter(kind => kind === "geology").length,
      coreRuns: rockRows.filter((row, index) => rockKinds[index] !== "defect" && validInterval(row) && hasAnyEntered(row, CORE_RUN_KEYS)).length,
      defects: rockKinds.filter(kind => kind === "defect").length,
      drafts: soilKinds.filter(kind => kind === "draft").length + rockKinds.filter(kind => kind === "draft").length
    };
  }

  function lithologyPattern(material) {
    const value = String(material || "").trim().toUpperCase();
    if (!value) return "blank";
    if (/\b(?:FILL|TOPSOIL)\b/.test(value)) return "crosshatch";
    if (/\bCLAYSTONE\b/.test(value)) return "claystone";
    if (/\bSILTSTONE\b/.test(value)) return "siltstone";
    if (/\bSANDSTONE\b/.test(value)) return "sandstone";
    if (/\b(?:SHALE|LAMINITE)\b/.test(value)) return "shale";
    if (/\b(?:GRAVEL|CONGLOMERATE)\b/.test(value)) return "gravel";
    if (/\bSAND\b/.test(value)) return "sand";
    if (/\b(?:CLAY|SILT)\b/.test(value)) return "cohesive";
    return "blank";
  }

  function penetration(value, blows) {
    const explicit = numberOrNull(value);
    if (explicit !== null) return explicit;
    return numberOrNull(blows) !== null ? 150 : null;
  }

  function deriveSpt(row) {
    const blows = [row.b1, row.b2, row.b3].map(numberOrNull);
    const penetrations = [
      penetration(row.p1, row.b1),
      penetration(row.p2, row.b2),
      penetration(row.p3, row.b3)
    ];
    const hasTestData = [row.depth, row.b1, row.b2, row.b3, row.p1, row.p2, row.p3]
      .some(hasValue) || Boolean(row.refusal || row.hb);
    const invalidBlows = [row.b1, row.b2, row.b3].some((raw, i) => isEntered(raw) && (blows[i] === null || blows[i] < 0 || !Number.isInteger(blows[i])));
    const invalidPenetration = [row.p1, row.p2, row.p3].some((raw, i) => isEntered(raw) && (numberOrNull(raw) === null || penetrations[i] < 0 || penetrations[i] > 150));
    const invalid = invalidBlows || invalidPenetration;
    const partial = penetrations.some(value => value !== null && value < 150);
    const nIncrementsComplete = blows.every(value => value !== null) && penetrations.every(value => value === 150);
    const totalPenetration = penetrations.reduce((sum, value) => sum + (value || 0), 0);
    const startDepth = numberOrNull(row.depth);
    const endDepth = startDepth !== null && penetrations.some(value => value !== null)
      ? Math.round((startDepth + totalPenetration / 1000) * 1000) / 1000
      : null;

    let status = "empty";
    let label = "Not started";
    let n = "";
    if (invalid) {
      status = "invalid";
      label = "Invalid increments";
    } else if (row.refusal) {
      status = "refusal";
      label = "Refusal";
      n = "R";
    } else if (partial) {
      status = row.hb ? "hammer-bounce" : "partial";
      label = row.hb ? "Hammer bounce / partial" : "Partial penetration";
      n = "R";
    } else if (nIncrementsComplete) {
      n = String(blows[1] + blows[2]);
      status = row.hb ? "hammer-bounce" : "valid";
      label = row.hb ? "Complete with hammer bounce" : "Complete";
    } else if (hasTestData) {
      status = "incomplete";
      label = "Incomplete";
    }

    return {
      blows,
      penetrations,
      totalPenetration,
      endDepth,
      status,
      label,
      n,
      isComplete: status === "valid" || status === "hammer-bounce" || status === "refusal" || status === "partial",
      hasTestData
    };
  }

  function formatSptLine(row) {
    const result = deriveSpt(row);
    const increments = result.blows.map((blow, index) => {
      if (blow === null) return "";
      const pen = result.penetrations[index];
      return pen !== null && pen < 150 ? `${blow}/${pen}` : String(blow);
    }).filter(Boolean);
    const suffix = row.hb ? " HB" : "";
    const nText = result.n ? `N=${result.n}` : "";
    return `${increments.join(",")}${suffix} ${nText}`.trim();
  }

  function formatSptDepthLine(row) {
    const start = numberOrNull(row.depth);
    const result = deriveSpt(row);
    if (start === null) return "SPT -";
    const startText = start.toFixed(2);
    const endText = result.endDepth !== null ? `-${result.endDepth.toFixed(2)}` : "";
    return `SPT ${startText}${endText}`;
  }

  function sptIssues(row) {
    const result = deriveSpt(row);
    const issues = [];
    if (!result.hasTestData) return issues;
    if (numberOrNull(row.depth) === null || numberOrNull(row.depth) < 0) issues.push({ severity: "error", message: "a non-negative test depth is required" });
    if (result.status === "invalid") issues.push({ severity: "error", message: "blows must be whole non-negative values and penetration must be 0-150 mm" });
    if (result.status === "incomplete") issues.push({ severity: "error", message: "seating, 2nd and 3rd increments are required for an N-value" });
    if (result.penetrations.some((value, i) => value !== null && result.blows[i] === null)) issues.push({ severity: "error", message: "each penetration needs its recorded blow count" });
    if (result.status === "partial" && !row.refusal) issues.push({ severity: "warning", message: "partial penetration is reported as N=R; confirm refusal or hammer bounce" });
    if (hasValue(row.n) && String(row.n) !== result.n) issues.push({ severity: "warning", message: `stored N=${row.n} differs from derived N=${result.n || "-"}` });
    const suppliedEnd = numberOrNull(row.endDepth);
    if (suppliedEnd !== null && result.endDepth !== null && Math.abs(suppliedEnd - result.endDepth) > 0.001) {
      issues.push({ severity: "warning", message: `end depth should be ${result.endDepth.toFixed(3)} m from recorded penetration` });
    }
    return issues;
  }

  function intervalIssues(rows) {
    const issues = [];
    const complete = [];
    rows.forEach((row, index) => {
      const from = numberOrNull(row.from);
      const to = numberOrNull(row.to);
      if (from === null && to === null) return;
      if (from === null || to === null) {
        issues.push({ severity: "error", index, message: "interval needs both From and To depths" });
        return;
      }
      if (from < 0 || to <= from) issues.push({ severity: "error", index, message: "From depth must be non-negative and less than To depth" });
      else complete.push({ index, from, to });
    });
    complete.sort((left, right) => left.from - right.from);
    for (let index = 1; index < complete.length; index += 1) {
      const gap = complete[index].from - complete[index - 1].to;
      if (gap > 0.011) issues.push({ severity: "warning", index: complete[index].index, message: `gap of ${gap.toFixed(2)} m before interval` });
      if (gap < -0.011) issues.push({ severity: "error", index: complete[index].index, message: `overlap of ${Math.abs(gap).toFixed(2)} m with previous interval` });
    }
    return issues;
  }

  function coringStartDepth({ borehole = {}, project = {}, rock = [], corebox = {} } = {}) {
    const candidates = [];
    const add = value => {
      const depth = numberOrNull(value);
      if (depth !== null && depth >= 0) candidates.push(depth);
    };

    (corebox.rows || []).forEach(row => {
      const start = numberOrNull(row.start);
      const end = numberOrNull(row.end);
      if (start !== null && end !== null && end > start) add(start);
    });
    add(corebox.topD);

    const units = (rock || []).filter(row => !row.defectType && numberOrNull(row.from) !== null && numberOrNull(row.to) > numberOrNull(row.from));
    units.forEach(row => {
      const hasMetrics = ["tcr", "scr", "rqd", "is50"].some(key => numberOrNull(row[key]) !== null);
      const isCoreboxUnit = row._cbunit || /\bcore(?:box| run)?\b/i.test(String(row.remarks || ""));
      if (hasMetrics || isCoreboxUnit) add(row.from);
    });

    const explicitCoring = Boolean(borehole.coreReq) || /\b(?:core|coring|nmlc|h(?:q|q3)|p(?:q|q3)|diamond)\b/i.test(String(project.drillingMethod || ""));
    if (!candidates.length && explicitCoring) units.forEach(row => add(row.from));

    return candidates.length ? Math.min(...candidates) : null;
  }

  function partitionRockForReport({ borehole = {}, project = {}, rock = [], corebox = {} } = {}) {
    const units = (rock || [])
      .filter(row => !row.defectType && numberOrNull(row.from) !== null && numberOrNull(row.to) > numberOrNull(row.from))
      .slice()
      .sort((left, right) => numberOrNull(left.from) - numberOrNull(right.from));
    const coreStart = coringStartDepth({ borehole, project, rock: units, corebox });
    return {
      coreStart,
      material: coreStart === null ? units : units
        .filter(row => numberOrNull(row.from) < coreStart)
        .map(row => numberOrNull(row.to) > coreStart ? { ...row, to: coreStart } : row),
      cored: coreStart === null ? [] : units
        .filter(row => numberOrNull(row.to) > coreStart)
        .map(row => numberOrNull(row.from) < coreStart ? { ...row, from: coreStart } : row)
    };
  }

  return {
    classifyRockRow,
    classifySoilRow,
    coringStartDepth,
    deriveSpt,
    formatSptDepthLine,
    formatSptLine,
    intervalIssues,
    isGranular,
    lithologyPattern,
    numberOrNull,
    partitionRockForReport,
    reportCounts,
    soilDescription,
    soilDescriptionBasis,
    soilDescriptionState,
    sptIssues
  };
});

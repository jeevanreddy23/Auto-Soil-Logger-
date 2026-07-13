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

  function hasValue(value) {
    return value !== "" && value !== null && value !== undefined;
  }

  function numberOrNull(value) {
    if (!hasValue(value)) return null;
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
    let output = `${material}: ${parts.join(", ")}`;
    const segments = [row.secondary, row.inclusions]
      .filter(Boolean)
      .map(value => String(value).trim());
    const extras = segments.length === 2
      ? segments[0] + (/^(with|trace|and)\b/i.test(segments[1]) ? " " : " and ") + segments[1]
      : (segments[0] || "");
    if (extras) output += (parts.length ? ", " : "") + extras;
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
    if (!row.descTouched) {
      return { kind: "structured", label: "Structured", generated, basis };
    }
    if (row.descBasis && row.descBasis !== basis) {
      return { kind: "out-of-sync", label: "Manual, structured fields changed", generated, basis };
    }
    return { kind: "manual", label: "Manual", generated, basis };
  }

  function penetration(value, blows) {
    const explicit = numberOrNull(value);
    if (explicit !== null) return explicit;
    return hasValue(blows) ? 150 : null;
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
    const invalidBlows = blows.some(value => value !== null && (value < 0 || !Number.isInteger(value)));
    const invalidPenetration = penetrations.some(value => value !== null && (value <= 0 || value > 150));
    const invalid = invalidBlows || invalidPenetration;
    const partial = penetrations.some(value => value !== null && value < 150);
    const nIncrementsComplete = blows[1] !== null && blows[2] !== null && penetrations[1] === 150 && penetrations[2] === 150;
    const totalPenetration = penetrations.reduce((sum, value) => sum + (value || 0), 0);
    const startDepth = numberOrNull(row.depth);
    const endDepth = startDepth !== null && totalPenetration
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
    const nText = result.n ? `N=${result.n}` : "N=-";
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
    if (numberOrNull(row.depth) === null) issues.push({ severity: "error", message: "test depth is required" });
    if (result.status === "invalid") issues.push({ severity: "error", message: "blows must be whole non-negative values and penetration must be 1-150 mm" });
    if (result.status === "incomplete") issues.push({ severity: "error", message: "2nd and 3rd test increments are required for an N-value" });
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
      if (to <= from) issues.push({ severity: "error", index, message: "From depth must be less than To depth" });
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

  return {
    deriveSpt,
    formatSptDepthLine,
    formatSptLine,
    intervalIssues,
    isGranular,
    numberOrNull,
    soilDescription,
    soilDescriptionBasis,
    soilDescriptionState,
    sptIssues
  };
});

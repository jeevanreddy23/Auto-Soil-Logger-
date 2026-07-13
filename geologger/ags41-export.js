(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AGS41Export = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "4.1.1";

  const UNIT_ROWS = [
    ["%", "percentage", ""],
    ["deg", "degree (angle)", ""],
    ["m", "metre", ""],
    ["mm", "millimetre", ""],
    ["yyyy-mm-dd", "year month day", ""]
  ];

  const TYPE_ROWS = [
    ["0DP", "Value; required number of decimal places, 0"],
    ["1DP", "Value; required number of decimal places, 1"],
    ["2DP", "Value; required number of decimal places, 2"],
    ["DT", "Date time in international format"],
    ["ID", "Unique Identifier"],
    ["PA", "Text listed in ABBR Group"],
    ["X", "Text"],
    ["XN", "Text/numeric"]
  ];

  const ABBR_ROWS = [
    ["LOCA_TYPE", "EH", "Exploratory Hole", "", ""],
    ["LOCA_TYPE", "RC", "Rotary cored", "", ""],
    ["LOCA_TYPE", "TP", "Trial pit/trench", "", ""],
    ["LOCA_STAT", "DRAFT", "Draft data", "", ""],
    ["LOCA_STAT", "FINAL", "Final data", "", ""],
    ["SAMP_TYPE", "B", "Bulk disturbed sample", "", ""],
    ["SAMP_TYPE", "C", "Core sample", "", ""],
    ["SAMP_TYPE", "CBR", "CBR mould sample", "", ""],
    ["SAMP_TYPE", "D", "Small disturbed sample", "", ""],
    ["SAMP_TYPE", "ES", "Soil sample for environmental testing", "", ""],
    ["SAMP_TYPE", "EW", "Water sample for environmental testing", "", ""],
    ["SAMP_TYPE", "L", "Liner sample (dynamic)", "", ""],
    ["SAMP_TYPE", "LB", "Large bulk disturbed sample (for earthworks testing)", "", ""],
    ["SAMP_TYPE", "M", "Mazier type sample", "", ""],
    ["SAMP_TYPE", "P", "Piston sample", "", ""],
    ["SAMP_TYPE", "SPTLS", "Standard penetration test liner sample", "", ""],
    ["SAMP_TYPE", "TW", "Thin walled push in sample", "", ""],
    ["SAMP_TYPE", "U", "Undisturbed sample - open drive", "", ""],
    ["SAMP_TYPE", "UT", "Thin wall open drive tube sampler", "", ""],
    ["SAMP_TYPE", "W", "Water sample", "", ""],
    ["DISC_TYPE", "Joint", "Joint", "", ""]
  ];

  function hasValue(value) {
    return value !== "" && value !== null && value !== undefined;
  }

  function numberValue(value) {
    if (!hasValue(value)) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function fixed(value, places) {
    const parsed = numberValue(value);
    return parsed === null ? "" : parsed.toFixed(places);
  }

  function integer(value) {
    const parsed = numberValue(value);
    return parsed === null ? "" : String(Math.round(parsed));
  }

  function clean(value) {
    return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
  }

  function isoDate(value) {
    const text = clean(value);
    if (!text) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  }

  function csvCell(value) {
    return `"${clean(value).replace(/"/g, '""')}"`;
  }

  function line(kind, values) {
    return [kind, ...values].map(csvCell).join(",");
  }

  function group(name, columns, rows) {
    if (!rows.length) return "";
    return [
      line("GROUP", [name]),
      line("HEADING", columns.map(column => column[0])),
      line("UNIT", columns.map(column => column[1])),
      line("TYPE", columns.map(column => column[2])),
      ...rows.map(row => line("DATA", row))
    ].join("\r\n");
  }

  function joinRemarks(parts) {
    return parts.filter(part => clean(part)).map(clean).join("; ");
  }

  function completeIntervals(rows) {
    return (rows || []).filter(row => {
      const from = numberValue(row.from);
      const to = numberValue(row.to);
      return from !== null && to !== null && to > from;
    });
  }

  function hasCoringEvidence(borehole, project, log, domain) {
    if (domain && typeof domain.coringStartDepth === "function") {
      return domain.coringStartDepth({ borehole, project, rock: log.rock || [], corebox: log.corebox || {} }) !== null;
    }
    if (borehole.coreReq || /\b(?:core|coring|nmlc|hq3?|pq3?|diamond)\b/i.test(clean(project.drillingMethod))) return true;
    if ((log.corebox?.rows || []).some(row => numberValue(row.start) !== null && numberValue(row.end) > numberValue(row.start))) return true;
    return (log.rock || []).some(row => ["tcr", "scr", "rqd", "is50"].some(key => numberValue(row[key]) !== null));
  }

  function locationType(borehole, project, log, domain) {
    if (/^(?:TP|PIT)/i.test(clean(borehole.id)) || /test pit/i.test(clean(borehole.holeType))) return "TP";
    return hasCoringEvidence(borehole, project, log, domain) ? "RC" : "EH";
  }

  function sampleType(value) {
    const code = clean(value).toUpperCase();
    if (/^U/.test(code)) return "U";
    if (/^D/.test(code)) return "D";
    if (/^B/.test(code)) return "B";
    if (/^(C|CBR|ES|EW|L|LB|M|P|SPTLS|TW|UT|W)$/.test(code)) return code;
    return "";
  }

  function sptResult(row, domain) {
    if (domain && typeof domain.deriveSpt === "function") return domain.deriveSpt(row);
    const b2 = numberValue(row.b2);
    const b3 = numberValue(row.b3);
    const n = b2 !== null && b3 !== null ? String(b2 + b3) : clean(row.n);
    return { n, status: n ? "valid" : "incomplete", penetrations: [150, 150, 150], totalPenetration: 450 };
  }

  function sptReported(row, result, domain) {
    if (domain && typeof domain.formatSptLine === "function") return domain.formatSptLine(row);
    return result.n ? `N=${result.n}` : "N=-";
  }

  function fractureValues(value) {
    const values = (clean(value).match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
    if (!values.length) return null;
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    return { minimum, maximum, average: values.reduce((sum, item) => sum + item, 0) / values.length };
  }

  function build(state, options = {}) {
    const project = state.project || {};
    const boreholes = state.boreholes || [];
    const logs = state.logs || {};
    const domain = options.domain;
    const produced = isoDate(options.date || new Date().toISOString().slice(0, 10));
    const isFinal = Boolean(project.reviewBy || project.checkedBy);
    const projectId = clean(project.projectNumber || project.reportNumber || "UNASSIGNED");
    const producer = clean(project.companyName || "STS Geotechnics Pty Ltd");
    const recipient = clean(project.clientName || "NOT SUPPLIED");
    const groups = [];

    groups.push(group("PROJ", [
      ["PROJ_ID", "", "ID"], ["PROJ_NAME", "", "X"], ["PROJ_LOC", "", "X"],
      ["PROJ_CLNT", "", "X"], ["PROJ_CONT", "", "X"], ["PROJ_ENG", "", "X"], ["PROJ_MEMO", "", "X"]
    ], [[
      projectId, project.projectName, [project.siteAddress, project.suburb, project.state, project.postcode].filter(Boolean).join(", "),
      project.clientName, project.drillingContractor, project.loggedBy, project.notes
    ]]));

    groups.push(group("TRAN", [
      ["TRAN_ISNO", "", "X"], ["TRAN_DATE", "yyyy-mm-dd", "DT"], ["TRAN_PROD", "", "X"],
      ["TRAN_STAT", "", "X"], ["TRAN_DESC", "", "X"], ["TRAN_AGS", "", "X"],
      ["TRAN_RECV", "", "X"], ["TRAN_REM", "", "X"]
    ], [[
      "1", produced, producer, isFinal ? "FINAL" : "DRAFT", "STS GeoFlow factual borehole data", VERSION,
      recipient, "Visual borehole-log PDFs are issued separately. Missing source fields remain blank."
    ]]));

    groups.push(group("UNIT", [
      ["UNIT_UNIT", "", "X"], ["UNIT_DESC", "", "X"], ["UNIT_REM", "", "X"]
    ], UNIT_ROWS));
    groups.push(group("TYPE", [
      ["TYPE_TYPE", "", "X"], ["TYPE_DESC", "", "X"]
    ], TYPE_ROWS));
    groups.push(group("ABBR", [
      ["ABBR_HDNG", "", "X"], ["ABBR_CODE", "", "X"], ["ABBR_DESC", "", "X"],
      ["ABBR_LIST", "", "X"], ["ABBR_REM", "", "X"]
    ], ABBR_ROWS));

    const locaRows = boreholes.map(borehole => {
      const log = logs[borehole.id] || {};
      return [
        borehole.id, locationType(borehole, project, log, domain), isFinal ? "FINAL" : "DRAFT",
        fixed(hasValue(borehole.easting) ? borehole.easting : project.easting, 2),
        fixed(hasValue(borehole.northing) ? borehole.northing : project.northing, 2), "",
        fixed(hasValue(borehole.rl) ? borehole.rl : project.groundRL, 2), joinRemarks([
          project.coordSystem && `Grid reference system=${project.coordSystem}`,
          borehole.locationDesc,
          borehole.status
        ]),
        fixed(borehole.termDepth, 2), isoDate(borehole.startDate), borehole.termReason, isoDate(borehole.endDate), project.datum
      ];
    });
    groups.push(group("LOCA", [
      ["LOCA_ID", "", "ID"], ["LOCA_TYPE", "", "PA"], ["LOCA_STAT", "", "PA"],
      ["LOCA_NATE", "m", "2DP"], ["LOCA_NATN", "m", "2DP"], ["LOCA_GREF", "", "PA"],
      ["LOCA_GL", "m", "2DP"], ["LOCA_REM", "", "X"], ["LOCA_FDEP", "m", "2DP"],
      ["LOCA_STAR", "yyyy-mm-dd", "DT"], ["LOCA_TERM", "", "X"], ["LOCA_ENDD", "yyyy-mm-dd", "DT"],
      ["LOCA_DATM", "", "X"]
    ], locaRows));

    const geolRows = [];
    const sampleRows = [];
    const sptRows = [];
    const coreRows = [];
    const discRows = [];
    const fracRows = [];

    boreholes.forEach(borehole => {
      const log = logs[borehole.id] || {};
      const soil = completeIntervals(log.soil);
      const rock = completeIntervals((log.rock || []).filter(row => !row.defectType));
      [...soil.map(row => ({ ...row, kind: "soil" })), ...rock.map(row => ({ ...row, kind: "rock" }))]
        .sort((left, right) => numberValue(left.from) - numberValue(right.from))
        .forEach(row => {
          const description = clean(row.description || (row.kind === "rock" ? row.rockType : row.material));
          const remarks = row.kind === "rock"
            ? joinRemarks([row.weathering && `Weathering=${row.weathering}`, row.strength && `Strength=${row.strength}`, row.remarks])
            : joinRemarks([row.uscs && `USCS=${row.uscs}`, row.consistency && `Consistency=${row.consistency}`, row.moisture && `Moisture=${row.moisture}`, row.remarks]);
          geolRows.push([borehole.id, fixed(row.from, 2), fixed(row.to, 2), description, remarks]);
        });

      (log.samples || []).filter(row => numberValue(row.from) !== null).forEach((row, index) => {
        const id = clean(row.sid || `${borehole.id}-S${index + 1}`);
        sampleRows.push([
          borehole.id, fixed(row.from, 2), id, sampleType(row.stype), id, fixed(row.to, 2), row.container,
          joinRemarks([row.tests && `Requested tests=${row.tests}`, row.remarks]), row.stype && `Source type=${row.stype}`
        ]);
      });

      (log.spt || []).filter(row => numberValue(row.depth) !== null).forEach(row => {
        const result = sptResult(row, domain);
        const p = result.penetrations || [numberValue(row.p1), numberValue(row.p2), numberValue(row.p3)];
        const b1 = numberValue(row.b1), b2 = numberValue(row.b2), b3 = numberValue(row.b3);
        sptRows.push([
          borehole.id, fixed(row.depth, 2), integer(hasValue(row.seat) ? row.seat : row.b1), b2 !== null && b3 !== null ? String(b2 + b3) : "",
          integer(result.totalPenetration), /^\d+$/.test(clean(result.n)) ? result.n : "", sptReported(row, result, domain),
          integer(row.energy), integer(b1), integer(b2), integer(b3), integer(p[0]), integer(p[1]), integer(p[2]),
          row.remarks, result.label || result.status
        ]);
      });

      const metricRows = rock.filter(row => ["tcr", "scr", "rqd"].some(key => numberValue(row[key]) !== null));
      const sourceCoreRows = metricRows.length ? metricRows : (log.corebox?.rows || []).filter(row => numberValue(row.start) !== null && numberValue(row.end) > numberValue(row.start));
      sourceCoreRows.forEach(row => coreRows.push([
        borehole.id, fixed(row.from ?? row.start, 2), fixed(row.to ?? row.end, 2), integer(row.tcr), integer(row.scr), integer(row.rqd), row.remarks
      ]));

      (log.rock || []).filter(row => row.defectType && numberValue(row.from) !== null).forEach((row, index) => {
        const top = numberValue(row.from);
        const base = numberValue(row.to);
        discRows.push([
          borehole.id, fixed(top, 2), fixed(base === null ? top : base, 2), "1", String(index + 1),
          /joint/i.test(clean(row.defectType)) ? "Joint" : "", row.defectAngle, row.defectRough,
          row.defectAperture, row.defectInfill, row.defectPersist, joinRemarks([row.defectType, row.remarks])
        ]);
      });

      rock.forEach((row, index) => {
        const spacing = fractureValues(row.defectSpacing);
        if (!spacing) return;
        fracRows.push([
          borehole.id, fixed(row.from, 2), fixed(row.to, 2), String(index + 1),
          fixed(spacing.maximum, 0), fixed(spacing.average, 0), fixed(spacing.minimum, 0), row.remarks
        ]);
      });
    });

    groups.push(group("GEOL", [
      ["LOCA_ID", "", "ID"], ["GEOL_TOP", "m", "2DP"], ["GEOL_BASE", "m", "2DP"],
      ["GEOL_DESC", "", "X"], ["GEOL_REM", "", "X"]
    ], geolRows));
    groups.push(group("SAMP", [
      ["LOCA_ID", "", "ID"], ["SAMP_TOP", "m", "2DP"], ["SAMP_REF", "", "X"],
      ["SAMP_TYPE", "", "PA"], ["SAMP_ID", "", "ID"], ["SAMP_BASE", "m", "2DP"],
      ["SAMP_CONT", "", "X"], ["SAMP_REM", "", "X"], ["SAMP_DESC", "", "X"]
    ], sampleRows));
    groups.push(group("ISPT", [
      ["LOCA_ID", "", "ID"], ["ISPT_TOP", "m", "2DP"], ["ISPT_SEAT", "", "0DP"],
      ["ISPT_MAIN", "", "0DP"], ["ISPT_NPEN", "mm", "0DP"], ["ISPT_NVAL", "", "0DP"],
      ["ISPT_REP", "", "X"], ["ISPT_ERAT", "%", "0DP"], ["ISPT_INC1", "", "0DP"],
      ["ISPT_INC3", "", "0DP"], ["ISPT_INC4", "", "0DP"], ["ISPT_PEN1", "mm", "0DP"],
      ["ISPT_PEN3", "mm", "0DP"], ["ISPT_PEN4", "mm", "0DP"], ["ISPT_REM", "", "X"], ["TEST_STAT", "", "X"]
    ], sptRows));
    groups.push(group("CORE", [
      ["LOCA_ID", "", "ID"], ["CORE_TOP", "m", "2DP"], ["CORE_BASE", "m", "2DP"],
      ["CORE_PREC", "%", "0DP"], ["CORE_SREC", "%", "0DP"], ["CORE_RQD", "%", "0DP"], ["CORE_REM", "", "X"]
    ], coreRows));
    groups.push(group("DISC", [
      ["LOCA_ID", "", "ID"], ["DISC_TOP", "m", "2DP"], ["DISC_BASE", "m", "2DP"],
      ["FRAC_SET", "", "X"], ["DISC_NUMB", "", "X"], ["DISC_TYPE", "", "PA"],
      ["DISC_DIP", "deg", "X"], ["DISC_RGH", "", "X"], ["DISC_APT", "mm", "XN"],
      ["DISC_INFM", "", "X"], ["DISC_PERS", "m", "1DP"], ["DISC_REM", "", "X"]
    ], discRows));
    groups.push(group("FRAC", [
      ["LOCA_ID", "", "ID"], ["FRAC_FROM", "m", "2DP"], ["FRAC_TO", "m", "2DP"],
      ["FRAC_SET", "", "X"], ["FRAC_IMAX", "mm", "XN"], ["FRAC_IAVE", "mm", "XN"],
      ["FRAC_IMIN", "mm", "XN"], ["FRAC_REM", "", "X"]
    ], fracRows));

    return groups.filter(Boolean).join("\r\n\r\n") + "\r\n";
  }

  return { VERSION, build, csvCell, isoDate };
});

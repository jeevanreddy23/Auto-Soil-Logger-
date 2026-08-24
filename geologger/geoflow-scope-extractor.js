(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GeoFlowScopeExtractor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ONES = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19
  };
  const TENS = {
    twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90
  };
  const SMALL_WORDS = Object.keys(ONES).filter(word => word !== "zero").join("|");
  const TENS_WORDS = Object.keys(TENS).join("|");
  const NUMBER_WORD_PATTERN = `(?:${SMALL_WORDS}|(?:${TENS_WORDS})(?:[-\\s](?:one|two|three|four|five|six|seven|eight|nine))?)`;
  const NUMBER_PATTERN = `(?:\\d+(?:\\.\\d+)?|${NUMBER_WORD_PATTERN})`;
  const QUANTITY_PATTERN = `(${NUMBER_PATTERN})(?:\\s*\\(\\s*(\\d+(?:\\.\\d+)?)\\s*\\))?`;
  const APPENDIX_START = /\b(?:terms\s+of\s+agreement\s+for\s+professional\s+services|client\s+acceptance\s+form)\b/i;

  function numberValue(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return null;
    const numeric = Number(raw.replace(/,/g, ""));
    if (Number.isFinite(numeric)) return numeric;
    const parts = raw.replace(/-/g, " ").split(/\s+/).filter(Boolean);
    let total = 0;
    for (const part of parts) {
      if (Object.prototype.hasOwnProperty.call(ONES, part)) total += ONES[part];
      else if (Object.prototype.hasOwnProperty.call(TENS, part)) total += TENS[part];
      else return null;
    }
    return total || null;
  }

  function matchedQuantity(match, wordIndex = 1, numericIndex = 2) {
    return numberValue(match && (match[numericIndex] || match[wordIndex]));
  }

  function sentenceAround(text, index) {
    const isEnd = i => /[.!?]/.test(text[i] || "") &&
      !(text[i] === "." && /\d/.test(text[i - 1] || "") && /\d/.test(text[i + 1] || ""));
    let start = index;
    while (start > 0 && !isEnd(start - 1) && index - start < 500) start--;
    let end = index;
    let sentenceEnds = 0;
    while (end < text.length && end - index < 500) {
      if (isEnd(end) && ++sentenceEnds >= 2) break;
      end++;
    }
    return text.slice(start, Math.min(end + 1, start + 600)).trim();
  }

  function scopedPages(pages) {
    const result = [];
    let appendixReached = false;
    for (const page of Array.isArray(pages) ? pages : []) {
      if (appendixReached) continue;
      const text = String(page && page.text || "");
      const marker = APPENDIX_START.exec(text);
      const relevant = marker ? text.slice(0, marker.index).trim() : text;
      if (relevant) result.push({ n: page.n, text: relevant });
      if (marker) appendixReached = true;
    }
    return result;
  }

  function depthFromContext(text) {
    const match = new RegExp(
      `(?:to\\s+(?:a\\s+)?(?:depth|target\\s+depth)\\s+of|to)\\s+${QUANTITY_PATTERN}\\s*(?:m\\b|metres?\\b)`,
      "i"
    ).exec(text);
    return match ? matchedQuantity(match) : null;
  }

  function quantityRule(prefix, suffix, flags = "gi") {
    return new RegExp(`${prefix}${QUANTITY_PATTERN}${suffix}`, flags);
  }

  const RULES = [
    {
      cat: "drilling", name: "Boreholes",
      re: quantityRule("", "\\s*(?:x\\s*|no\\.?\\s*)?(?:cored\\s+|machine[- ]drilled\\s+)?boreholes?"),
      make: (match, context) => {
        const quantity = matchedQuantity(match);
        const depth = depthFromContext(context);
        const refusal = /or\s+(?:auger\s+|practical\s+|prior\s+)?refusal/i.test(context);
        return {
          name: "Boreholes",
          details: `${quantity ?? "?"} borehole(s)` + (depth ? ` to ${depth} m` : "") + (refusal ? " or refusal" : ""),
          qty: quantity, unit: "No.", extra: { depth, refusal },
          conf: quantity ? (depth ? 0.96 : 0.82) : 0.4
        };
      }
    },
    {
      cat: "drilling", name: "Drilling method",
      re: /(solid\s+flight\s+auger|hollow\s+flight|push[- ]tube|wash\s?bor(?:e|ing)|rotary\s+air|NMLC|HQ3?|PQ|sonic|track[- ]mounted\s+rig|truck[- ]mounted\s+rig|utility[- ]mounted\s+drilling\s+rig)/gi,
      make: match => ({ name: "Drilling method", details: match[1], qty: null, unit: "", conf: 0.85 })
    },
    {
      cat: "drilling", name: "Rock coring",
      re: /rock\s+coring|cored\s+drilling|(NMLC|HQ3?)\s+coring/gi,
      accept: (match, context) => !/\b(?:if|should|where)\b.{0,180}\b(?:required|necessary|requested)\b/i.test(context),
      make: match => ({ name: "Rock coring", details: match[0], qty: null, unit: "", conf: 0.8 })
    },
    {
      cat: "drilling", name: "Test pits",
      re: quantityRule("", "\\s*(?:x\\s*|no\\.?\\s*)?test\\s*pits?"),
      make: match => {
        const quantity = matchedQuantity(match);
        return { name: "Test pits", details: `${quantity} test pit(s)`, qty: quantity, unit: "No.", conf: 0.9 };
      }
    },
    {
      cat: "drilling", name: "Hand augers",
      re: quantityRule("", "\\s*(?:x\\s*|no\\.?\\s*)?hand\\s*augers?"),
      make: match => {
        const quantity = matchedQuantity(match);
        return { name: "Hand augers", details: `${quantity} hand auger(s)`, qty: quantity, unit: "No.", conf: 0.9 };
      }
    },
    {
      cat: "qa", name: "GPS set-out",
      re: /(?:set\s*out|locations?\s+shown).{0,80}\b(?:handheld\s+)?GPS\b|\bGPS\b.{0,80}(?:set\s*out|borehole\s+locations?)/gi,
      make: match => ({ name: "GPS set-out", details: "Investigation locations set out by GPS", qty: null, unit: "", conf: 0.82 })
    },
    {
      cat: "qa", name: "Service locating",
      re: /(?:electronically\s+)?scann?ed?.{0,80}(?:presence\s+of\s+)?services|DBYD\s+(?:search|plans?)|cable\s+locat(?:e|or|ing)/gi,
      make: match => ({ name: "Service locating", details: match[0], qty: null, unit: "", conf: 0.85 })
    },
    {
      cat: "insitu", name: "SPT",
      re: /standard\s+penetration\s+tests?|SPTs?\b/gi,
      make: (match, context) => {
        const interval = /(\d+(?:\.\d+)?)\s*m\s*(?:intervals?|centres|spacing)/i.exec(context);
        return {
          name: "SPT", details: "SPT" + (interval ? ` at ${interval[1]} m intervals` : " (interval not stated)"),
          qty: null, unit: "per BH", extra: { interval: interval ? Number(interval[1]) : null },
          conf: interval ? 0.9 : 0.65
        };
      }
    },
    {
      cat: "insitu", name: "DCP tests",
      re: new RegExp(`(?:${QUANTITY_PATTERN}\\s*(?:x\\s*)?)?(?:DCP|dynamic\\s+cone\\s+penetromet\\w+)`, "gi"),
      make: match => {
        const quantity = matchedQuantity(match);
        return { name: "DCP tests", details: `${quantity ?? ""} DCP test(s)`.trim(), qty: quantity, unit: "No.", conf: quantity ? 0.9 : 0.68 };
      }
    },
    { cat: "insitu", name: "Point load tests", re: /point\s+load\s+tests?/gi, make: match => ({ name: "Point load tests", details: match[0], qty: null, unit: "No.", conf: 0.75 }) },
    { cat: "sampling", name: "Disturbed samples", re: /disturbed\s+samples?/gi, make: () => ({ name: "Disturbed samples", details: "Disturbed sampling", qty: null, unit: "No.", conf: 0.7 }) },
    { cat: "sampling", name: "U50 / undisturbed samples", re: /U50s?|undisturbed\s+(?:tube\s+)?samples?/gi, make: match => ({ name: "U50 / undisturbed samples", details: match[0], qty: null, unit: "No.", conf: 0.75 }) },
    { cat: "sampling", name: "Bulk / CBR samples", re: /bulk\s+samples?/gi, make: () => ({ name: "Bulk / CBR samples", details: "Bulk sampling", qty: null, unit: "No.", conf: 0.7 }) },
    {
      cat: "sampling", name: "Aggressivity samples",
      re: /soil\s+samples?.{0,180}(?:each\s+borehole|aggressiv(?:ity|eness))/gi,
      make: () => ({ name: "Aggressivity samples", details: "Soil samples for aggressivity testing", qty: null, unit: "No.", conf: 0.82 })
    },
    { cat: "lab", name: "CBR", re: /\bCBR\b|california\s+bearing\s+ratio/gi, make: () => ({ name: "CBR", details: "CBR testing", qty: null, unit: "No.", conf: 0.8 }) },
    {
      cat: "lab", name: "Aggressivity testing",
      re: quantityRule("", "\\s*(?:x\\s*)?pH\\s*,?\\s*SO\\s*4\\s*,?\\s*(?:CL|chloride)\\s*(?:&|and|,)\\s*(?:EC|electrical\\s+conductivity)"),
      make: match => {
        const quantity = matchedQuantity(match);
        return { name: "Aggressivity testing", details: "pH, SO4, chloride and EC", qty: quantity, unit: "No.", conf: 0.94 };
      }
    },
    {
      cat: "lab", name: "Shrink-swell",
      re: new RegExp(`(?:${QUANTITY_PATTERN}\\s*(?:x\\s*)?)?shrink[\\s-]?swell`, "gi"),
      make: match => {
        const quantity = matchedQuantity(match);
        return { name: "Shrink-swell", details: "Shrink-swell index", qty: quantity, unit: "No.", conf: quantity ? 0.92 : 0.8 };
      }
    },
    { cat: "lab", name: "Atterberg limits", re: /atterberg/gi, make: () => ({ name: "Atterberg limits", details: "Atterberg limits", qty: null, unit: "No.", conf: 0.85 }) },
    { cat: "lab", name: "PSD", re: /\bPSD\b|particle\s+size\s+distribution/gi, make: () => ({ name: "PSD", details: "Particle size distribution", qty: null, unit: "No.", conf: 0.85 }) },
    { cat: "lab", name: "Moisture content", re: /moisture\s+content/gi, make: () => ({ name: "Moisture content", details: "Moisture content", qty: null, unit: "No.", conf: 0.8 }) },
    { cat: "lab", name: "UCS", re: /\bUCS\b|unconfined\s+compressive/gi, make: () => ({ name: "UCS", details: "Unconfined compressive strength", qty: null, unit: "No.", conf: 0.8 }) },
    {
      cat: "env", name: "Environmental samples",
      re: /(?:undertak\w+|conduct\w+|perform\w+|propos\w+|includ\w+)\s+(?:an?\s+)?environmental\s+(?:assessment|sampling|testing)|collect\w+.{0,80}environmental\s+samples?|contaminat\w+\s+(?:assessment|sampling|testing)/gi,
      make: match => ({ name: "Environmental samples", details: match[0], qty: null, unit: "No.", conf: 0.72 })
    },
    { cat: "env", name: "Acid sulfate soil", re: /acid\s+sulfate|ASS\s+(?:screening|testing)/gi, make: () => ({ name: "Acid sulfate soil", details: "ASS screening/testing", qty: null, unit: "No.", conf: 0.8 }) },
    { cat: "env", name: "Salinity testing", re: /salinity/gi, make: () => ({ name: "Salinity testing", details: "Salinity testing", qty: null, unit: "No.", conf: 0.8 }) },
    {
      cat: "gw", name: "Groundwater observations", re: /groundwater|water\s+levels?|standpipes?|piezometers?/gi,
      make: match => ({ name: "Groundwater observations", details: /standpipe|piezometer/i.test(match[0]) ? `Monitoring well: ${match[0]}` : "Groundwater observation", qty: null, unit: "per BH", conf: 0.78 })
    },
    { cat: "insitu", name: "Pavement investigation", re: /pavement\s+(?:investigation|testing|design)/gi, make: match => ({ name: "Pavement investigation", details: match[0], qty: null, unit: "", conf: 0.8 }) },
    {
      cat: "reporting", name: "Site classification", re: /site\s+classification|AS\s*2870/gi,
      make: (match, context) => ({ name: "Site classification", details: /AS\s*2870/i.test(context) ? "Site classification to AS 2870" : match[0], qty: null, unit: "", conf: 0.88 })
    },
    { cat: "reporting", name: "AS 4676 classification", re: /classification\s+to\s+AS\s*4676|AS\s*4676/gi, make: () => ({ name: "AS 4676 classification", details: "Classification to AS 4676", qty: null, unit: "", conf: 0.88 }) },
    { cat: "reporting", name: "Foundation design parameters", re: /foundation\s+design\s+parameters?/gi, make: match => ({ name: "Foundation design parameters", details: match[0], qty: null, unit: "", conf: 0.9 }) },
    { cat: "reporting", name: "Soil aggressiveness", re: /soil\s+aggressiv(?:ity|eness)(?:\s+AS\s*2159)?/gi, make: match => ({ name: "Soil aggressiveness", details: match[0], qty: null, unit: "", conf: 0.9 }) },
    { cat: "reporting", name: "Construction considerations", re: /comment\s+on\s+any\s+construction\s+problems?/gi, make: match => ({ name: "Construction considerations", details: match[0], qty: null, unit: "", conf: 0.85 }) },
    {
      cat: "reporting", name: "Report",
      re: /(?:geotechnical|factual|interpretive|investigation)\s+report|report\s+will\s+be\s+prepared|prepare(?:d|s|ing)?\s+(?:an?\s+)?report/gi,
      make: match => ({ name: "Report", details: match[0], qty: 1, unit: "No.", conf: 0.88 })
    },
    {
      cat: "reporting", name: "Fieldwork mobilisation",
      re: new RegExp(`fieldwork.{0,100}commence\\s+within\\s+${QUANTITY_PATTERN}\\s+(?:business\\s+|working\\s+)?days`, "gi"),
      make: match => {
        const quantity = matchedQuantity(match);
        return { name: "Fieldwork mobilisation", details: `Fieldwork may commence within ${quantity} working days`, qty: quantity, unit: "days", conf: 0.82 };
      }
    },
    {
      cat: "reporting", name: "Report turnaround",
      re: new RegExp(`report.{0,100}(?:ready|submitted|submission).{0,50}${QUANTITY_PATTERN}\\s+(?:business\\s+|working\\s+)?days`, "gi"),
      make: match => {
        const quantity = matchedQuantity(match);
        return { name: "Report turnaround", details: `Report expected within ${quantity} working days of fieldwork completion`, qty: quantity, unit: "days", conf: 0.82 };
      }
    },
    {
      cat: "reporting", name: "Due date",
      re: /due\s+(?:by|on)\s+([\d/\-\w\s,]{4,30})/gi,
      make: match => ({ name: "Due date", details: `Due ${match[1]}`.trim(), qty: null, unit: "", conf: 0.75 })
    },
    { cat: "qa", name: "Inspection requirements", re: /inspections?\s+(?:by|during|of)|hold\s+points?/gi, make: match => ({ name: "Inspection requirements", details: match[0], qty: null, unit: "", conf: 0.6 }) },
    { cat: "qa", name: "Exclusions", re: /exclusions?\s*:/gi, make: () => ({ name: "Exclusions", details: "Exclusions stated in proposal - review source page", qty: null, unit: "", conf: 0.6 }) },
    { cat: "qa", name: "Assumptions", re: /assumptions?\s*:/gi, make: () => ({ name: "Assumptions", details: "Assumptions stated in proposal - review source page", qty: null, unit: "", conf: 0.6 }) },
    { cat: "missing", name: "Unclear locations", re: /selected\s+locations|locations?\s+to\s+be\s+(?:confirmed|advised)|TBC\b/gi, make: match => ({ name: "Unclear locations", details: `Proposal says "${match[0]}" - quantity/positions unclear`, qty: null, unit: "", conf: 0.35 }) }
  ];

  function preferItem(current, candidate) {
    const currentScore = (current.qty != null ? 4 : 0) + (current.extra && current.extra.depth ? 3 : 0) + current.details.length / 100;
    const candidateScore = (candidate.qty != null ? 4 : 0) + (candidate.extra && candidate.extra.depth ? 3 : 0) + candidate.details.length / 100;
    return candidateScore > currentScore ? candidate : current;
  }

  function inferPerBorehole(items) {
    const boreholes = items.find(item => item.name === "Boreholes" && Number.isFinite(item.qty));
    if (!boreholes) return items;
    for (const item of items) {
      if (item.qty != null || !/each\s+borehole|adjacent\s+to\s+each\s+borehole/i.test(item.snippet || "")) continue;
      if (item.name === "DCP tests") {
        item.qty = boreholes.qty;
        item.details = `${boreholes.qty} DCP test(s) - one per borehole`;
        item.conf = Math.max(item.conf, 0.9);
        item.status = "acc";
      } else if (item.name === "Aggressivity samples") {
        item.qty = boreholes.qty;
        item.details = `${boreholes.qty} aggressivity sample set(s) - one per borehole`;
        item.conf = Math.max(item.conf, 0.9);
        item.status = "acc";
      }
    }
    return items;
  }

  function extract(docs, options) {
    const settings = options || {};
    const idFactory = settings.idFactory || (() => Math.random().toString(36).slice(2, 9));
    const byPageItem = new Map();
    for (const doc of Array.isArray(docs) ? docs : []) {
      for (const page of scopedPages(doc.pages)) {
        const text = page.text || "";
        for (const rule of RULES) {
          rule.re.lastIndex = 0;
          let match;
          while ((match = rule.re.exec(text))) {
            const context = sentenceAround(text, match.index);
            if (rule.accept && !rule.accept(match, context)) continue;
            const base = rule.make(match, context);
            const candidate = Object.assign({
              id: idFactory(), cat: rule.cat, page: page.n, doc: doc.name,
              snippet: context.slice(0, 400), status: base.conf >= 0.8 ? "acc" : "rev",
              comment: "", link: ""
            }, base);
            const key = `${candidate.cat}|${candidate.name}|${doc.id || doc.name}|${page.n}`;
            const current = byPageItem.get(key);
            byPageItem.set(key, current ? preferItem(current, candidate) : candidate);
            if (byPageItem.size > 200) return inferPerBorehole([...byPageItem.values()]);
            if (match[0] === "") rule.re.lastIndex++;
          }
        }
      }
    }
    return inferPerBorehole([...byPageItem.values()]);
  }

  return { extract, numberValue, scopedPages, sentenceAround };
});

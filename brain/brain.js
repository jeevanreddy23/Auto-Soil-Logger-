#!/usr/bin/env node
"use strict";
/**
 * GeoFlow Local Retrieval Router
 * Native Node.js script. No external dependencies.
 *
 * Usage:
 *   node brain.js "pile socket shale class III" ./docs ./projects ./logs
 *
 * Output:
 *   Best matching markdown section only, printed to stdout.
 */
const fs = require("fs");
const path = require("path");
const STOP_WORDS = new Set([
  "a","an","the","and","or","but","if","then","else","when","where","why","how",
  "what","which","who","whom","this","that","these","those","is","are","was","were",
  "be","been","being","to","of","in","on","for","from","by","with","without","as",
  "at","into","onto","about","over","under","again","further","once","here","there",
  "can","could","should","would","may","might","must","shall","will","do","does",
  "did","done","has","have","had","it","its","their","our","your","my","we","you",
  "they","he","she","them","his","her","not","no","yes","please","need","needs",
  "using","use","used","get","make","create","find","show","give","tell"
]);
const DEFAULT_DIRS = [
  path.join(process.cwd(), "docs"),
  path.join(process.cwd(), "projects"),
  path.join(process.cwd(), "logs"),
  path.join(process.cwd(), "knowledge")
];
function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9.\-_/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function tokenize(text) {
  return normalize(text)
    .split(" ")
    .filter(Boolean)
    .filter(t => !STOP_WORDS.has(t))
    .filter(t => t.length > 1);
}
function walkMarkdownFiles(dir) {
  const output = [];
  if (!fs.existsSync(dir)) return output;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (!["node_modules", ".git", ".next", "dist", "build"].includes(item.name)) {
        output.push(...walkMarkdownFiles(full));
      }
    } else if (item.isFile() && item.name.toLowerCase().endsWith(".md")) {
      output.push(full);
    }
  }
  return output;
}
function extractHeaderIndex(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i]);
    if (!match) continue;
    entries.push({
      filePath,
      level: match[1].length,
      header: match[2].trim(),
      lineStart: i,
      lineEnd: lines.length - 1,
      tokens: tokenize(match[2])
    });
  }
  for (let i = 0; i < entries.length; i++) {
    const current = entries[i];
    for (let j = i + 1; j < entries.length; j++) {
      if (entries[j].level <= current.level) {
        current.lineEnd = entries[j].lineStart - 1;
        break;
      }
    }
  }
  return entries;
}
function scoreEntry(entry, queryTokens) {
  const headerTokens = entry.tokens;
  const fileTokens = tokenize(path.basename(entry.filePath));
  const allTokens = [...headerTokens, ...fileTokens];
  let score = 0;
  const uniqueQuery = [...new Set(queryTokens)];
  for (const q of uniqueQuery) {
    for (const t of allTokens) {
      if (t === q) score += 10;
      else if (t.startsWith(q) || q.startsWith(t)) score += 5;
      else if (t.includes(q) || q.includes(t)) score += 2;
    }
  }
  const headerText = normalize(entry.header);
  const queryPhrase = normalize(queryTokens.join(" "));
  if (headerText.includes(queryPhrase) && queryPhrase.length > 3) score += 25;
  if (score === 0) return 0; /* structural bonuses only when keywords actually hit */
  score += Math.max(0, 8 - entry.level);
  score += Math.min(headerTokens.length, 8) * 0.25;
  return score;
}
/* body-frequency fallback: when headings don't match, count keyword hits inside
   section bodies (cheap indexOf scan, capped) so vocabulary-mismatched queries
   still route to the right section instead of returning nothing. */
function bodyScore(entry, queryTokens, rawCache) {
  let raw = rawCache.get(entry.filePath);
  if (!raw) { raw = fs.readFileSync(entry.filePath, "utf8").toLowerCase(); rawCache.set(entry.filePath, raw); }
  const lines = raw.split(/\r?\n/);
  const body = lines.slice(entry.lineStart, entry.lineEnd + 1).join("\n");
  let score = 0;
  for (const q of new Set(queryTokens)) {
    let n = 0, p = -1;
    while ((p = body.indexOf(q, p + 1)) >= 0 && n < 25) n++;
    score += n;
  }
  return score;
}
function sliceSection(entry) {
  const raw = fs.readFileSync(entry.filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const sliced = lines.slice(entry.lineStart, entry.lineEnd + 1).join("\n").trim();
  return [
    `<!-- GeoFlow Retrieval Router -->`,
    `<!-- file: ${entry.filePath} -->`,
    `<!-- lines: ${entry.lineStart + 1}-${entry.lineEnd + 1} -->`,
    "",
    sliced
  ].join("\n");
}
function main() {
  const args = process.argv.slice(2);
  const query = args[0];
  if (!query || query.trim().length < 2) {
    process.stderr.write("Usage: node brain.js \"search query\" [dir1 dir2 ...]\n");
    process.exit(1);
  }
  const dirs = args.slice(1).length > 0 ? args.slice(1) : DEFAULT_DIRS;
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    process.stderr.write("Search query contains no meaningful keywords.\n");
    process.exit(1);
  }
  const markdownFiles = dirs.flatMap(d => walkMarkdownFiles(path.resolve(d)));
  const index = markdownFiles.flatMap(extractHeaderIndex);
  if (index.length === 0) {
    process.stderr.write("No markdown headers found in scanned directories.\n");
    process.exit(1);
  }
  let ranked = index
    .map(entry => ({ entry, score: scoreEntry(entry, queryTokens) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  /* confidence floor: if the best heading score is weak, fall back to
     body keyword frequency across all sections (still deterministic + cheap) */
  const CONFIDENCE_FLOOR = 12;
  if (ranked.length === 0 || ranked[0].score < CONFIDENCE_FLOOR) {
    const rawCache = new Map();
    const byBody = index
      .map(entry => ({ entry, score: bodyScore(entry, queryTokens, rawCache) }))
      .filter(x => x.score >= 2)
      /* highest hit count wins; on ties prefer the smallest (most specific) section */
      .sort((a, b) => b.score - a.score ||
        (a.entry.lineEnd - a.entry.lineStart) - (b.entry.lineEnd - b.entry.lineStart));
    if (byBody.length) ranked = byBody;
  }
  if (ranked.length === 0) {
    process.stderr.write("No relevant markdown section found.\n");
    process.exit(2);
  }
  process.stdout.write(sliceSection(ranked[0].entry));
}
main();

#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([".git", ".next", "node_modules", "coverage", "dist"]);
const TOKEN_RE = /\b(?:bg-white|text-black)(?:\/[\w.[\]-]+)?\b/g;

function collectFiles(target) {
  const absolute = resolve(ROOT, target);
  const stat = statSync(absolute);
  if (stat.isFile()) return extname(absolute) === ".tsx" ? [absolute] : [];

  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) return [];
    const child = join(absolute, entry.name);
    if (entry.isDirectory()) return collectFiles(child);
    return entry.isFile() && extname(entry.name) === ".tsx" ? [child] : [];
  });
}

function exceptionHint(file, context) {
  const value = `${file}\n${context}`.toLowerCase();
  if (/print:|@media\s+print|pdf|export/.test(value)) return "print/export";
  if (/iframe|htmlpreview|webpage|page preview|matte/.test(value)) return "html/iframe matte";
  if (/canvas|image|video|media|camera|capture|crop|bbox|gradient|artwork/.test(value)) return "media/canvas overlay";
  if (/theme|darkmode|lightmode|appearance|surface\s*===\s*["']dark/.test(value)) {
    return "explicit theme selection";
  }
  if (/fixture|sample|specimen|demo|game|loader/.test(value)) return "fixture/specimen";
  return null;
}

const args = process.argv.slice(2);
const json = args.includes("--json");
const targets = args.filter((arg) => !arg.startsWith("--"));
const roots = targets.length > 0 ? targets : ["."];
const files = [...new Set(roots.flatMap(collectFiles))].sort();
const matches = [];

for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const tokens = [...line.matchAll(TOKEN_RE)].map((match) => match[0]);
    if (tokens.length === 0) return;
    const context = lines.slice(Math.max(0, index - 2), index + 3).join("\n");
    matches.push({
      file: relative(ROOT, file),
      line: index + 1,
      tokens,
      sameLineDarkPair: /\bdark:/.test(line),
      exceptionHint: exceptionHint(file, context),
      source: line.trim(),
    });
  });
}

const summary = {
  scannedFiles: files.length,
  matchingFiles: new Set(matches.map((match) => match.file)).size,
  matchingLines: matches.length,
  sameLinePaired: matches.filter((match) => match.sameLineDarkPair).length,
  reviewCandidates: matches.filter((match) => !match.sameLineDarkPair).length,
};

if (json) {
  process.stdout.write(`${JSON.stringify({ summary, matches }, null, 2)}\n`);
} else {
  console.log(
    `P4 light/dark detector: ${summary.scannedFiles} files scanned; ` +
      `${summary.matchingLines} matching lines; ${summary.reviewCandidates} require review.`,
  );
  for (const match of matches.filter((entry) => !entry.sameLineDarkPair)) {
    const hint = match.exceptionHint ? ` [possible ${match.exceptionHint}]` : "";
    console.log(`${match.file}:${match.line}${hint} ${match.source}`);
  }
  console.log("Hints are triage aids, never automatic exclusions.");
}

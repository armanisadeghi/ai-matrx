#!/usr/bin/env node
/**
 * validate-discover.mjs — refuse a Discover output that was not really done.
 *
 * WHY (2026-09-30, P14 round 1): three of three haiku Discover agents mapped each detector
 * rule straight to a verdict without opening the code (10 tool calls for 143 candidates),
 * invented verdict names, and "proposed" placeholders like "(rewrite shorter – target ≤60)".
 * A Discover line is only useful if it proves the file was read and carries the exact fix.
 *
 * Usage:
 *   node scripts/interface-text/validate-discover.mjs <units.json> <discover.jsonl> [--root=<repo>]
 * Exit 0 = valid. Exit 1 = every problem printed, one per line, with the unit id.
 * Run it, fix every line it names, run it again — Discover is done only on exit 0.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ARGS = process.argv.slice(2);
const [unitsPath, discoverPath] = ARGS.filter((a) => !a.startsWith("--"));
const rootArg = ARGS.find((a) => a.startsWith("--root="));
const ROOT = rootArg ? resolve(rootArg.slice(7)) : resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const VERDICTS = new Set([
  "author-facing", "restates-obvious", "page-description", "too-long",
  "definition-to-tooltip", "asymmetric", "primitive", "legit", "unsure",
]);
const BUDGET = { secondary: 60, body: 120, tooltip: 140, placeholder: 60, consequence: 140 };
const PLACEHOLDER = /\b(rewrite|shorten|shorter|target|split|≤|<=|TBD|todo|condense)\b/i;
const NEEDS_TEXT = new Set(["too-long"]);
const NO_FIX = new Set(["legit", "unsure"]);

export function validate(units, lines, readFile) {
  const problems = [];
  const byId = new Map(units.map((u) => [u.id, u]));
  const seen = new Map();
  lines.forEach((raw, i) => {
    const where = `line ${i + 1}`;
    let d;
    try { d = JSON.parse(raw); } catch { problems.push(`${where}: not JSON`); return; }
    const id = d.id ?? `${d.file}:${d.line}`;
    const u = byId.get(id);
    if (!u) { problems.push(`${where}: id "${id}" is not a unit in units.json`); return; }
    seen.set(id, (seen.get(id) ?? 0) + 1);
    if (!VERDICTS.has(d.verdict)) problems.push(`${id}: verdict "${d.verdict}" is not one of ${[...VERDICTS].join(", ")}`);
    if (typeof d.slot !== "string" || d.slot.length < 3) problems.push(`${id}: "slot" missing — name the component slot the text renders in`);
    if (typeof d.siblings !== "string" || d.siblings.length < 3) problems.push(`${id}: "siblings" missing — say what the neighbours carry (or "none")`);
    // Proof of reading: a verbatim snippet from within 20 lines of the unit.
    const ctx = typeof d.context === "string" ? d.context.trim() : "";
    if (ctx.length < 20) problems.push(`${id}: "context" missing — paste ≥20 verbatim characters of code from within 20 lines of the unit`);
    else {
      const src = readFile(u.file);
      const lines = src ? src.split("\n") : [];
      const window = lines.slice(Math.max(0, u.line - 21), u.line + 20).join("\n").replace(/\s+/g, " ");
      if (!window.includes(ctx.replace(/\s+/g, " "))) problems.push(`${id}: "context" is not verbatim code within 20 lines of line ${u.line}`);
    }
    const proposed = typeof d.proposed === "string" ? d.proposed.trim() : "";
    if (!proposed) problems.push(`${id}: "proposed" missing`);
    else if (NO_FIX.has(d.verdict)) { if (proposed !== "(none)") problems.push(`${id}: ${d.verdict} → proposed must be "(none)"`); }
    else if (proposed.startsWith("(")) {
      if (!/^\(delete(;[^)]*)?\)$/.test(proposed)) problems.push(`${id}: proposed "${proposed}" — use the exact new text, "(delete)", or "(delete; <where the fact goes>)"`);
      if (NEEDS_TEXT.has(d.verdict)) problems.push(`${id}: too-long needs the exact rewritten text, not a delete — or change the verdict`);
    } else {
      if (PLACEHOLDER.test(proposed) && proposed.length < 40 && /\(|target|≤/.test(proposed)) problems.push(`${id}: proposed looks like an instruction, not the new text`);
      const budget = BUDGET[u.slot ?? "secondary"] ?? 60;
      if (proposed.length > budget) problems.push(`${id}: proposed is ${proposed.length} chars; the ${u.slot ?? "secondary"} budget is ${budget}`);
      if (proposed === u.text) problems.push(`${id}: proposed is identical to the current text`);
      // Round 2 pilot: haiku met the budget by cutting the original at 60 chars mid-sentence.
      const norm = (x) => x.replace(/\s+/g, " ").trim().toLowerCase();
      if (proposed.length < u.text.length && norm(u.text).startsWith(norm(proposed).replace(/[.…]+$/, ""))) problems.push(`${id}: proposed is the original cut short — rewrite it to say the point in fewer words`);
      const sentences = (proposed.match(/[.!?](?=\s+[A-Z(]|\s*$)/g) ?? []).length;
      const maxSentences = u.slot === "consequence" || u.slot === "body" ? 2 : 1;
      if (sentences > maxSentences) problems.push(`${id}: proposed has ${sentences} sentences; a ${u.slot ?? "secondary"} slot holds ${maxSentences}`);
      if (/\b(the|a|an|to|of|and|or|so|that|with|for|is|are)\s*$/i.test(proposed)) problems.push(`${id}: proposed ends mid-phrase ("${proposed.slice(-20)}")`);
    }
    if (d.verdict === "definition-to-tooltip") {
      const t = typeof d.tooltip === "string" ? d.tooltip.trim() : "";
      if (!t || t.length > 140) problems.push(`${id}: definition-to-tooltip needs "tooltip" ≤140 chars`);
    }
    if (d.verdict === "unsure" && (typeof d.why !== "string" || d.why.length < 8)) problems.push(`${id}: unsure needs "why" saying what you could not tell`);
  });
  for (const u of units) {
    const n = seen.get(u.id) ?? 0;
    if (n === 0) problems.push(`${u.id}: no Discover line`);
    if (n > 1) problems.push(`${u.id}: ${n} Discover lines — exactly one per unit`);
  }
  return problems;
}

/** Review output (`{"batches":[…]}`): every replacement a reviewer writes obeys the same budgets. */
export function validateReview(units, review) {
  const problems = [];
  const byId = new Map(units.map((u) => [u.id, u]));
  const ACTIONS = new Set(["replace", "delete", "tooltip", "replace+tooltip", "keep"]);
  const fileBatch = new Map();
  for (const b of review.batches ?? []) {
    if ((b.files ?? []).length > 15) problems.push(`${b.id}: ${b.files.length} files — a batch holds at most 15`);
    for (const f of b.files ?? []) { if (fileBatch.has(f)) problems.push(`${f}: in batches ${fileBatch.get(f)} and ${b.id}`); fileBatch.set(f, b.id); }
    for (const it of b.items ?? []) {
      const id = it.id ?? `${it.file}:${it.line}`;
      if (!ACTIONS.has(it.action)) problems.push(`${id}: action "${it.action}"`);
      const u = byId.get(id);
      const slot = u?.slot ?? "secondary";
      const budget = BUDGET[slot] ?? 60;
      if (it.new_text && /replace/.test(it.action)) {
        const t = it.new_text.trim();
        if (t.length > budget && !/\$\{|\{/.test(t)) problems.push(`${id}: new_text is ${t.length} chars; the ${slot} budget is ${budget}`);
        const n = (t.match(/[.!?](?=\s+[A-Z(]|\s*$)/g) ?? []).length;
        const max = slot === "consequence" || slot === "body" ? 2 : 1;
        if (n > max) problems.push(`${id}: new_text has ${n} sentences; a ${slot} slot holds ${max}`);
      }
      if (it.tooltip && it.tooltip.trim().length > 140) problems.push(`${id}: tooltip over 140 chars`);
    }
  }
  return problems;
}

if (process.argv[1] && process.argv[1].endsWith("validate-discover.mjs") && discoverPath?.endsWith(".json")) {
  const units = JSON.parse(readFileSync(unitsPath, "utf8")).units;
  const problems = validateReview(units, JSON.parse(readFileSync(discoverPath, "utf8")));
  if (problems.length) { for (const p of problems) console.log(p); console.log(`\n${problems.length} problem(s) — Review is NOT done.`); process.exit(1); }
  console.log("valid — every replacement fits its slot.");
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith("validate-discover.mjs")) {
  if (!unitsPath || !discoverPath) { console.error("usage: validate-discover.mjs <units.json> <discover.jsonl> [--root=<repo>]"); process.exit(2); }
  const units = JSON.parse(readFileSync(unitsPath, "utf8")).units;
  const lines = existsSync(discoverPath) ? readFileSync(discoverPath, "utf8").split("\n").filter((l) => l.trim()) : [];
  const cache = new Map();
  const readFile = (f) => { if (!cache.has(f)) { try { cache.set(f, readFileSync(resolve(ROOT, f), "utf8")); } catch { cache.set(f, null); } } return cache.get(f); };
  const problems = validate(units, lines, readFile);
  if (problems.length) { for (const p of problems) console.log(p); console.log(`\n${problems.length} problem(s) — Discover is NOT done.`); process.exit(1); }
  console.log(`valid — ${units.length} unit(s), one reviewed line each.`);
}

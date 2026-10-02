#!/usr/bin/env node
/**
 * check-context-word.mjs — the word "context" on screen names context, and nothing else.
 *
 * WHY (Arman, 2026-10-02): "Nothing should call something context unless it's context." Context
 * is what an agent receives for a turn beyond the person's message and its own instructions
 * (common-docs/systems/platform/vocabulary/FEATURE.md § The word "Context"). A scope picker, a
 * record's scopes, a rules editor or a setting is not context, and was labelled "Context",
 * "Working context", "Set context" across the app until 2026-10-02.
 *
 * What it does: finds user-visible strings in .tsx (JSX text, label/title/aria-label/placeholder/
 * tooltip/description/emptyText/heading/name/subtitle props, toast messages) that contain the
 * word, drops the approved correct uses (ALLOWED below), and compares the rest with the baseline
 * `context-word-baseline.json`. A string not in the baseline is NEW and is reported.
 *
 * Advisory: exits 0 unless --strict. Fix a NEW line by naming the thing (Scopes, Rules, Settings…)
 * or, when it really is context, by using an approved phrase. Never grow the baseline to pass.
 *
 * Usage:
 *   node scripts/interface-text/check-context-word.mjs [--root=DIR] [--strict]
 *   node scripts/interface-text/check-context-word.mjs --write-baseline
 *   node scripts/interface-text/check-context-word.mjs --self-test
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARGS = process.argv.slice(2);
const arg = (name) => ARGS.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const ROOT = resolve(arg("root") ?? resolve(HERE, "../.."));
const BASELINE = resolve(HERE, "context-word-baseline.json");
const SCAN = ["app", "features", "components", "packages"];
const SKIP_DIR = /(^|\/)(node_modules|dist|\.next|__tests__|__mocks__|\(dev\))(\/|$)/;
const SKIP_FILE = /\.(test|spec|stories)\.tsx$/;

/** Approved uses — each names real context (or is an unrelated fixed term). Lexicon § The word "Context". */
export const ALLOWED = [
  /\bcontext items?\b/gi, // Arman 2026-10-02: scope-mapped items delivered to agents are context
  /\bcontext values?\b/gi,
  /\bcontext polic(y|ies)\b/gi, // a policy ABOUT context (lexicon: Context Policy)
  /\bsystem context\b/gi, // System Context Item
  /\bcontext objects?\b/gi,
  /\bcontext windows?\b/gi, // the model's context
  /\bmodel context\b/gi, // incl. Model Context Protocol
  /\bcontext menus?\b/gi, // right-click menu — unrelated UI term
  /\b(preview|inspect(or)?) context\b/gi,
  /\bcontext (preview|inspector)\b/gi,
];

const PROP = /\b(label|title|aria-label|placeholder|tooltip|description|emptyText|heading|name|subtitle|sublabel)\s*[=:]\s*(?:\{\s*)?(["'`])((?:(?!\2).){0,400}?)\2/g;
const JSX_TEXT = />([^<>{}]{1,400})</g;
const TOAST = /\btoast(?:\.\w+)?\(\s*(["'`])((?:(?!\1).){0,400}?)\1/g;
const WORD = /\bcontext\b/i;

/** Every user-visible candidate string in `src` that still says "context" after the approved uses. */
export function findOffenders(src) {
  const out = new Set();
  const consider = (text) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (!t || !WORD.test(t)) return;
    let rest = t;
    for (const re of ALLOWED) rest = rest.replace(re, "");
    if (WORD.test(rest)) out.add(t);
  };
  for (const m of src.matchAll(PROP)) consider(m[3]);
  for (const m of src.matchAll(JSX_TEXT)) consider(m[1]);
  for (const m of src.matchAll(TOAST)) consider(m[2]);
  return [...out];
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (SKIP_DIR.test(p)) continue;
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx") && !SKIP_FILE.test(e.name)) out.push(p);
  }
  return out;
}

function scan(root) {
  const rows = [];
  for (const top of SCAN) {
    for (const f of walk(join(root, top))) {
      const rel = relative(root, f);
      for (const text of findOffenders(readFileSync(f, "utf8"))) rows.push(`${rel} :: ${text}`);
    }
  }
  return rows.sort();
}

function selfTest() {
  const cases = [
    ['<Row label="Active Context">', 1],
    ['<span>Set context</span>', 1],
    ['toast.success("Context updated")', 1],
    ['<Label>Context items</Label>', 0],
    ['title="Context policies"', 0],
    ['label="Context Window"', 0],
    ['<span>Context menu</span>', 0],
    ['label="Scopes"', 0],
    ['const x = useContext(Foo)', 0],
  ];
  let bad = 0;
  for (const [src, want] of cases) {
    const got = findOffenders(src).length;
    if (got !== want) { bad++; console.error(`self-test FAIL: ${src} → ${got}, want ${want}`); }
  }
  if (bad) process.exit(1);
  console.log(`self-test ok (${cases.length} cases)`);
}

if (ARGS.includes("--self-test")) {
  selfTest();
} else {
  const rows = scan(ROOT);
  if (ARGS.includes("--write-baseline")) {
    writeFileSync(BASELINE, JSON.stringify(rows, null, 2) + "\n");
    console.log(`baseline written: ${rows.length} existing lines`);
  } else {
    const known = new Set(existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : []);
    const fresh = rows.filter((r) => !known.has(r));
    if (fresh.length === 0) {
      console.log(`check:context-word ok — ${rows.length} on-screen line(s), none new`);
    } else {
      console.log(`check:context-word — ${fresh.length} NEW on-screen use(s) of "context" that is not context:`);
      for (const r of fresh) console.log(`  NEW ${r}`);
      console.log('Name the thing instead (Scopes, Rules, Settings…). Lexicon: common-docs/systems/platform/vocabulary/FEATURE.md § The word "Context".');
      if (ARGS.includes("--strict")) process.exit(1);
    }
  }
}

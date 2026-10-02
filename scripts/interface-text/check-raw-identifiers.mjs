#!/usr/bin/env node
/**
 * check-raw-identifiers.mjs — a machine identifier never renders as words on a screen.
 *
 * WHY (Arman, 2026-10-02): "Our UI should NEVER EVER show something like snake_case, except very
 * specific places where the user is directly using those things." A screen shows a thing's label,
 * else its identifier through THE humanizer (`humanizeIdentifier` / `displayLabel` from
 * `@ai-matrx/kit/text-case`; a variable: `variableRunLabel` from `@ai-matrx/agents/variables`).
 * Where a person directly uses the identifier (a `{{key}}` field, a code/JSON view) it renders as a
 * monospace token — `<code>` or a `font-mono` element — and this check leaves it alone.
 *
 * What it flags in .tsx (outside tests, demos and `(dev)`):
 *   1. snake_case words in visible literal text — JSX text and label/title/placeholder/aria-label/
 *      heading/description/tooltip props (`<span>normal_text</span>`, `title="tool_name"`);
 *   2. an identifier-shaped value rendered bare — `{variable.name}`, `{tool.name}`, `{x.key}`,
 *      `{x.slug}`, `{x.kind}`, `{toolName}`, `{variableName}`… as a JSX child or a visible prop.
 * A line inside a `<code>` / `font-mono` element (looked up to 3 lines back) is an identifier on
 * purpose and is skipped. Findings are compared with `raw-identifiers-baseline.json`; only a line
 * not in the baseline is NEW. The baseline only shrinks: fix a NEW line with the label or the
 * humanizer, never by growing the baseline.
 *
 * Advisory: exits 0 unless --strict.
 *
 * Usage:
 *   node scripts/interface-text/check-raw-identifiers.mjs [--root=DIR] [--strict]
 *   node scripts/interface-text/check-raw-identifiers.mjs --write-baseline
 *   node scripts/interface-text/check-raw-identifiers.mjs --self-test
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARGS = process.argv.slice(2);
const arg = (name) => ARGS.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const ROOT = resolve(arg("root") ?? resolve(HERE, "../.."));
const BASELINE = resolve(HERE, "raw-identifiers-baseline.json");
const SCAN = ["app", "features", "components", "packages"];
const SKIP_DIR = /(^|\/)(node_modules|dist|\.next|__tests__|__mocks__|demo|demos|\(dev\))(\/|$)/;
const SKIP_FILE = /\.(test|spec|stories|dev)\.tsx$/;

const VISIBLE_PROPS = "label|title|placeholder|aria-label|heading|description|tooltip|emptyText|subtitle|sublabel";
const SNAKE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/;
/** `x.name` only where `x` is an identifier-shaped thing (a person's or an agent's name is words). */
const NAME_RECEIVER = "variable|v|def|varDef|variableDef|tool|field|param|arg|control|slot|column|col|prop|property|setting|input|binding";
const ID_EXPR = new RegExp(
  String.raw`^(?:(?:${NAME_RECEIVER})\??\.name|[\w$.?]*\??\.(?:key|slug|kind|toolName|tool_name|fieldKey|field_key|variableName|contextKey|identifier)|toolName|variableName|fieldKey|contextKey|slug)$`,
);
const CHILD_EXPR = />\s*\{\s*([\w$.?]+)\s*\}/g;
/** A child expression alone on its line (the JSX text of a multi-line element). */
const LONE_CHILD = /^\s*\{\s*([\w$.?]+)\s*\}\s*$/;
const PROP_EXPR = new RegExp(String.raw`\b(?:${VISIBLE_PROPS})=\{\s*([\w$.?]+)\s*\}`, "g");
const PROP_LIT = new RegExp(String.raw`\b(?:${VISIBLE_PROPS})\s*=\s*(["'])((?:(?!\1).){1,300})\1`, "g");
const JSX_TEXT = />([^<>{}]{1,300})</g;
const CODE_LIKE = /=>|===|\);|\breturn\b|\bconst\b|\bcase\s*["']|(?<!:)\/\/|\?\.\w|\(|\)/;
const IDENTIFIER_ON_PURPOSE = /<code\b|<kbd\b|<pre\b|font-mono/;

/** Every rendered raw identifier in `src`, as `line-text` snippets (stable across line moves). */
export function findOffenders(src) {
  const out = new Set();
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    const near = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
    if (IDENTIFIER_ON_PURPOSE.test(near)) return;
    const t = line.trim();
    for (const m of line.matchAll(CHILD_EXPR)) if (ID_EXPR.test(m[1])) out.add(t);
    const lone = LONE_CHILD.exec(line);
    if (lone && ID_EXPR.test(lone[1])) out.add(t);
    for (const m of line.matchAll(PROP_EXPR)) if (ID_EXPR.test(m[1])) out.add(t);
    for (const m of line.matchAll(PROP_LIT)) if (SNAKE.test(m[2])) out.add(t);
    for (const m of line.matchAll(JSX_TEXT)) {
      const text = m[1].trim();
      if (!text || CODE_LIKE.test(text)) continue;
      if (SNAKE.test(text)) out.add(t);
    }
  });
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
  return [...new Set(rows)].sort();
}

function selfTest() {
  const cases = [
    ["<span>{variable.name}</span>", 1],
    ['<Label title={tool.name}>x</Label>', 1],
    ["<p>{row.kind}</p>", 1],
    ["<p>Saved as normal_text</p>", 1],
    ['<Row label="tool_name" />', 1],
    ["<span>{variableRunLabel(variable)}</span>", 0],
    ["<span>{displayLabel(tool.label, tool.name)}</span>", 0],
    ['<code className="font-mono">{variable.name}</code>', 0],
    ['<span className="font-mono text-xs">\n  {variable.name}\n</span>', 0],
    ["<span>{agent.name}</span>", 0],
    ["<span>{person.name}</span>", 0],
    ["<li key={v.name}>Normal Text</li>", 0],
    ['<span className="truncate" title={x}>\n  {variable.name}\n</span>', 1],
    ['<Row label="Normal Text" />', 0],
  ];
  let bad = 0;
  for (const [src, want] of cases) {
    const got = findOffenders(src).length;
    if (got !== want) {
      bad++;
      console.error(`self-test FAIL: ${src} → ${got}, want ${want}`);
    }
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
    const known = new Set(existsSync(BASELINE) && !arg("root") ? JSON.parse(readFileSync(BASELINE, "utf8")) : []);
    const fresh = rows.filter((r) => !known.has(r));
    if (fresh.length === 0) {
      console.log(`check:raw-identifiers ok — ${rows.length} known line(s), none new`);
    } else {
      console.log(`check:raw-identifiers — ${fresh.length} NEW rendered raw identifier(s):`);
      for (const r of fresh) console.log(`  NEW ${r}`);
      console.log(
        "Show the label, else humanizeIdentifier/displayLabel (@ai-matrx/kit/text-case); an identifier the person types goes in <code>/font-mono.",
      );
      if (ARGS.includes("--strict")) process.exit(1);
    }
  }
}

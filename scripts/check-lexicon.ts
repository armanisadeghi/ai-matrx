#!/usr/bin/env npx tsx
/**
 * check:lexicon — a RETIRED product name can never ship again.
 *
 * THE RULE: the platform has ONE lexicon (common-docs/systems/platform/
 * vocabulary/FEATURE.md). Each row names a term and a "Retired aliases"
 * column — words the product must not use for it (Applet is never "agent
 * app"). The Applet builder once shipped at /agent-apps/build with "Agent
 * Apps" labels because nothing checked.
 *
 * The alias list is PARSED FROM THE LEXICON AT RUN TIME — nothing is mirrored
 * here. Sibling checkout `../matrx-common-docs` or `../common-docs`; neither
 * present = UNMEASURED (exit 2), never a quiet pass.
 *
 * WHICH ALIASES COUNT: only multi-word, plain-letter aliases. Skipped, on
 * purpose, because they cannot be tested precisely:
 *   - single words ("App", "bot", "flow", "org"): far too generic;
 *   - aliases carrying a parenthetical qualifier ("client app (for a
 *     customer-built Applet)", "node (user copy)"): the qualifier is a
 *     meaning we cannot test by string, so they are skipped, not guessed;
 *   - code identifiers in backticks, and sentences/quotes.
 *   - a leading "the " is dropped ("the AI" is a single word after that).
 *
 * WHERE IT LOOKS (comments excluded):
 *   (a) every route segment directory name under app/** (agent-apps,
 *       [agentAppId], ...);
 *   (b) user-visible strings in .tsx: JSX text, title/label/placeholder/
 *       aria-label/description/tooltip/alt props or object keys given a
 *       string literal (this covers metadata titles).
 * Variants matched: "Agent App(s)", agent-app(s), agent_app(s), agentApp(s).
 *
 * THE BASELINE IS A SHRINK-ONLY RATCHET: scripts/lexicon-baseline.json holds
 * today's per-(file, alias) counts; a hit above its baseline is NEW and fails.
 * --write only ever lowers it. A deliberate exception goes in
 * scripts/lexicon-allowlist.json with a reason (never in the baseline).
 *
 *   pnpm check:lexicon
 *   pnpm check:lexicon --json
 *   pnpm check:lexicon --write       # ratchet down / seed
 *   pnpm check:lexicon --self-test
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_FILE = join(ROOT, "scripts", "lexicon-baseline.json");
const ALLOWLIST_FILE = join(ROOT, "scripts", "lexicon-allowlist.json");
const LEXICON_REL = "systems/platform/vocabulary/FEATURE.md";
const LEXICON_DIRS = ["../matrx-common-docs", "../common-docs"];
const SELF = "scripts/check-lexicon.ts";

export interface Alias {
  /** Lower-case words, e.g. ["agent","app"]. */
  words: string[];
  /** Canonical display: "agent app". */
  label: string;
  /** The lexicon term it is retired for. */
  term: string;
  re: RegExp;
}

function splitCells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Split on commas that sit outside parentheses and backticks. Pure. */
function splitAliases(cell: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let tick = false;
  let cur = "";
  for (const ch of cell) {
    if (ch === "`") tick = !tick;
    else if (!tick && ch === "(") depth++;
    else if (!tick && ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0 && !tick) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Parse every "Retired aliases" column into testable multi-word aliases. Pure. */
export function parseAliases(markdown: string): Alias[] {
  const found = new Map<string, Alias>();
  let aliasCol = -1;
  for (const line of markdown.split("\n")) {
    if (!line.trimStart().startsWith("|")) {
      aliasCol = -1;
      continue;
    }
    const cells = splitCells(line);
    const header = cells.findIndex((c) => /^retired aliases$/i.test(c));
    if (header >= 0) {
      aliasCol = header;
      continue;
    }
    if (aliasCol < 0 || /^[-:\s|]+$/.test(line) || cells.length <= aliasCol) continue;
    const term = cells[0].replace(/\*\*/g, "").trim();
    for (let raw of splitAliases(cells[aliasCol])) {
      if (raw.includes("(") || raw.includes("`") || raw.includes('"') || raw.includes(";")) continue;
      raw = raw.replace(/^the\s+/i, "").replace(/\*\*/g, "").trim();
      if (!/^[A-Za-z]+(?:[ -][A-Za-z]+)+$/.test(raw)) continue; // multi-word, plain letters
      const words = raw.toLowerCase().split(/[ -]+/);
      const label = words.join(" ");
      if (found.has(label)) continue;
      // "agent app" -> agent[ _-]?app(s)  (agentApps, agent-apps, Agent Apps)
      const form = (w: string): string => `(?:${w[0].toUpperCase()}${w.slice(1)}|${w}|${w.toUpperCase()})`;
      const re = new RegExp(`(?<![a-z])${words.map(form).join("[\\s_-]?")}s?(?![a-z])`, "g");
      found.set(label, { words, label, term, re });
    }
  }
  return [...found.values()];
}

function resolveLexicon(): string | null {
  for (const d of LEXICON_DIRS) {
    const p = resolve(ROOT, d, LEXICON_REL);
    if (existsSync(p)) return p;
  }
  return null;
}

function stripComments(source: string): string {
  // Replace with blanks of the same newlines so nothing else shifts.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const PROP_RE =
  /\b(?:title|label|placeholder|aria-label|description|tooltip|alt|heading|subtitle)\s*[=:]\s*(?:\{\s*)?(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
const JSX_TEXT_RE = />([^<>{}\n][^<>{}]*)(?=<)/g;

/** User-visible strings in one .tsx source. Pure. */
export function visibleStrings(source: string): string[] {
  const code = stripComments(source);
  const out: string[] = [];
  for (const m of code.matchAll(PROP_RE)) out.push(m[2]);
  for (const m of code.matchAll(JSX_TEXT_RE)) {
    const t = m[1].trim();
    if (/[A-Za-z]/.test(t)) out.push(t);
  }
  return out;
}

function countHits(text: string, aliases: Alias[], into: Record<string, number>, prefix: string): void {
  for (const a of aliases) {
    a.re.lastIndex = 0;
    const n = text.match(a.re)?.length ?? 0;
    if (n > 0) into[`${prefix}|${a.label}`] = (into[`${prefix}|${a.label}`] ?? 0) + n;
  }
}

/** Findings for one route-directory name and one tsx source. Pure. */
export function scanSegment(name: string, aliases: Alias[]): Record<string, number> {
  const out: Record<string, number> = {};
  countHits(name, aliases, out, "");
  return out;
}
export function scanSource(source: string, aliases: Alias[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of visibleStrings(source)) countHits(s, aliases, out, "");
  return out;
}

type Counts = Record<string, number>;
interface Allow {
  path: string;
  alias?: string;
  reason: string;
}

function readAllowlist(): Allow[] {
  if (!existsSync(ALLOWLIST_FILE)) return [];
  const list = JSON.parse(readFileSync(ALLOWLIST_FILE, "utf8")) as Allow[];
  for (const e of list) {
    if (!e.reason?.trim()) throw new Error(`lexicon-allowlist.json: entry for ${e.path} has no reason`);
  }
  return list;
}

function allowed(key: string, allow: Allow[]): boolean {
  const [file, alias] = key.split("|");
  return allow.some((e) => (file === e.path || file.startsWith(e.path.endsWith("/") ? e.path : `${e.path}/`)) && (!e.alias || e.alias === alias));
}

function scanTree(aliases: Alias[], allow: Allow[]): Counts {
  const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean);
  const counts: Counts = {};
  const dirs = new Set<string>();
  for (const file of listed) {
    if (file === SELF || file.includes("node_modules/") || !existsSync(join(ROOT, file))) continue;
    if (file.startsWith("app/")) {
      const parts = file.split("/").slice(0, -1);
      for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
    }
    if (!file.endsWith(".tsx")) continue;
    for (const [k, n] of Object.entries(scanSource(readFileSync(join(ROOT, file), "utf8"), aliases))) {
      counts[`${file}${k}`] = n;
    }
  }
  for (const dir of dirs) {
    const name = dir.slice(dir.lastIndexOf("/") + 1);
    for (const [k, n] of Object.entries(scanSegment(name, aliases))) counts[`${dir}/${k}`.replace("/|", "|")] = n;
  }
  return Object.fromEntries(Object.entries(counts).filter(([k]) => !allowed(k, allow)));
}

export interface Verdict {
  newSites: { key: string; count: number; baseline: number }[];
  cleared: string[];
}
/** New = above baseline (absent = 0). Pure. */
export function judge(current: Counts, baseline: Counts): Verdict {
  const newSites = Object.entries(current)
    .filter(([k, c]) => c > (baseline[k] ?? 0))
    .map(([key, count]) => ({ key, count, baseline: baseline[key] ?? 0 }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const cleared = Object.keys(baseline)
    .filter((k) => (current[k] ?? 0) < baseline[k])
    .sort();
  return { newSites, cleared };
}

function readBaseline(): Counts | null {
  return existsSync(BASELINE_FILE) ? (JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Counts) : null;
}
function writeBaseline(c: Counts): void {
  const sorted = Object.fromEntries(Object.entries(c).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}

const MINI_LEXICON = `
| Term | Meaning | Retired aliases |
|---|---|---|
| **Applet** | A thing. | App, agent app, client app (for a customer-built Applet); "the app" for the platform |
| **Orchestra** | Ensemble. | agent team, swarm, multi-agent system |
| **Agent** | Worker. | bot, the AI, \`code_id\` |

Some prose.

| Other | x |
|---|---|
| **Nope** | agent app |
`;

function selfTest(): number {
  let failed = 0;
  const check = (name: string, ok: boolean, detail = ""): void => {
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` ${detail}`}`);
  };
  const aliases = parseAliases(MINI_LEXICON);
  const labels = aliases.map((a) => a.label).sort();
  check(
    "parser keeps multi-word plain aliases only",
    labels.join() === "agent app,agent team,multi-agent system".replace("multi-agent system", "multi agent system").split(",").sort().join(),
    labels.join(),
  );
  check("parser skips qualifier/single-word/backtick/other tables", !labels.includes("client app") && !labels.includes("bot"));
  check("RED: route segment agent-apps", Object.keys(scanSegment("agent-apps", aliases)).length === 1);
  check("RED: route segment [agentAppId]", Object.keys(scanSegment("[agentAppId]", aliases)).length === 1);
  check("RED: JSX text", Object.keys(scanSource(`<h1>My Agent Apps</h1>`, aliases)).length === 1);
  check("RED: title prop", Object.keys(scanSource(`<X title="New agent app" />`, aliases)).length === 1);
  check("RED: metadata title", Object.keys(scanSource(`export const metadata = { title: 'Agent-Apps builder' };`, aliases)).length === 1);
  check("RED: placeholder in braces", Object.keys(scanSource("<I placeholder={'name your agentApp'} />", aliases)).length === 1);
  check("GREEN: Applet copy", Object.keys(scanSource(`<h1>My Applets</h1><X title="New Applet" />`, aliases)).length === 0);
  check("GREEN: comment", Object.keys(scanSource(`// agent app\n/* <p>agent app</p> */`, aliases)).length === 0);
  check("GREEN: identifier not user-visible", Object.keys(scanSource(`const agentApp = 1; fn("agent-app-id");`, aliases)).length === 0);
  check("GREEN: clean segment", Object.keys(scanSegment("applets", aliases)).length === 0);
  const r = judge({ "a|x": 2, "b|x": 1, "c|x": 1 }, { "a|x": 2, "b|x": 2 });
  check("ratchet: new key fails, lower count cleared", r.newSites.length === 1 && r.newSites[0].key === "c|x" && r.cleared.join() === "b|x");
  check("ratchet: count above baseline fails", judge({ "a|x": 3 }, { "a|x": 2 }).newSites.length === 1);
  check("allow-list matches a dir prefix and alias", allowed("app/x/y.tsx|agent app", [{ path: "app/x", alias: "agent app", reason: "t" }]) && !allowed("app/x/y.tsx|agent team", [{ path: "app/x", alias: "agent app", reason: "t" }]));
  console.log(failed === 0 ? "self-test: all rules fire" : `self-test: ${failed} failed`);
  return failed === 0 ? 0 : 1;
}

function main(): number {
  const args = new Set(process.argv.slice(2));
  if (args.has("--self-test")) return selfTest();

  const lexicon = resolveLexicon();
  if (!lexicon) {
    console.log(
      `UNMEASURED: lexicon not found. Looked for ${LEXICON_DIRS.map((d) => `${d}/${LEXICON_REL}`).join(" and ")}. Check out common-docs beside this repo.`,
    );
    return 2;
  }
  const aliases = parseAliases(readFileSync(lexicon, "utf8"));
  if (aliases.length === 0) {
    console.log(`UNMEASURED: no "Retired aliases" column parsed from ${lexicon} — the table format changed.`);
    return 2;
  }
  const current = scanTree(aliases, readAllowlist());
  const baseline = readBaseline();
  if (args.has("--write")) {
    if (!baseline) {
      writeBaseline(current);
      console.log(`Seeded baseline with ${Object.keys(current).length} entries (${Object.values(current).reduce((a, b) => a + b, 0)} hits).`);
      return 0;
    }
    const next: Counts = {};
    for (const [k, c] of Object.entries(baseline)) {
      const now = Math.min(c, current[k] ?? 0);
      if (now > 0) next[k] = now;
    }
    writeBaseline(next);
    console.log(`Ratcheted baseline to ${Object.keys(next).length} entries.`);
    return 0;
  }
  const verdict = judge(current, baseline ?? {});
  if (args.has("--json")) {
    console.log(JSON.stringify({ aliases: aliases.map((a) => a.label), current, ...verdict }, null, 2));
    return verdict.newSites.length > 0 ? 1 : 0;
  }
  if (verdict.newSites.length > 0) {
    console.log("FAIL: a retired product name (platform lexicon, 'Retired aliases') is used. Use the lexicon's term instead:");
    for (const s of verdict.newSites) {
      const alias = s.key.split("|")[1];
      const a = aliases.find((x) => x.label === alias);
      console.log(`  NEW  ${s.key.split("|")[0]}  "${alias}" -> ${a?.term ?? "?"}  (${s.count}, baseline ${s.baseline})`);
    }
    return 1;
  }
  const total = Object.values(current).reduce((a, b) => a + b, 0);
  console.log(
    `OK: no new retired name. ${aliases.length} aliases from ${lexicon}; baseline ${Object.keys(current).length} entries / ${total} hits still to clear.` +
      (verdict.cleared.length ? ` ${verdict.cleared.length} cleared — run --write to ratchet down.` : ""),
  );
  return 0;
}

exitAfterDrain(main());

#!/usr/bin/env npx tsx
/**
 * check:flattened-shapes — find AI jobs whose product is a registered SHAPE
 * being run headless-for-TEXT (THE FLATTENING DISEASE).
 *
 * 🚨 THE CLASS (Arman, 2026-09-08): coding agents keep taking a job whose
 * product is a registered `__kind` (a structured shape with its own component,
 * parts and actions) and running it with `expect: "text"` — or `run<string>()`
 * plus a local JSON hunt — then rendering the string by hand. The kind
 * component never renders, the parts are lost, the back-and-forth the job was
 * designed for is impossible, and the system said nothing.
 *
 * The runtime scream (`structured-output-flattening.ts`) fires only when the
 * run is actually launched. This guard finds the call site BEFORE anyone
 * clicks: it scans `features`, `components`, `lib`, `app` for headless runs
 * declared as text, resolves the `mandateKey` each one names (a literal, a
 * `const` in the file, an imported `const`, or `OBJ.prop` on an exported
 * object), reads each key's declared `output_kind` from the LIVE mandate
 * catalogue (`mandate.definition`), and reports every text run on a job that
 * declares a shape — file:line, the kind, and THE remedy sentence the runtime
 * uses (same words, one source).
 *
 * WHAT COUNTS AS A TEXT RUN:
 *   - an object literal carrying `expect: "text"`
 *   - a `run<string>(…)` / `runMandate<string>(…)` / `runHeadlessAgentJson<string>(…)`
 *     call (a string type argument IS a text run, whatever `expect` says)
 *
 * WHAT COUNTS AS A SHAPE: `output_kind` that is neither NULL nor a prose kind
 * (`PROSE_OUTPUT_KINDS`: text, markdown). `"json"` IS a shape — a promise of
 * structure — exactly as the runtime judges it.
 *
 * WHAT IT DELIBERATELY DOES NOT FLAG:
 *   - runs by `agentId` (no declared kind to read; the runtime's HARVESTED
 *     signal covers those when they fire)
 *   - test files and `node_modules`
 *
 * 🚨 CREDENTIAL GATE (same rule as `check:kind-types`): the catalogue is the
 * DATABASE. When the script cannot reach it (no `NEXT_PUBLIC_SUPABASE_URL` /
 * `SUPABASE_SECRET_KEY`, or the read fails) it FAILS AS UNMEASURED — exit 2 —
 * never a warning that reads as a pass.
 *
 * Advisory: exit 1 on findings; not wired into release gates.
 *
 *   pnpm check:flattened-shapes
 *   pnpm check:flattened-shapes --json
 *   pnpm check:flattened-shapes --paths <file …>   # scan specific files (fixture proof)
 *   pnpm check:flattened-shapes --paths <fixture> --as features/x/Y.tsx
 *       # resolve the fixture's relative imports as if it lived at that repo path
 *       # (how the failing-then-passing proof runs a pre-fix file from git history)
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  FLATTENING_REMEDY,
  isStructuredOutputKind,
} from "../features/agents/redux/execution-system/thunks/structured-output-flattening";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["features", "components", "lib", "app"];
const SKIP_DIR =
  /(^|\/)(node_modules|\.next[^/]*|dist|build|coverage|__tests__|\.git)(\/|$)/;
const SKIP_FILE = /\.(test|spec)\.tsx?$/;
/**
 * The primitive's own home: `runHeadlessAgentJson` and the scream module name
 * `expect: "text"` in their judges and messages, and that is not a run.
 */
const SKIP_PRIMITIVE = /(^|\/)features\/agents\/redux\/execution-system\/thunks\//;
const SOURCE_FILE = /\.tsx?$/;

// ── scanning ────────────────────────────────────────────────────────────────

interface TextRunSite {
  file: string;
  /** Repo path the file's relative imports resolve against (differs only under --as). */
  resolveAs: string;
  line: number;
  /** How the site declared text: `expect:"text"` or `run<string>`. */
  how: string;
  /** The object-literal text of the run's options, for key resolution. */
  optionsText: string;
  /** The file's full source, for identifier resolution. */
  source: string;
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (SKIP_DIR.test(full)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SOURCE_FILE.test(entry) && !SKIP_FILE.test(entry) && !SKIP_PRIMITIVE.test(full))
      out.push(full);
  }
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/** From an index INSIDE an object literal, return that literal's full text. */
function enclosingObjectLiteral(source: string, index: number): string | null {
  // Walk backward to the `{` that opens the innermost object containing index.
  let depth = 0;
  let open = -1;
  for (let i = index; i >= 0; i -= 1) {
    const ch = source[i];
    if (ch === "}") depth += 1;
    else if (ch === "{") {
      if (depth === 0) {
        open = i;
        break;
      }
      depth -= 1;
    }
  }
  if (open < 0) return null;
  return balancedFrom(source, open);
}

/** From an index AT `{`, return the balanced `{…}` text. */
function balancedFrom(source: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

const EXPECT_TEXT = /expect\s*:\s*["']text["']/g;
const RUN_STRING = /\b(run|runMandate|runAgent|runHeadlessAgentJson|adoptHeadlessAgentJson)\s*<\s*string\s*>\s*\(/g;

function findTextRunSites(file: string, resolveAs: string): TextRunSite[] {
  const source = readFileSync(file, "utf8");
  const sites: TextRunSite[] = [];
  // ONE site per run-options object: `run<string>({ …, expect: "text" })`
  // is one call, not two findings.
  const seen = new Set<string>();
  const push = (index: number, how: string, optionsText: string | null) => {
    const line = lineOf(source, index);
    const key = optionsText ? `${source.indexOf(optionsText)}` : `line:${line}`;
    if (seen.has(key)) return;
    seen.add(key);
    sites.push({ file, resolveAs, line, how, optionsText: optionsText ?? "", source });
  };

  for (const m of source.matchAll(EXPECT_TEXT)) {
    // Skip the primitive's own docs/types (`expect?: "json" | "text"`) and
    // comparisons (`=== "text"`): a real site is `expect: "text"` inside an
    // object literal, not a type annotation or a string in prose.
    const before = source.slice(Math.max(0, m.index - 40), m.index);
    if (/\*|\/\/|`/.test(before.split("\n").pop() ?? "")) continue;
    push(m.index, 'expect: "text"', enclosingObjectLiteral(source, m.index));
  }
  for (const m of source.matchAll(RUN_STRING)) {
    const before = source.slice(Math.max(0, m.index - 40), m.index);
    if (/\*|\/\//.test(before.split("\n").pop() ?? "")) continue;
    const parenAt = m.index + m[0].length - 1;
    const braceAt = source.indexOf("{", parenAt);
    const between = braceAt > 0 ? source.slice(parenAt + 1, braceAt) : "";
    const optionsText =
      braceAt > 0 && /^\s*$/.test(between) ? balancedFrom(source, braceAt) : null;
    push(m.index, `${m[1]}<string>()`, optionsText);
  }
  // `run<string>` sites first in the report order is irrelevant; sort by line.
  return sites.sort((a, b) => a.line - b.line);
}

// ── mandateKey resolution ───────────────────────────────────────────────────

type Resolved =
  | { ok: true; key: string; via: string }
  | { ok: false; reason: string };

const importCache = new Map<string, string | null>();

function resolveImportPath(fromFile: string, spec: string): string | null {
  const cacheKey = `${fromFile}::${spec}`;
  if (importCache.has(cacheKey)) return importCache.get(cacheKey) ?? null;
  let base: string | null = null;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  let found: string | null = null;
  if (base) {
    for (const cand of [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      join(base, "index.ts"),
      join(base, "index.tsx"),
    ]) {
      if (existsSync(cand) && statSync(cand).isFile()) {
        found = cand;
        break;
      }
    }
  }
  importCache.set(cacheKey, found);
  return found;
}

/** `const NAME = "literal"` (optionally exported) in `source`. */
function findConstLiteral(source: string, name: string): string | null {
  const re = new RegExp(
    `(?:export\\s+)?const\\s+${name}\\s*(?::[^=]+)?=\\s*["'\`]([a-z0-9_.-]+)["'\`]`,
    "m",
  );
  const m = source.match(re);
  return m ? m[1] : null;
}

/** `const NAME = OTHER` / `const NAME = OBJ.prop` (optionally exported) in `source`. */
function findConstAlias(source: string, name: string): string | null {
  const re = new RegExp(
    `(?:export\\s+)?const\\s+${name}\\s*(?::[^=]+)?=\\s*([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)?)\\s*(?:;|$|\\n)`,
    "m",
  );
  const m = source.match(re);
  return m ? m[1] : null;
}

/** `const OBJ = { prop: "literal", … }` (optionally exported) in `source`. */
function findObjectProp(source: string, obj: string, prop: string): string | null {
  const objRe = new RegExp(`(?:export\\s+)?const\\s+${obj}\\s*(?::[^=]+)?=\\s*\\{`, "m");
  const m = objRe.exec(source);
  if (!m) return null;
  const body = balancedFrom(source, m.index + m[0].length - 1);
  if (!body) return null;
  const propRe = new RegExp(`(?:^|[\\s{,])${prop}\\s*:\\s*["'\`]([a-z0-9_.-]+)["'\`]`, "m");
  const pm = body.match(propRe);
  return pm ? pm[1] : null;
}

/** Where `name` was imported from in `source`, if anywhere. */
function importSpecFor(source: string, name: string): string | null {
  const re = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  for (const m of source.matchAll(re)) {
    const names = m[1]
      .split(",")
      .map((n) => n.trim().split(/\s+as\s+/).pop()?.trim())
      .filter(Boolean);
    if (names.includes(name)) return m[2];
  }
  return null;
}

function resolveIdentifier(file: string, source: string, expr: string, depth = 0): Resolved {
  if (depth > 3) return { ok: false, reason: `"${expr}" — resolution too deep` };
  const dot = expr.indexOf(".");
  if (dot > 0) {
    const obj = expr.slice(0, dot);
    const prop = expr.slice(dot + 1);
    const local = findObjectProp(source, obj, prop);
    if (local) return { ok: true, key: local, via: `${expr} (local object)` };
    const spec = importSpecFor(source, obj);
    const target = spec ? resolveImportPath(file, spec) : null;
    if (target) {
      const v = findObjectProp(readFileSync(target, "utf8"), obj, prop);
      if (v) return { ok: true, key: v, via: `${expr} (${relative(ROOT, target)})` };
    }
    return { ok: false, reason: `"${expr}" — could not resolve object property` };
  }
  const local = findConstLiteral(source, expr);
  if (local) return { ok: true, key: local, via: `${expr} (local const)` };
  // `const MANDATE_KEY = SOME_OBJECT.prop` / `= OTHER_CONST` — follow the chain.
  const alias = findConstAlias(source, expr);
  if (alias) return resolveIdentifier(file, source, alias, depth + 1);
  const spec = importSpecFor(source, expr);
  const target = spec ? resolveImportPath(file, spec) : null;
  if (target) {
    const v = findConstLiteral(readFileSync(target, "utf8"), expr);
    if (v) return { ok: true, key: v, via: `${expr} (${relative(ROOT, target)})` };
  }
  return { ok: false, reason: `"${expr}" — not a literal, a local const, or an imported const` };
}

const MANDATE_KEY_PROP =
  /(?:^|[\s{,])mandateKey\s*:\s*(?:["'`]([a-z0-9_.-]+)["'`]|([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?))/;
const MANDATE_KEY_SHORTHAND = /(?:^|[\s{,])mandateKey\s*[,}]/;

function resolveSiteMandateKey(site: TextRunSite): Resolved | null {
  const text = site.optionsText;
  if (!text) return { ok: false, reason: "run options are not an inline object literal" };
  const m = text.match(MANDATE_KEY_PROP);
  if (m) {
    if (m[1]) return { ok: true, key: m[1], via: "literal" };
    return resolveIdentifier(site.resolveAs, site.source, m[2]);
  }
  if (MANDATE_KEY_SHORTHAND.test(text)) {
    return resolveIdentifier(site.resolveAs, site.source, "mandateKey");
  }
  if (/(?:^|[\s{,])agentId\s*[:,}]/.test(text)) return null; // agentId run — not measurable here
  return { ok: false, reason: "no mandateKey (or agentId) in the run options" };
}

// ── catalogue read ──────────────────────────────────────────────────────────

function unmeasured(reason: string): never {
  console.error(
    `\n  ✗ UNMEASURED — check:flattened-shapes could not read the mandate catalogue.\n    ${reason}\n    This is NOT a pass. Fix the credential/read and rerun.\n`,
  );
  process.exit(2);
}

async function fetchCatalogue(): Promise<Map<string, string | null>> {
  dotenv.config({ path: resolve(ROOT, ".env.local") });
  dotenv.config({ path: resolve(ROOT, ".env") });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    unmeasured("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (.env.local).");
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // readAllRows semantics, inlined: PostgREST caps a bare select at 1000 rows
  // and a missing key would read as "not in the catalogue".
  const out = new Map<string, string | null>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .schema("mandate")
      .from("definition")
      .select("mandate_key, output_kind")
      .is("deleted_at", null)
      .order("mandate_key")
      .range(from, from + 999);
    if (error) unmeasured(`mandate.definition read failed: ${error.message}`);
    for (const row of data ?? []) {
      out.set(String(row.mandate_key), row.output_kind == null ? null : String(row.output_kind));
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  if (out.size === 0) unmeasured("the live catalogue returned zero mandates.");
  return out;
}

// ── main ────────────────────────────────────────────────────────────────────

interface Finding {
  file: string;
  line: number;
  how: string;
  mandateKey: string;
  outputKind: string;
  via: string;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const pathsAt = argv.indexOf("--paths");
  const asAt = argv.indexOf("--as");
  const asPath = asAt >= 0 ? resolve(ROOT, argv[asAt + 1] ?? "") : null;
  const files: string[] = [];
  if (pathsAt >= 0) {
    for (const p of argv.slice(pathsAt + 1)) {
      if (p.startsWith("--")) break;
      files.push(resolve(p));
    }
  } else {
    for (const d of SCAN_DIRS) {
      const dir = join(ROOT, d);
      if (existsSync(dir)) walk(dir, files);
    }
  }

  const sites = files.flatMap((f) =>
    findTextRunSites(f, asPath && files.length === 1 ? asPath : f),
  );
  const catalogue = await fetchCatalogue();

  const findings: Finding[] = [];
  const prose: string[] = [];
  const unknown: string[] = [];
  const unresolved: string[] = [];
  const byAgentId: string[] = [];

  for (const site of sites) {
    const rel = `${relative(ROOT, site.file)}:${site.line}`;
    const resolved = resolveSiteMandateKey(site);
    if (resolved === null) {
      byAgentId.push(`${rel}  ${site.how} by agentId`);
      continue;
    }
    if (!resolved.ok) {
      unresolved.push(`${rel}  ${site.how}  ${resolved.reason}`);
      continue;
    }
    if (!catalogue.has(resolved.key)) {
      unknown.push(`${rel}  ${site.how}  mandateKey "${resolved.key}" is NOT in the live catalogue`);
      continue;
    }
    const outputKind = catalogue.get(resolved.key) ?? null;
    if (isStructuredOutputKind(outputKind)) {
      findings.push({
        file: relative(ROOT, site.file),
        line: site.line,
        how: site.how,
        mandateKey: resolved.key,
        outputKind,
        via: resolved.via,
      });
    } else {
      prose.push(`${rel}  ${site.how}  "${resolved.key}" → output_kind ${outputKind === null ? "NULL" : `"${outputKind}"`} (prose — correct)`);
    }
  }

  if (json) {
    console.log(JSON.stringify({ findings, prose, unknown, unresolved, byAgentId }, null, 2));
    process.exit(findings.length > 0 ? 1 : 0);
  }

  console.log(
    `\ncheck:flattened-shapes — ${files.length} files, ${sites.length} text-run sites, ${catalogue.size} live mandates\n`,
  );
  if (prose.length) {
    console.log("  Prose runs (declared text/NULL — a text run is correct):");
    for (const p of prose) console.log(`    ✓ ${p}`);
    console.log("");
  }
  if (byAgentId.length) {
    console.log("  Runs by agentId (no declared kind to read; the runtime HARVESTED scream covers these):");
    for (const p of byAgentId) console.log(`    · ${p}`);
    console.log("");
  }
  if (unknown.length) {
    console.log("  ⚠ mandateKey NOT in the live catalogue (the run cannot resolve — a different defect, fix it too):");
    for (const p of unknown) console.log(`    ⚠ ${p}`);
    console.log("");
  }
  if (unresolved.length) {
    console.log("  ⚠ Could not resolve the mandateKey statically — judge these by hand:");
    for (const p of unresolved) console.log(`    ⚠ ${p}`);
    console.log("");
  }
  if (findings.length === 0) {
    console.log("  ✓ No shaped job is being run headless-for-text.\n");
    process.exit(0);
  }
  console.log(`  ✗ ${findings.length} FLATTENED SHAPE${findings.length === 1 ? "" : "S"}:\n`);
  for (const f of findings) {
    console.log(
      `    ✗ ${f.file}:${f.line}  ${f.how} on mandate "${f.mandateKey}" (${f.via})\n` +
        `      declares output_kind "${f.outputKind}" — a registered shape with its own component, being flattened into a string.\n` +
        `      ${FLATTENING_REMEDY}\n`,
    );
  }
  process.exit(1);
}

main().catch((error: unknown) => {
  unmeasured(error instanceof Error ? error.message : String(error));
});

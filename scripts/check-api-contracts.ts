#!/usr/bin/env tsx
/**
 * check-api-contracts — the ratchet that makes wrong-shape API calls impossible
 * to ADD, while the existing backlog drains.
 *
 * Every call to the Python backend must go through the contract-bound typed
 * client (`@/lib/api/typed-client`), whose request body + response are DERIVED
 * from the generated OpenAPI types. The raw helpers in `@/lib/python-client`
 * (`postJson<T>` / `postMultipart<T>` / …) take a plain string path and an
 * *asserted* response `T` — that gap shipped a production 400 (Image Studio
 * Convert: FE sent `key`, backend wanted `preset_id`, TS was green).
 *
 * This guard scans for VALUE imports of `@/lib/python-client` outside the
 * sanctioned layer and compares them to a frozen baseline
 * (scripts/api-contracts-baseline.json). The baseline can only SHRINK:
 *   • a NEW offender (not in the baseline) is a hard failure — route it through
 *     the typed client instead.
 *   • a baseline file that no longer imports the raw client has been converted —
 *     run `pnpm check:api-contracts:accept` to ratchet the baseline down.
 *
 *   pnpm check:api-contracts          # loud, non-blocking (exit 0) — pre-commit
 *   pnpm check:api-contracts:strict   # exit 1 on any new offender — CI / release
 *   pnpm check:api-contracts:accept   # rewrite baseline to current (ratchet down)
 *
 * `import type { … } from "@/lib/python-client"` (type-only) is always allowed —
 * it pulls no runtime call path. See lib/api/FEATURE.md.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const BASELINE = join(ROOT, "scripts", "api-contracts-baseline.json");
const SCAN_DIRS = ["features", "app", "lib", "components", "hooks"];

// Files/dirs allowed to import the raw client: the sanctioned client layer.
const ALLOWED = [
  "lib/api/", // the typed client itself
  "lib/python-client.ts", // the raw client module
  "hooks/useBackendApi.ts", // legacy adapter; consumers are gated by check-backend-boundaries
];

// A value-import of `@/lib/python-client`. We only care about REQUEST VERBS
// (getJson/postJson/… — they take a path + body/response shape that can drift).
// Pure utilities carry no wire shape, so importing ONLY them is not an offense.
// Fail-safe: anything NOT in this allowlist (incl. a newly-added verb) flags.
const UTILITY_ONLY = new Set([
  "buildHeaders",
  "newRequestId",
  "resolveBaseUrl",
  // Path-aware / files URL resolvers — pure string construction, no wire shape.
  "resolveBaseUrlForPath",
  "resolveFilesBaseUrl",
]);
// `[^;]*?` (not `[\s\S]`) so the clause can't cross the `;` into a PRIOR
// import statement and capture its symbols. Multi-line imports have no
// interior `;`, so this still spans a `{ … }` block correctly.
const RAW_IMPORT_CLAUSE =
  /import\s+(?!type\b)([^;]*?)\s+from\s+["']@\/lib\/python-client["']/g;

function importsRawVerb(src: string): boolean {
  RAW_IMPORT_CLAUSE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RAW_IMPORT_CLAUSE.exec(src))) {
    const clause = m[1];
    // Namespace import (`* as pc`) could reach any verb — flag conservatively.
    if (/\*\s+as\s+/.test(clause)) return true;
    const braces = clause.match(/\{([\s\S]*?)\}/);
    // A default / bare value import (python-client has no default export) —
    // treat as a hit rather than silently pass.
    if (!braces) return clause.trim().length > 0;
    const symbols = braces[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !s.startsWith("type ")) // type-only members carry no runtime
      .map((s) => s.split(/\s+as\s+/)[0].trim()); // unalias
    if (symbols.some((s) => !UTILITY_ONLY.has(s))) return true;
  }
  return false;
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".next")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
}

function currentOffenders(): string[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(join(ROOT, d), files);
  const hits: string[] = [];
  for (const f of files) {
    const rel = relative(ROOT, f).replace(/\\/g, "/");
    if (ALLOWED.some((a) => rel.startsWith(a) || rel === a.replace(/\/$/, "")))
      continue;
    const src = readFileSync(f, "utf8");
    if (importsRawVerb(src)) hits.push(rel);
  }
  return hits.sort();
}

function loadBaseline(): string[] {
  try {
    return JSON.parse(readFileSync(BASELINE, "utf8")) as string[];
  } catch {
    return [];
  }
}

const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function run(): number {
  const strict = process.argv.includes("--strict");
  const accept = process.argv.includes("--accept");
  const current = currentOffenders();

  if (accept) {
    writeFileSync(BASELINE, JSON.stringify(current, null, 2) + "\n");
    console.log(
      `${GREEN}check:api-contracts — baseline ratcheted to ${current.length} file(s).${RESET}`,
    );
    return 0;
  }

  const baseline = new Set(loadBaseline());
  const added = current.filter((f) => !baseline.has(f));
  const converted = [...baseline].filter((f) => !current.includes(f)).sort();

  if (added.length === 0 && converted.length === 0) {
    console.log(
      `${GREEN}check:api-contracts — OK. ${current.length} baseline raw-client callsite(s) pending migration; none added.${RESET}`,
    );
    return 0;
  }

  if (converted.length > 0) {
    console.log(
      `${GREEN}check:api-contracts — ${converted.length} file(s) converted off the raw client:${RESET}`,
    );
    for (const f of converted) console.log(`  ${GREEN}✓ ${f}${RESET}`);
    console.log(
      `${CYAN}  Next: run \`pnpm check:api-contracts:accept\` to record this reduction in the baseline.${RESET}`,
    );
  }

  if (added.length > 0) {
    console.log(`\n${RED}${BOLD}╔══ check:api-contracts FAILED ══╗${RESET}`);
    console.log(
      `${RED}${added.length} NEW file(s) import the raw @/lib/python-client instead of the${RESET}`,
    );
    console.log(
      `${RED}contract-bound typed client. Route these through @/lib/api/typed-client${RESET}`,
    );
    console.log(
      `${RED}(apiGet/apiPost/apiPatch/apiPut/apiDelete/apiMultipart + buildPath) so the${RESET}`,
    );
    console.log(
      `${RED}request body + response are derived from the OpenAPI contract, not asserted:${RESET}`,
    );
    for (const f of added) console.log(`  ${RED}✗ ${f}${RESET}`);
    console.log(`${RED}${BOLD}╚════════════════════════════════╝${RESET}`);
    return strict ? 1 : 0;
  }

  return 0;
}

process.exit(run());

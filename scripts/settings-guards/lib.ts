/**
 * settings-guards/lib — the shared floor under the five `check:settings-*`
 * guards (Unified Settings Platform, LANE C).
 *
 * These guards exist to kill ONE defect class, documented with live cases in
 * common-docs/projects/unified-settings-platform/REGISTER.md § "THE DEFECT
 * CLASS THIS CAMPAIGN EXISTS TO KILL": a settings screen that accepts a value
 * the system does not honor. An org auto-RAG daily budget that is displayed,
 * editable, and not enforced. Photo-editing preferences with a full DB-synced
 * tab and zero consumers. `force_ocr` wired through an API contract that no UI
 * call site ever passes.
 *
 * A guard here is never decor: every one prints a `[LOUD]` banner the release
 * runner's badge regex already knows, and every one exits non-zero when it
 * cannot actually measure what it claims to measure.
 *
 * EXIT CODES — the same three everywhere in this family:
 *   0  clean
 *   1  findings (new violations beyond the allowlist/baseline)
 *   2  UNMEASURED — the guard could not reach what it grades against
 *      (no DB credentials, no aidream checkout, no UI surface yet). NEVER a
 *      quiet pass: "I did not look" and "I looked and it was fine" are
 *      different answers and this family refuses to conflate them.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const AIDREAM_DIR = process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream");
/** The sandbox orchestrator — the ONLY reader of `infrastructure.sandbox` (migration 0636). */
export const SANDBOX_DIR = process.env.MATRX_SANDBOX_DIR ?? resolve(ROOT, "..", "matrx-sandbox");

export const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[97m",
};

/** Exit 2 with the UNMEASURED banner. Never a quiet pass. */
export function unmeasured(guard: string, why: string, remedy: string): never {
  console.log(`\n${C.red}${C.bold}[LOUD] ${guard}: UNMEASURED${C.reset}`);
  console.log(`  ${C.red}${why}${C.reset}`);
  console.log(`  ${C.yellow}Fix:${C.reset} ${remedy}`);
  console.log(
    `  ${C.dim}This guard refuses to print green over an unread source — "I did not look"${C.reset}`,
  );
  console.log(`  ${C.dim}and "I looked and it was fine" are different answers.${C.reset}\n`);
  process.exit(2);
}

// ── the live registry ───────────────────────────────────────────────────────

export interface KnobRow {
  feature: string;
  key: string;
  value_type: string | null;
  overridable_by: string[] | null;
  ui: unknown;
  label: string | null;
  /** The registry node the key is filed under (migration 0631); null = unfiled. */
  taxonomy_node_id: string | null;
}

const REGISTRY_COLUMNS = "feature, key, value_type, overridable_by, ui, label, taxonomy_node_id";

function loadEnv(): void {
  dotenv.config({ path: resolve(ROOT, ".env.local"), quiet: true });
  dotenv.config({ path: resolve(ROOT, ".env"), quiet: true });
}

/**
 * Run one read-only SQL statement through `public.execute_admin_query` with the
 * secret key — the SAME door `check:db-guards` and `check:soft-delete-cascade`
 * use to read the catalog. Returns null (with the reason) when it cannot run;
 * the CALLER decides whether that is UNMEASURED. It is the only way a guard here
 * can see `pg_proc` sources, which matter because a knob read from inside a
 * database function (`hr._clock_knob`, `hr._kiosk_device_config`) is a real
 * consumer no source grep can see.
 */
export async function adminQuery<T = Record<string, unknown>>(
  sql: string,
): Promise<{ rows: T[] } | { rows: null; why: string }> {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return { rows: null, why: "NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY not set" };
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("execute_admin_query", { query: sql });
  if (error) return { rows: null, why: `execute_admin_query: ${error.message}` };
  const payload = data as { result?: T[]; error?: string | null } | null;
  if (!payload || payload.error) {
    return { rows: null, why: `execute_admin_query: ${payload?.error ?? "no payload"}` };
  }
  const rows = payload.result;
  if (!Array.isArray(rows)) return { rows: null, why: "execute_admin_query returned no result array" };
  return { rows };
}

/** `feature key` — the address `lib/knobs/featureKnobs.ts` itself uses. */
export function addr(feature: string, key: string): string {
  return `${feature} ${key}`;
}

/**
 * Read EVERY `platform.feature_knob` row from the live database. CREDENTIAL
 * GATED: no credentials, or a failed read, is an UNMEASURED exit — never a
 * pass. Precedent: `scripts/shape/generate-kind-types.ts`, which refuses to
 * emit anything without the live registry.
 */
export async function loadRegistry(guard: string): Promise<KnobRow[]> {
  loadEnv();
  // Door 1 — the secret key through execute_admin_query (the only credential
  // CI holds, and the one that also reaches the catalog).
  const admin = await adminQuery<KnobRow>(
    `select ${REGISTRY_COLUMNS} from platform.feature_knob order by feature, key`,
  );
  if (admin.rows) {
    if (admin.rows.length === 0) {
      unmeasured(
        guard,
        "platform.feature_knob returned ZERO rows — a readable-but-empty registry is indistinguishable from a broken read.",
        "confirm the role can see platform.feature_knob, then re-run",
      );
    }
    return admin.rows;
  }
  // Door 2 — PostgREST with the publishable key. `platform.feature_knob` is
  // read-all under RLS for anon/authenticated (features/admin/limits/service.ts
  // reads it straight from the browser).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !pub) {
    unmeasured(
      guard,
      `No usable Supabase credentials — the registry is the live DB, and it was not read (${admin.why}).`,
      "set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) in .env.local / .env",
    );
  }
  const supabase = createClient(url, pub, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // (feature, key) is the PK, so the paged order is stable. Paging matters: a
  // bare select silently caps at 1000 and a capped registry would invent
  // orphans and unregistered keys out of thin air.
  const rows: KnobRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .schema("platform")
      .from("feature_knob")
      .select(REGISTRY_COLUMNS)
      .order("feature")
      .order("key")
      .range(from, from + 999);
    if (error) {
      unmeasured(
        guard,
        `platform.feature_knob read failed: ${error.message} (admin door: ${admin.why})`,
        "check the credentials and that the role may read the platform schema",
      );
    }
    const chunk = (data ?? []) as unknown as KnobRow[];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  if (rows.length === 0) {
    unmeasured(
      guard,
      "platform.feature_knob returned ZERO rows — a readable-but-empty registry is indistinguishable from a broken read.",
      "confirm the role can see platform.feature_knob (RLS), then re-run",
    );
  }
  return rows;
}

// ── source scanning ─────────────────────────────────────────────────────────

export const FRONTEND_SCAN_DIRS = [
  "app",
  "components",
  "features",
  "hooks",
  "lib",
  "utils",
  "actions",
  "config",
  "constants",
  "providers",
];

export const SKIP_DIR_RE =
  /(^|\/)(node_modules|\.next[^/]*|dist|build|coverage|__tests__|__mocks__|__pycache__|\.git|\.venv|venv|site-packages)(\/|$)/;
export const SKIP_FILE_RE = /(\.test\.tsx?$|\.spec\.tsx?$|\.d\.ts$|_test\.py$|^test_.*\.py$)/;

export interface SourceFile {
  /** Absolute path. */
  abs: string;
  /** `matrx-frontend/...`, `aidream/...` or `matrx-sandbox/...` — stable across checkouts. */
  rel: string;
  text: string;
  /**
   * The feature a ONE-argument knob call in this file reads from — the
   * matrx-sandbox shape (`knob_int("warm_pool_size")`, feature defaulted from
   * `orchestrator/knobs.py`'s `FEATURE`). Absent for the two-argument families.
   */
  implicitFeature?: string;
}

function walk(dir: string, base: string, prefix: string, out: string[], exts: RegExp): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const rel = `${prefix}/${relative(base, full)}`;
    if (SKIP_DIR_RE.test(rel)) continue;
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) walk(full, base, prefix, out, exts);
    else if (exts.test(entry) && !SKIP_FILE_RE.test(entry)) out.push(full);
  }
}

export function collectFrontend(dirs: string[] = FRONTEND_SCAN_DIRS): SourceFile[] {
  const files: string[] = [];
  for (const d of dirs) walk(join(ROOT, d), ROOT, "matrx-frontend", files, /\.(tsx?|mjs)$/);
  return files.map((abs) => ({
    abs,
    rel: `matrx-frontend/${relative(ROOT, abs)}`,
    text: readFileSync(abs, "utf8"),
  }));
}

/** null when the aidream checkout is absent — every caller must treat that as UNMEASURED. */
export function collectAidream(dirs: string[]): SourceFile[] | null {
  try {
    if (!statSync(AIDREAM_DIR).isDirectory()) return null;
  } catch {
    return null;
  }
  const files: string[] = [];
  for (const d of dirs) walk(join(AIDREAM_DIR, d), AIDREAM_DIR, "aidream", files, /\.py$/);
  return files.map((abs) => ({
    abs,
    rel: `aidream/${relative(AIDREAM_DIR, abs)}`,
    text: readFileSync(abs, "utf8"),
  }));
}

export const SANDBOX_SCAN_DIRS = ["orchestrator/orchestrator"];

/**
 * matrx-sandbox's orchestrator — the reader of every `infrastructure.sandbox`
 * row. Its knob family is KEY-FIRST with the feature defaulted from the helper
 * module (`knob_int(key, feature=FEATURE)`), so each file carries
 * `implicitFeature`, read from that module's own `FEATURE = "…"` line rather
 * than hardcoded here (a rename there must not silently orphan the fleet).
 *
 * Returns `{ files: null, why }` when the checkout is absent — the CALLER must
 * say so out loud (the 13 sandbox rows would otherwise be reported as orphans
 * by a guard that simply never looked).
 */
export function collectSandbox(
  dirs: string[] = SANDBOX_SCAN_DIRS,
): { files: SourceFile[]; feature: string } | { files: null; why: string } {
  try {
    if (!statSync(SANDBOX_DIR).isDirectory()) return { files: null, why: `${SANDBOX_DIR} is not a directory` };
  } catch {
    return { files: null, why: `${SANDBOX_DIR} does not exist (clone matrx-sandbox beside this repo or set MATRX_SANDBOX_DIR)` };
  }
  const helper = join(SANDBOX_DIR, "orchestrator", "orchestrator", "knobs.py");
  let helperText: string;
  try {
    helperText = readFileSync(helper, "utf8");
  } catch {
    return { files: null, why: `${helper} is missing — the orchestrator's knob reader moved; update SANDBOX_SCAN_DIRS/collectSandbox` };
  }
  const feature = localStringConsts(helperText).get("FEATURE");
  if (!feature) {
    return { files: null, why: `${helper} declares no FEATURE = "…" constant — the key-first family cannot be resolved` };
  }
  const files: string[] = [];
  for (const d of dirs) walk(join(SANDBOX_DIR, d), SANDBOX_DIR, "matrx-sandbox", files, /\.py$/);
  return {
    feature,
    files: files.map((abs) => ({
      abs,
      rel: `matrx-sandbox/${relative(SANDBOX_DIR, abs)}`,
      text: readFileSync(abs, "utf8"),
      implicitFeature: feature,
    })),
  };
}

export const AIDREAM_SCAN_DIRS = ["aidream", "packages", "services", "core", "common", "apps", "api_management", "knowledgebase", "matrx_cms", "media_editing", "research", "seo", "utils"];

/**
 * Module-level `NAME = "literal"` constants in one file, so a call written as
 * `knob_int(PUBLISH_FEATURE, "sync_tick_minutes")` resolves to its real
 * feature. Without this the most disciplined call sites — the ones that named
 * their feature once — would be the ones the guard could not read.
 */
export function localStringConsts(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /^[ \t]*(?:export\s+)?(?:const\s+)?([A-Z][A-Z0-9_]{2,})(?:\s*:\s*[\w.[\]"'| ]+)?\s*=\s*["']([^"'\n]+)["']/gm;
  for (let m = re.exec(text); m; m = re.exec(text)) out.set(m[1], m[2]);
  return out;
}

export function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

// ── the reader vocabulary — ONE list, shared by orphans and unregistered ────
//
// Every entry point through which code reads a knob by (feature, key). A reader
// missing from this list is invisible to BOTH guards at once — the orphans
// guard would call its keys dead and the unregistered guard would never grade
// them — so the list lives here, once.
//
//   matrx-frontend  lib/knobs/featureKnobs.ts   knobNumber/knobInt/knobBool/knobString/knobInts
//                   lib/scoped-config           useScopedKnobs({featurePrefix}) + `.key === "…"`
//                   lib/scoped-config           useEffectiveKnob/ensureEffectiveKnob/peekEffectiveKnob/
//                                               useSessionKnob/getSessionKnob("feature.key") — FULL-KEY family
//                   feature maps                fetchFeatureKnobValues("X") / fetchKnobIndex({featurePrefix:"X"})
//                                               then `values.key` / `data?.key` / `["key"]` — the file names ONE
//                                               feature and every registry key of it that appears as a property
//                                               or quoted literal in that file is read (needs the registry)
//   aidream         services/feature_knobs      knob_int/knob_str/knob_bool/knob_decimal (+ *_sync) + scoped_knob_*
//   packages        matrx_seo.knobs, matrx_batch.knobs   usd_knob/int_knob/str_knob/float_knob/bool_knob
//                   0663 seams                  parser_knob/extraction_knob/dry_run_knob/catalog_knob("key", MIRROR)
//                                               — key-first, feature from the seam module (implicitFeature)
//   matrx-sandbox   orchestrator/knobs.py       knob_int/knob_float/knob_str/knob_bool("key") — KEY-FIRST, the
//                                               feature is the helper's FEATURE constant (implicitFeature)
//   templates       f"max_live_{x}_runs" / `max_live_${x}_runs` — a computed key whose SHAPE is static:
//                   every registry key of that feature matching the template counts as read (needs the registry)
//   KNOB MIRROR     `KNOB MIRROR … "feature" "key"` beside a synchronous constant — the documented posture
//                   check:settings-hardcoded accepts; the comment IS the read, and is graded as one
//   database        pg_proc sources (hr._clock_knob, hr._kiosk_device_config, …) — see dbReaders()

export const TS_KNOB_FNS = "knobNumber|knobInt|knobBool|knobString|knobInts";
export const PY_KNOB_FNS =
  "knob_int|knob_bool|knob_str|knob_string|knob_decimal|knob_number|knob_json|knob_raw|knob_float" +
  "|knob_int_sync|knob_bool_sync|knob_str_sync|knob_raw_sync" +
  "|scoped_knob_int|scoped_knob_str|scoped_knob_bool|scoped_knob_json|scoped_knob_decimal|scoped_knob_raw" +
  "|usd_knob|int_knob|str_knob|float_knob|bool_knob|decimal_knob|json_knob";
/** Key-first readers: `fn("key")` (matrx-sandbox) and `fn("key", MIRROR)` (the 0663 package seams). */
export const KEY_FIRST_FNS = "knob_int|knob_float|knob_str|knob_bool|parser_knob|extraction_knob|dry_run_knob|catalog_knob";
/** The 0663 package seams and the feature each one reads (declared in its module's FEATURE). */
export const SEAM_MODULES: Array<{ re: RegExp; fn: string }> = [
  { re: /aidream\/packages\/matrx-scraper\/matrx_scraper\/parser\/knobs\.py$/, fn: "parser_knob" },
  { re: /aidream\/packages\/matrx-files\/matrx_files\/specific_handlers\/knobs\.py$/, fn: "extraction_knob" },
  { re: /aidream\/packages\/matrx-graph\/matrx_graph\/knobs\.py$/, fn: "dry_run_knob" },
  { re: /aidream\/packages\/matrx-ai\/matrx_ai\/catalog\/knobs\.py$/, fn: "catalog_knob" },
];
/** Full-key readers: `fn(org, user, "feature.key")` / `fn("feature.key")` — the key is the LAST dotted segment. */
export const FULL_KEY_FNS = "useEffectiveKnob|ensureEffectiveKnob|peekEffectiveKnob|useSessionKnob|getSessionKnob";
/** Whole-feature fetchers: the file names ONE feature and reads its keys as properties. */
export const FEATURE_MAP_FNS = "fetchFeatureKnobValues";

const TS_CALL_RE = new RegExp(`\\b(${TS_KNOB_FNS})\\s*\\(\\s*([^,()]+?)\\s*,\\s*([\\s\\S]{0,240}?)\\)`, "g");
const PY_CALL_RE = new RegExp(`\\b(${PY_KNOB_FNS})\\s*\\(\\s*([^,()]+?)\\s*,\\s*([\\s\\S]{0,240}?)\\)`, "g");
const TS_PREFIX_RE = /featurePrefix\s*:\s*["']([A-Za-z][\w.]*)["']/g;
const TS_KEY_EQ_RE = /\.(?:key|full_key)\s*===?\s*(["'][^"'\n]+["']|[A-Z][A-Z0-9_]{2,})/g;
// Key-first: `knob_int("key")`, `knobs.knob_float("key")`, `parser_knob("key", MIRROR)`,
// with an optional explicit `feature=` keyword (sandbox) that overrides the implicit one.
const KEY_FIRST_RE = new RegExp(
  `\\b(${KEY_FIRST_FNS})\\s*\\(\\s*(["'][^"'\\n]+["']|[A-Z][A-Z0-9_]{2,})\\s*(?:,\\s*(?:feature\\s*=\\s*)?([^,()]+?)\\s*)?\\)`,
  "g",
);
const FULL_KEY_RE = new RegExp(
  `\\b(${FULL_KEY_FNS})\\s*\\(\\s*(?:[^,()]+?\\s*,\\s*[^,()]+?\\s*,\\s*)?(["'][^"'\\n]+["']|[A-Z][A-Z0-9_]{2,})\\s*\\)`,
  "g",
);
const FEATURE_MAP_RE = new RegExp(`\\b(${FEATURE_MAP_FNS})\\s*\\(\\s*(["'][^"'\\n]+["']|[A-Z][A-Z0-9_]{2,})`, "g");
// `KNOB MIRROR of platform.feature_knob "feature" "key"` (also `KNOB-MIRROR`, any words between).
const KNOB_MIRROR_RE = /KNOB[ -]?MIRROR[^\n]*?["']([A-Za-z][\w.]*)["']\s*["']([A-Za-z][\w.]*)["']/g;
// A computed key whose shape is static: f"max_live_{x}_runs" / `max_live_${x}_runs`.
const PY_FSTRING_RE = /^f["']([^"'\n]*\{[^"'\n]*)["']$/;
const TS_TEMPLATE_RE = /^`([^`\n]*\$\{[^`\n]*)`$/;

/** The knob HELPERS themselves — their parameter lists are not call sites. */
export const HELPER_MODULES =
  /(matrx-frontend\/lib\/knobs\/featureKnobs\.ts$|matrx-frontend\/lib\/scoped-config\/|aidream\/aidream\/services\/feature_knobs\/service\.py$|aidream\/packages\/matrx-[a-z]+\/matrx_[a-z]+\/(?:[\w]+\/)*knobs\.py$|matrx-sandbox\/orchestrator\/orchestrator\/knobs\.py$)/;

export interface ReadSite {
  file: string;
  line: number;
  fn: string;
  feature: string;
  key: string;
}
export interface DynamicRead {
  file: string;
  line: number;
  fn: string;
  raw: string;
  why: string;
}

function unquote(raw: string): string | null {
  const m = /^(?:["'])([^"'\n]+)(?:["'])$/.exec(raw.trim());
  return m ? m[1] : null;
}

/**
 * Every knob read the source tree can be made to name. `sites` are resolved
 * (feature, key) pairs; `dynamic` is what could NOT be resolved, listed so
 * silence is never mistaken for coverage. `consts` pools every module-level
 * `NAME = "literal"` across all scanned files, so a feature constant declared in
 * one module and imported into another still resolves.
 */
export function scanKnobReads(
  files: SourceFile[],
  registry: KnobRow[] = [],
): {
  sites: ReadSite[];
  dynamic: DynamicRead[];
  consts: Map<string, string>;
} {
  const consts = new Map<string, string>();
  for (const f of files) for (const [k, v] of localStringConsts(f.text)) consts.set(k, v);
  const sites: ReadSite[] = [];
  const dynamic: DynamicRead[] = [];
  const resolveName = (raw: string, local: Map<string, string>) =>
    unquote(raw) ?? local.get(raw.trim()) ?? consts.get(raw.trim()) ?? null;
  // The registry's keys per feature — what the feature-map and template
  // families resolve against. Without a registry those two families stay
  // silent (they can only ever name keys that exist).
  const keysOf = new Map<string, string[]>();
  for (const r of registry) keysOf.set(r.feature, [...(keysOf.get(r.feature) ?? []), r.key]);
  // The 0663 package seams declare their own feature; a call to `parser_knob`
  // in any file of that package reads it. Learned from the seam modules, not typed here.
  const seamFeature = new Map<string, string>();
  for (const f of files) {
    const seam = SEAM_MODULES.find((m) => m.re.test(f.rel));
    if (!seam) continue;
    const feature = localStringConsts(f.text).get("FEATURE");
    if (feature) seamFeature.set(seam.fn, feature);
  }
  const templateSites = (feature: string, template: string, file: string, line: number, fn: string) => {
    // f"max_live_{x}_runs" → /^max_live_.+_runs$/ against the registry's keys for that feature.
    const pattern = new RegExp(
      `^${template.replace(/\$?\{[^}]*\}/g, "\u0000").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\u0000/g, ".+")}$`,
    );
    const hits = (keysOf.get(feature) ?? []).filter((k) => pattern.test(k));
    for (const key of hits) sites.push({ file, line, fn: `${fn} (template)`, feature, key });
    return hits.length;
  };

  for (const f of files) {
    if (!/knob/i.test(f.text) || HELPER_MODULES.test(f.rel)) continue;
    const isPy = f.rel.endsWith(".py");
    const local = localStringConsts(f.text);
    const re = isPy ? PY_CALL_RE : TS_CALL_RE;
    re.lastIndex = 0;
    for (let m = re.exec(f.text); m; m = re.exec(f.text)) {
      const [, fn, rawFeature, rawRest] = m;
      const line = lineOf(f.text, m.index);
      const before = f.text.slice(Math.max(0, m.index - 24), m.index);
      if (/\b(?:async\s+)?(?:def|function)\s+$/.test(before)) continue; // a declaration
      if (/^[A-Za-z_$][\w$]*\s*:\s*\S/.test(rawFeature.trim())) continue; // a typed signature
      const feature = resolveName(rawFeature, local);
      const arr = /^\s*\[([\s\S]*?)\]/.exec(rawRest);
      const rawKeys = arr ? (arr[1].match(/["'][^"'\n]+["']/g) ?? []) : [rawRest.split(",")[0]];
      if (!feature) {
        dynamic.push({ file: f.rel, line, fn, raw: `${rawFeature.trim()}, …`, why: "feature is not a string literal or a module constant" });
        continue;
      }
      for (const rk of rawKeys) {
        const key = resolveName(rk, local);
        if (!key) {
          const tpl = (isPy ? PY_FSTRING_RE : TS_TEMPLATE_RE).exec(rk.trim());
          if (tpl && templateSites(feature, tpl[1], f.rel, line, fn) > 0) continue;
          dynamic.push({ file: f.rel, line, fn, raw: `${feature}, ${rk.trim().replace(/\s+/g, " ").slice(0, 60)}`, why: tpl ? "key template matches no registry key" : "key is computed at run time" });
          continue;
        }
        sites.push({ file: f.rel, line, fn, feature, key });
      }
    }

    // KEY-FIRST family: `knob_int("key")` in matrx-sandbox (feature = the
    // helper's FEATURE, or an explicit `feature=`), and the 0663 seams
    // `parser_knob("key", MIRROR)` anywhere in their package.
    KEY_FIRST_RE.lastIndex = 0;
    for (let m = KEY_FIRST_RE.exec(f.text); m; m = KEY_FIRST_RE.exec(f.text)) {
      const [, fn, rawKey, rawFeature] = m;
      const line = lineOf(f.text, m.index);
      const before = f.text.slice(Math.max(0, m.index - 24), m.index);
      if (/\b(?:async\s+)?(?:def|function)\s+$/.test(before)) continue;
      const seam = seamFeature.get(fn);
      // A two-arg call is the seam shape only when the fn IS a seam; for the
      // sandbox family a second arg is `feature=…`.
      let feature: string | null = null;
      if (seam) feature = seam;
      else if (f.implicitFeature) feature = rawFeature && /feature\s*=/.test(m[0]) ? resolveName(rawFeature, local) : f.implicitFeature;
      if (!feature) continue; // a two-arg `knob_int(feature, key)` already handled above
      if (!seam && rawFeature && !/feature\s*=/.test(m[0])) continue; // `knob_int(FEATURE, "key")` — the two-arg family
      const key = resolveName(rawKey, local);
      if (!key) {
        dynamic.push({ file: f.rel, line, fn, raw: `${feature}, ${rawKey.trim()}`, why: "key is computed at run time" });
        continue;
      }
      sites.push({ file: f.rel, line, fn, feature, key });
    }

    // KNOB MIRROR family: the documented posture for a synchronous constant —
    // `KNOB MIRROR of platform.feature_knob "feature" "key"`. The comment is
    // the contract (check:settings-hardcoded accepts it), so it is graded as
    // a read here and as an UNREGISTERED read when the row does not exist.
    KNOB_MIRROR_RE.lastIndex = 0;
    for (let m = KNOB_MIRROR_RE.exec(f.text); m; m = KNOB_MIRROR_RE.exec(f.text)) {
      sites.push({ file: f.rel, line: lineOf(f.text, m.index), fn: "KNOB MIRROR", feature: m[1], key: m[2] });
    }

    // FULL-KEY family: useEffectiveKnob(org, user, "feature.key") /
    // useSessionKnob("feature.key") — the key is the last dotted segment.
    if (!isPy) {
      FULL_KEY_RE.lastIndex = 0;
      for (let m = FULL_KEY_RE.exec(f.text); m; m = FULL_KEY_RE.exec(f.text)) {
        const [, fn, rawFull] = m;
        const line = lineOf(f.text, m.index);
        const full = resolveName(rawFull, local);
        if (!full) {
          dynamic.push({ file: f.rel, line, fn, raw: rawFull.trim(), why: "full key is computed at run time" });
          continue;
        }
        const at = full.lastIndexOf(".");
        if (at <= 0) {
          dynamic.push({ file: f.rel, line, fn, raw: full, why: "full key has no feature segment" });
          continue;
        }
        sites.push({ file: f.rel, line, fn, feature: full.slice(0, at), key: full.slice(at + 1) });
      }
    }

    // lib/scoped-config consumers: useScopedKnobs({ featurePrefix: "X" }) then
    // knobs.find((k) => k.key === "…"). One prefix per file resolves; more than
    // one is ambiguous and is listed as dynamic rather than guessed.
    if (isPy) continue;
    const prefixes = [...new Set([...f.text.matchAll(TS_PREFIX_RE)].map((m) => m[1]))];
    // FEATURE-MAP family: fetchFeatureKnobValues("X") / fetchKnobIndex({featurePrefix:"X"})
    // hand the file a map of every key; the keys it reads appear as properties
    // (`values.json_max_depth`, `data?.window_days`) or quoted literals. With ONE
    // feature named in the file, every registry key of it that appears is read.
    FEATURE_MAP_RE.lastIndex = 0;
    const mapFeatures = new Set<string>(prefixes);
    for (let m = FEATURE_MAP_RE.exec(f.text); m; m = FEATURE_MAP_RE.exec(f.text)) {
      const feature = resolveName(m[2], local);
      if (feature) mapFeatures.add(feature);
      else dynamic.push({ file: f.rel, line: lineOf(f.text, m.index), fn: m[1], raw: m[2].trim(), why: "feature is not a string literal or a module constant" });
    }
    if (mapFeatures.size === 1 && keysOf.size > 0) {
      const feature = [...mapFeatures][0];
      for (const key of keysOf.get(feature) ?? []) {
        const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const propRe = new RegExp(`(?:\\?\\.|\\.)${esc}\\b|\\[["']${esc}["']\\]|["']${esc}["']`);
        const hit = propRe.exec(f.text);
        if (hit) sites.push({ file: f.rel, line: lineOf(f.text, hit.index), fn: "feature map", feature, key });
      }
    } else if (mapFeatures.size > 1 && keysOf.size > 0) {
      dynamic.push({ file: f.rel, line: 1, fn: "feature map", raw: [...mapFeatures].join("|"), why: "several features fetched as maps in one file — property reads cannot be attributed" });
    }
    if (prefixes.length === 0) continue;
    TS_KEY_EQ_RE.lastIndex = 0;
    for (let m = TS_KEY_EQ_RE.exec(f.text); m; m = TS_KEY_EQ_RE.exec(f.text)) {
      const line = lineOf(f.text, m.index);
      const key = resolveName(m[1], local);
      if (!key) {
        dynamic.push({ file: f.rel, line, fn: "useScopedKnobs", raw: `${prefixes.join("|")}, ${m[1]}`, why: "key is computed at run time" });
      } else if (prefixes.length === 1) {
        sites.push({ file: f.rel, line, fn: "useScopedKnobs", feature: prefixes[0], key });
      } else {
        dynamic.push({ file: f.rel, line, fn: "useScopedKnobs", raw: `${prefixes.join("|")}, ${key}`, why: "several featurePrefix values in one file" });
      }
    }
  }
  return { sites, dynamic, consts };
}

/**
 * Knob keys read from INSIDE the database — function bodies and view
 * definitions that quote the key while also naming its feature or calling a
 * knob helper. `hr.time_and_attendance` alone has ~50 keys read only this way
 * (`hr._clock_knob`, `hr._kiosk_device_config`, the punch write path), and a
 * guard that could not see them would report the best-wired feature in the
 * registry as the most orphaned. Liveness probes that merely LIST keys
 * (`*_knobs_missing`, `*conformance`, `*fixture_probe`) are excluded — naming
 * a key to check it exists is not consuming it.
 *
 * Returns null when the admin door is unavailable; the caller decides.
 */
export async function dbReaders(rows: KnobRow[]): Promise<Map<string, string[]> | null> {
  // Candidate sources come down once (~770 bodies, ~3 MB, ~7 s); the per-key
  // match runs here because 448 keys × 3,300 bodies as a SQL join hits the
  // statement timeout.
  // ONE regex per body (every feature name alternated), not one LIKE per
  // feature per body: at 591 rows / ~100 features × 6,656 procs the LIKE
  // form crossed execute_admin_query's ~8.2 s ceiling on 2026-09-13 and the
  // guard went UNMEASURED.
  const res = await adminQuery<{ name: string; body: string }>(`
    with pat as (
      select '(' || string_agg(regexp_replace(feature, '([.\\\\+*?\\[^\\]$(){}=!<>|:-])', '\\\\\\1', 'g'), '|') || ')' as re
        from (select distinct feature from platform.feature_knob) f
    ),
    src as (
      select n.nspname || '.' || p.proname as name, p.prosrc as body
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname not in ('pg_catalog','information_schema','extensions','graphql','graphql_public',
                               'pgsodium','vault','net','pgbouncer','realtime','storage','supabase_functions',
                               'auth','supabase_migrations','cron','pgmq')
         and p.prokind in ('f','p')
         and p.proname !~ '(_knobs_missing|conformance|fixture_probe)$'
      union all
      select schemaname || '.' || viewname, definition from pg_views
       where schemaname not in ('pg_catalog','information_schema','extensions','vault','auth','storage','realtime')
    )
    select name, body from src
     where body ilike '%knob%'
        or body ~ (select re from pat)`);
  if (!res.rows) return null;
  const out = new Map<string, string[]>();
  for (const r of rows) {
    // `'key'` beside its feature or a knob call — or the fully qualified
    // `feature.key`, which is how esign.config_resolve() addresses a row.
    const quoted = `'${r.key}'`;
    const full = `${r.feature}.${r.key}`;
    const readers = res.rows
      .filter(
        (s) =>
          s.body.includes(full) ||
          (s.body.includes(quoted) && (s.body.includes(r.feature) || /knob/i.test(s.body))),
      )
      .map((s) => s.name);
    if (readers.length > 0) out.set(addr(r.feature, r.key), readers);
  }
  return out;
}

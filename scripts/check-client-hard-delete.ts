#!/usr/bin/env npx tsx
/**
 * Client hard delete of a soft-deletable entity — the door and the doorway.
 *
 * WHAT IT PROTECTS: the platform rule that a registered entity carrying
 * `deleted_at` is REMOVED (soft), never destroyed, from a client
 * (db-rules FEATURE.md §8, §8a).
 *
 * WHY IT EXISTS (DD-119, 2026-09-12): deleting a task from /tasks issued
 * `DELETE FROM workspace.tasks` straight from the browser. The task and its
 * subtask were gone from the table — not `deleted_at`-stamped — while the dialog
 * said "This cannot be undone", and deleting a chat on the same afternoon was a
 * soft delete that promised recovery. `workspace.tasks` had `deleted_at` and a
 * registry row saying so the whole time. Three separate client paths in this repo
 * were hard-deleting it.
 *
 * IT MEASURES TWO HALVES, and needs both:
 *   1. THE DOOR — live, from `public.__client_hard_delete_conformance()`: is the
 *      `_refuse_client_hard_delete` trigger actually attached, BEFORE-ROW, enabled
 *      and SECURITY INVOKER, on the tables that claim it? A dropped or flipped
 *      trigger leaves migrations/task_hard_delete_door_closed.sql on disk looking
 *      exactly the same (db-rules §1).
 *   2. THE DOORWAY — a source scan for supabase-js `.delete()` against a table in
 *      the live soft-deletable population. A client path that hard-deletes one of
 *      those is either a row destroyed for good, or (once that table's door is
 *      shut) a button that fails in the user's face.
 *
 * THE ALLOW-LIST IS THE CENSUS. `scripts/client-hard-delete-allowlist.json` holds
 * every pre-existing offender found on 2026-09-12, each with the table it
 * destroys. They are NOT forgiven — each is a fix somebody owns — but a gate that
 * can never be green teaches everyone to ignore it. A new one fails. An entry
 * that no longer hard-deletes ALSO fails, so a fix cannot quietly leave the
 * census lying.
 *
 *   pnpm check:client-hard-delete            # loud, exit 0
 *   pnpm check:client-hard-delete:strict     # exit 1 on ANY finding (CI)
 *
 * PROVEN FAILING: with `features/tasks/services/taskService.ts` put back to
 * `.delete()` (its shape before DD-119), this reported
 * `FAIL new client hard delete … workspace.tasks` and exited 1 in strict; with
 * the soft-delete door restored it reported OK and exited 0 (2026-09-12).
 *
 * EXTENDED 2026-09-27 (Arman: "delete MUST MEAN ARCHIVE regardless of what it's
 * called"). The census went to ZERO — every door became a soft delete — and the
 * gate grew three more halves, each a pattern the first version walked past:
 *   3. THE SERVER LANE — `app/api/**` was exempt ("service_role is allowed to
 *      destroy a row"); four routes used that to hard-delete a person's app,
 *      artifact, group chat and tool UI. Route handlers are scanned like any
 *      other client path now.
 *   4. THE LABEL — a control that promises destruction ("Delete permanently",
 *      "Delete forever", "Empty trash", "Purge", "…cannot be undone" on a delete)
 *      is refused. Notes shipped all three while the doorway half was green,
 *      because their `.delete()` sat on the census. A label on something that is
 *      not a record (a sandbox's own disk, a cache) states that in place with
 *      `// destroy-label-ok: <what is destroyed and why it is not a record>` on
 *      the line or the line above.
 *   5. THE RPC — `.rpc("…purge…" | "…hard_delete…" | "…permanent…" |
 *      "…empty_trash…")` from a client is a hard-delete door by its own name.
 * The allow-list file stays, EMPTY, only so a future lane has the same shape;
 * adding an entry is adding a destroyed record.
 *
 * 🚨 UNMEASURED IS NOT PASSED: if the live half cannot be read, the run is
 * UNMEASURED and strict exits 1 — same contract and same banner as
 * check-soft-delete-cascade.ts.
 *
 * Exit codes:
 *   0  green, OR findings/unmeasured in default (advisory) mode
 *   1  findings, or an unmeasured run, AND --strict
 *   2  the script itself crashed
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RPC = "__client_hard_delete_conformance";
const TIMEOUT_MS = 15_000;
const STRICT = process.argv.includes("--strict");
const ALLOWLIST_PATH = resolve(
  ROOT,
  process.env.CLIENT_HARD_DELETE_ALLOWLIST ?? "scripts/client-hard-delete-allowlist.json",
);
/** For the red-then-green proof on a scratch copy: scan another root. */
const SCAN_ROOT = process.env.CLIENT_HARD_DELETE_SCAN_ROOT
  ? resolve(process.env.CLIENT_HARD_DELETE_SCAN_ROOT)
  : ROOT;

/** The checks the deployed function is contracted to return. */
const EXPECTED_CHECKS = [
  "tasks_door_shut",
  "guard_shape_correct",
  "refusal_is_security_invoker",
  "soft_deletable_population",
] as const;

/**
 * Where a write a person can trigger lives — route handlers under `app/api/**`
 * included: running as service_role never made destroying a person's record
 * right (2026-09-27).
 */
const SCAN_DIRS = ["features", "components", "hooks", "lib", "utils", "app"];

/**
 * Words that promise a person their record is destroyed. Matched inside string
 * literals and JSX text only (comments are stripped first).
 */
const DESTROY_LABEL =
  /\b(?:delete|deleted|deletes|remove|removed|removes|erase|erased)\s+(?:permanently|forever|for good|outright)\b|\b(?:hard[- ]deletes?|permanently\s+(?:delete|deleted|deletes|remove|removes|erase|erases))\b|\bempty(?:ing)?\s+(?:the\s+)?trash\b|["'`>]\s*(?:Purge|Delete forever|Delete permanently)\b/i;
/** "cannot be undone" / "can't be undone" only counts beside a delete verb. */
const UNDONE = /\b(?:cannot|can't|can not)\s+be\s+undone\b/i;
const DELETE_VERB = /\b(?:delet|remov|eras)/i;
/** Copy that says the OPPOSITE ("nothing is deleted for good") is the honest kind. */
const NEGATED = /\b(?:nothing|never|not|no)\b[^.;]{0,40}\b(?:deleted|removed|erased)\b/i;
const LABEL_EXEMPT = /destroy-label-ok:\s*\S/;
const HARD_RPC = /\.rpc\(\s*["'`]([A-Za-z0-9_.]*(?:purge|hard_delete|permanent|empty_trash)[A-Za-z0-9_.]*)["'`]/g;
const SKIP_DIR = /(^|\/)(node_modules|\.next|__tests__|__mocks__|dist|build)(\/|$)/;
const SKIP_FILE = /\.(test|spec|d)\.tsx?$/;

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};
const TAG = {
  info: `${C.cyan}[INFO]${C.reset} `,
  warn: `${C.yellow}[WARN]${C.reset} `,
  fail: `${C.red}[FAIL]${C.reset} `,
  ok: `${C.green}[ OK ]${C.reset} `,
};

interface ConformanceRow {
  readonly check_key: string;
  readonly ok: boolean;
  readonly severity?: string;
  readonly detail: Record<string, unknown> | null;
}

interface AllowEntry {
  readonly file: string;
  readonly table: string;
  readonly note: string;
}

interface Hit {
  readonly file: string;
  readonly line: number;
  readonly table: string;
}

/**
 * Same resolution order as check-soft-delete-cascade.ts, and for the same reason:
 * the RPC is granted to service_role only, so the publishable key would answer
 * 401 and report a healthy database as unmeasured.
 */
function loadSupabaseEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) {
    let secret = "";
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (!secret && m[1] === "SUPABASE_SECRET_KEY") secret = v;
      }
      if (url && secret) break;
    }
    if (!key) key = secret;
  }
  return url && key ? { url, key } : null;
}

function isRow(value: unknown): value is ConformanceRow {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.check_key === "string" && typeof r.ok === "boolean";
}

async function fetchConformance(): Promise<
  { rows: ConformanceRow[]; failure: null } | { rows: null; failure: string }
> {
  const env = loadSupabaseEnv();
  if (!env) return { rows: null, failure: "no Supabase URL/secret key in env or .env* files" };
  const endpoint = `${env.url.replace(/\/$/, "")}/rest/v1/rpc/${RPC}`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Profile": "public",
        "Accept-Profile": "public",
      },
      body: "{}",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        rows: null,
        failure: `rpc/${RPC} returned ${res.status}: ${(await res.text()).slice(0, 300)}`,
      };
    }
    const parsed: unknown = JSON.parse(await res.text());
    if (!Array.isArray(parsed)) return { rows: null, failure: `rpc/${RPC} did not return an array` };
    const rows = parsed.filter(isRow);
    if (rows.length !== parsed.length) {
      return { rows: null, failure: `rpc/${RPC} returned rows that are not {check_key, ok, ...}` };
    }
    return { rows, failure: null };
  } catch (err) {
    return {
      rows: null,
      failure: `could not reach Supabase at ${endpoint} (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (SKIP_DIR.test(full)) continue;
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !SKIP_FILE.test(name)) out.push(full);
  }
}

/**
 * Resolve the table a `.delete()` acts on.
 *
 * The chain is written many ways — `supabase.from("x")`,
 * `supabase.schema("s").from("x")`, `workspaceDb(supabase).from("x")`,
 * `db.from(TABLE)` — so this reads the NEAREST PRECEDING `.from("literal")` in the
 * same statement window and the nearest `.schema("literal")` in front of it. A
 * `.from(CONSTANT)` resolves to nothing and is reported as unresolved rather than
 * silently passed: the honest answer is "this gate could not read it".
 */
function resolveTable(text: string, deleteIdx: number): { table: string | null; schema: string | null } {
  let window = text.slice(Math.max(0, deleteIdx - 600), deleteIdx);
  // `.from(TABLE)` where `const TABLE = "x"` in the same file.
  window = window.replace(/\.from\(\s*([A-Z_][A-Z0-9_]*)\s*\)/g, (whole, ident: string) => {
    const m = text.match(new RegExp(`const\\s+${ident}\\s*=\\s*["'\`]([A-Za-z0-9_]+)["'\`]`));
    return m ? `.from("${m[1]}")` : whole;
  });
  // `helper().delete()` where `function helper() { return ….schema("s").from("t"); }`.
  const helper = window.match(/\b([a-zA-Z_][A-Za-z0-9_]*)\(\)\s*$/);
  if (helper) {
    const body = text.match(
      new RegExp(`function\\s+${helper[1]}\\s*\\(\\)[^{]*\\{([\\s\\S]{0,300}?)\\}`),
    );
    if (body?.[1]) window = `${body[1]}${window}`;
  }
  const froms = [...window.matchAll(/\.from\(\s*["'`]([A-Za-z0-9_]+)["'`]\s*\)/g)];
  const last = froms.at(-1);
  if (!last) return { table: null, schema: null };
  const before = window.slice(0, last.index ?? 0);
  const schemas = [
    ...before.matchAll(/\.schema\(\s*["'`]([A-Za-z0-9_]+)["'`]\s*\)/g),
    ...before.matchAll(/\b([a-z][A-Za-z0-9]*)Db\s*\(/g),
  ];
  const s = schemas.at(-1);
  const schema = s ? (s[1] ?? "").toLowerCase() : null;
  return { table: last[1] ?? null, schema };
}


/** Blank out comments (keeping offsets and newlines) so only code and strings remain. */
function stripComments(text: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < text.length) {
    const c = text[i]!;
    const n = text[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += n ?? "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < text.length && text[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (c === "/" && n === "*") {
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        out += text[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += "  ";
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

interface LabelHit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** Destruction promised in a label, and hard-delete RPCs by name. */
function scanLabelsAndRpcs(file: string, rel: string): { labels: LabelHit[]; rpcs: LabelHit[] } {
  const raw = readFileSync(file, "utf8");
  const code = stripComments(raw);
  const rawLines = raw.split("\n");
  const lines = code.split("\n");
  const labels: LabelHit[] = [];
  const rpcs: LabelHit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const exempt =
      LABEL_EXEMPT.test(rawLines[i] ?? "") || LABEL_EXEMPT.test(rawLines[i - 1] ?? "");
    const promises = DESTROY_LABEL.test(line) || (UNDONE.test(line) && DELETE_VERB.test(line));
    if (!exempt && promises && !NEGATED.test(line)) {
      labels.push({ file: rel, line: i + 1, text: line.trim().slice(0, 140) });
    }
  }
  for (const m of code.matchAll(HARD_RPC)) {
    const line = code.slice(0, m.index ?? 0).split("\n").length;
    rpcs.push({ file: rel, line, text: m[1] ?? "" });
  }
  return { labels, rpcs };
}

/** Entry point — async so the live pull can be awaited. */
async function run(): Promise<number> {
  console.log(`${C.bold}Client hard delete of a soft-deletable entity${C.reset}`);
  console.log(`${C.dim}db-rules FEATURE.md §8 / §8a · DD-119${C.reset}\n`);

  let findings = 0;

  // ── Half 1: the door, live ────────────────────────────────────────────────
  const { rows, failure } = await fetchConformance();
  let population = new Set<string>();
  if (!rows) {
    console.log(`${TAG.warn}${C.bold}LIVE PULL FAILED — THIS RUN IS UNMEASURED${C.reset}`);
    console.log(`${TAG.info}${failure}`);
    console.log(
      `${TAG.info}The source scan below cannot run without the live list of soft-deletable tables.`,
    );
    return STRICT ? 1 : 0;
  }
  const byKey = new Map(rows.map((r) => [r.check_key, r]));
  for (const key of EXPECTED_CHECKS) {
    const row = byKey.get(key);
    if (!row) {
      console.log(`${TAG.fail}${key} — the deployed function did not return this check`);
      findings++;
      continue;
    }
    if (row.ok) {
      console.log(`${TAG.ok}${key}`);
    } else {
      console.log(`${TAG.fail}${key}`);
      const why = row.detail?.why;
      if (typeof why === "string") console.log(`       ${C.dim}${why}${C.reset}`);
      for (const [k, v] of Object.entries(row.detail ?? {})) {
        if (k === "why" || k === "tables") continue;
        if (Array.isArray(v) && v.length === 0) continue;
        console.log(`       ${k}: ${JSON.stringify(v)}`);
      }
      findings++;
    }
  }
  const tables = byKey.get("soft_deletable_population")?.detail?.tables;
  if (Array.isArray(tables)) population = new Set(tables.map(String));
  console.log(
    `${TAG.info}${population.size} registered entity tables carry deleted_at (live).\n`,
  );

  // ── Half 2: the doorway, in this repo's source ────────────────────────────
  const byTableName = new Map<string, string[]>();
  for (const q of population) {
    const [schema, table] = q.split(".");
    if (!schema || !table) continue;
    byTableName.set(table, [...(byTableName.get(table) ?? []), schema]);
  }

  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(resolve(SCAN_ROOT, d), files);

  const hits: Hit[] = [];
  const unresolved: { file: string; line: number }[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (!text.includes(".delete()")) continue;
    const rel = relative(SCAN_ROOT, file);
    let idx = text.indexOf(".delete()");
    while (idx !== -1) {
      const { table, schema } = resolveTable(text, idx);
      const line = text.slice(0, idx).split("\n").length;
      if (!table) {
        unresolved.push({ file: rel, line });
      } else {
        const schemas = byTableName.get(table) ?? [];
        const qualified = schema && schemas.includes(schema) ? `${schema}.${table}` : null;
        const only = !schema && schemas.length === 1 ? `${schemas[0]}.${table}` : null;
        const q = qualified ?? only;
        if (q) hits.push({ file: rel, line, table: q });
      }
      idx = text.indexOf(".delete()", idx + 1);
    }
  }

  const allow: AllowEntry[] = existsSync(ALLOWLIST_PATH)
    ? (JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")).entries as AllowEntry[])
    : [];
  const allowKeys = new Set(allow.map((a) => `${a.file}::${a.table}`));
  const hitKeys = new Set(hits.map((h) => `${h.file}::${h.table}`));

  const fresh = hits.filter((h) => !allowKeys.has(`${h.file}::${h.table}`));
  const stale = allow.filter((a) => !hitKeys.has(`${a.file}::${a.table}`));

  if (fresh.length === 0) {
    console.log(`${TAG.ok}no NEW client hard delete of a soft-deletable entity`);
  } else {
    for (const h of fresh) {
      console.log(
        `${TAG.fail}new client hard delete — ${h.file}:${h.line} destroys ${C.bold}${h.table}${C.reset}`,
      );
    }
    console.log(
      `       ${C.dim}That table is soft-deletable: set deleted_at (or call public.entity_soft_delete) so the row can be restored and its declared parts follow it. db-rules §8/§8a.${C.reset}`,
    );
    findings += fresh.length;
  }

  if (stale.length === 0) {
    console.log(`${TAG.ok}the census in ${relative(ROOT, ALLOWLIST_PATH)} matches the source`);
  } else {
    for (const a of stale) {
      console.log(
        `${TAG.fail}stale census entry — ${a.file} no longer hard-deletes ${a.table}; remove the entry`,
      );
    }
    findings += stale.length;
  }

  console.log(
    `${TAG.info}${allow.length} known offenders still on the census; ${unresolved.length} .delete() calls whose table this gate could not read.`,
  );
  if (allow.length > 0) {
    console.log(
      `${TAG.fail}the census is not empty — delete means archive (Arman, 2026-09-27); every entry is a record a person can destroy`,
    );
    findings += allow.length;
  }

  // ── Half 3: labels that promise destruction, and hard-delete RPCs ─────────
  const labelHits: LabelHit[] = [];
  const rpcHits: LabelHit[] = [];
  for (const file of files) {
    if (/scripts\/check-client-hard-delete/.test(file)) continue;
    const { labels, rpcs } = scanLabelsAndRpcs(file, relative(SCAN_ROOT, file));
    labelHits.push(...labels);
    rpcHits.push(...rpcs);
  }
  if (labelHits.length === 0) {
    console.log(`${TAG.ok}no control promises to destroy a record ("Delete permanently", "Empty trash", "Purge"…)`);
  } else {
    for (const h of labelHits) {
      console.log(`${TAG.fail}destroy label — ${h.file}:${h.line}  ${C.dim}${h.text}${C.reset}`);
    }
    console.log(
      `       ${C.dim}Delete means archive: say "Move to Trash" / "Archive" and that it can be restored; a purge is a lifecycle policy, never a button. Not a record? Mark the line // destroy-label-ok: <why>.${C.reset}`,
    );
    findings += labelHits.length;
  }
  if (rpcHits.length === 0) {
    console.log(`${TAG.ok}no client call to a purge / hard-delete RPC`);
  } else {
    for (const h of rpcHits) {
      console.log(`${TAG.fail}hard-delete RPC — ${h.file}:${h.line} calls ${C.bold}${h.text}${C.reset}`);
    }
    findings += rpcHits.length;
  }

  if (findings > 0) {
    console.log(
      `\n${C.red}${C.bold}${findings} finding(s).${C.reset} ${STRICT ? "strict → exit 1" : "advisory → exit 0"}`,
    );
    return STRICT ? 1 : 0;
  }
  console.log(`\n${C.green}${C.bold}Green.${C.reset}`);
  return 0;
}

run()
  .then((code) => exitAfterDrain(code))
  .catch((err) => {
    console.error(`${TAG.fail}check-client-hard-delete crashed: ${String(err)}`);
    exitAfterDrain(2);
  });

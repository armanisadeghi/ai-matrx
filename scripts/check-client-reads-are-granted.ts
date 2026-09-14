/**
 * check-client-reads-are-granted — A SIGNED-IN SCREEN NEVER ASKS FOR WHAT ITS
 * READER MAY NOT HAVE (DD-238).
 *
 * THE CLASS THIS GUARDS
 * ---------------------
 * DD-237 closed the 401 half of `42501 permission denied`: a read that left the
 * browser with no session attached and ran as `anon`. The other half is the 403
 * half — the caller WAS signed in, `authenticated` was the role, and the
 * database still refused. Measured on production over the 48 h to
 * 2026-09-14 15:30Z: 9 rows, 4 relations. Two shapes, and only two:
 *
 *   1. THE GRANT IS MISSING. `ai.provider_sync_candidates` — a
 *      `security_invoker=true` view whose five siblings in the same schema all
 *      carry `authenticated=r`, and which was simply never granted. The admin
 *      screen that was built to read it got 403 on every visit
 *      (`/administration/ai/ai-models/provider-sync`, 2026-09-12). Fixed by
 *      `migrations/dd238_the_sync_candidates_view_reads_like_its_siblings.sql`.
 *
 *   2. THE SCREEN ASKED FOR A WALLED COLUMN. Five live relations run a
 *      DELIBERATE column-grant design: `authenticated` holds SELECT on most
 *      columns and NONE on the ones that are server-only
 *      (`users.integration_connections.vault_secret_key` / `credential_item_id`,
 *      `users.user_secrets.value_encrypted`,
 *      `users.credential_attachments.value_encrypted`,
 *      `docproc.processed_documents.storage_uri`, `files.files.storage_uri` …).
 *      Table-level SELECT is therefore ABSENT, and `select("*")` — or naming one
 *      of those columns — fails with `42501 permission denied for table <t>`,
 *      a message that names the TABLE and never the column. That is exactly
 *      what `features/marketing/google/service.ts` did until 2026-09-12
 *      (commit 3918449ce7): it selected `credential_item_id, vault_secret_key`,
 *      and every connector panel on `/chat` and `/masterwork` was refused.
 *
 * Both shapes are invisible to every other gate in this repo: the SQL is valid,
 * the types are generated from the full row, the tests mock the client, and the
 * failure only exists when a real signed-in browser meets real PostgREST.
 *
 * WHAT THIS GUARD MEASURES
 * ------------------------
 * It reads the LIVE grants (not a checked-in list — a list would drift the day
 * someone re-runs `iam.apply_table_grants`), finds every relation this
 * repository's client code reads where `authenticated` does NOT hold table-level
 * SELECT, and then judges each call site:
 *
 *   FAIL  the relation has ZERO columns granted to `authenticated` and a client
 *         reads it at all — the door is shut and the screen offers it anyway.
 *   FAIL  a read uses `.select("*")` on a walled relation — `*` is every column,
 *         including the walled ones.
 *   FAIL  a read names a walled column.
 *   FAIL  a read's `.select(...)` argument cannot be resolved to a column list.
 *         UNRESOLVED IS NEVER A PASS: a guard that shrugs at the one call site
 *         it cannot read is a guard that goes green on the next defect.
 *
 * A `.update()` / `.insert()` / `.delete()` with no `.select()` is not a read and
 * is not judged here; the same statement WITH a `.select(...)` returns rows and
 * is judged like any other read.
 *
 * Run:  pnpm check:client-reads-granted
 *       pnpm check:client-reads-granted --self-test   (proves it can FAIL)
 * Exit 1 on any violation; exit 2 on unexpected errors, including absent
 * database credentials — a guard that cannot measure says so and never passes.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { connectDirect, DB_VARS, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(__dirname, "..");

/** Client code. `app/api/**` is excluded: those routes run server-side and may
 *  hold a service-role client, so their grants are a different question. */
const SCAN_DIRS = [
  "app",
  "components",
  "features",
  "lib",
  "hooks",
  "providers",
  "utils",
];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "api"]);

/** Schemas Supabase owns; their grants are not ours to judge. */
const FOREIGN_SCHEMAS = [
  "auth",
  "storage",
  "realtime",
  "vault",
  "extensions",
  "graphql",
  "graphql_public",
  "supabase_functions",
  "supabase_migrations",
  "pgsodium",
  "pgsodium_masks",
  "information_schema",
  "pg_catalog",
];

export interface WalledRelation {
  /** `schema.table` as the database spells it. */
  readonly rel: string;
  /** Bare relation name — what `.from("…")` carries. */
  readonly name: string;
  /** Columns `authenticated` may NOT select. */
  readonly withheld: readonly string[];
  /** Columns `authenticated` may select. Empty = the door is shut entirely. */
  readonly granted: readonly string[];
}

export interface ReadSite {
  readonly file: string;
  readonly line: number;
  readonly name: string;
  /** The schema this call site names, when it names one at all. */
  readonly schema: string | null;
  /** The raw `.select(...)` argument text, or null when there is no select. */
  readonly selectArg: string | null;
  /** True when the statement is a write with no returning select. */
  readonly writeOnly: boolean;
}

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rel: string;
  readonly why: string;
  readonly remedy: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// The live measurement
// ─────────────────────────────────────────────────────────────────────────────

const WALL_QUERY = `
select n.nspname || '.' || c.relname                                as rel,
       c.relname                                                    as name,
       coalesce(array_agg(a.attname::text order by a.attnum)
         filter (where has_column_privilege('authenticated', c.oid, a.attname, 'SELECT')),
         '{}'::text[])                                            as granted,
       coalesce(array_agg(a.attname::text order by a.attnum)
         filter (where not has_column_privilege('authenticated', c.oid, a.attname, 'SELECT')),
         '{}'::text[])                                           as withheld
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
 where c.relkind in ('r', 'v', 'm', 'p', 'f')
   and n.nspname <> all ($1::text[])
   and n.nspname not like 'pg\\_%'
   and not has_table_privilege('authenticated', c.oid, 'SELECT')
 group by 1, 2
 order by 1`;

/** Relation NAMES `authenticated` can read in full somewhere in this database —
 *  the set that makes an unqualified `.from("x")` ambiguous rather than damning. */
const READABLE_NAMES_QUERY = `
select distinct c.relname::text as name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('r', 'v', 'm', 'p', 'f')
   and n.nspname <> all ($1::text[])
   and n.nspname not like 'pg\\_%'
   and has_table_privilege('authenticated', c.oid, 'SELECT')`;

export interface LiveGrants {
  readonly walled: WalledRelation[];
  readonly readableNames: Set<string>;
}

export async function readWallMap(): Promise<LiveGrants> {
  const env = loadDbEnv();
  if ("missing" in env) {
    throw new Error(
      `check-client-reads-are-granted cannot measure anything without the database.\n` +
        `  Missing: ${env.missing.join(", ")} (${DB_VARS.length} are needed).\n` +
        `  Looked in: ${env.looked.join(", ") || "(no env file found)"}.\n` +
        `  This guard reads LIVE grants on purpose — a checked-in list drifts the\n` +
        `  moment anyone re-runs iam.apply_table_grants — so it refuses to pass blind.`,
    );
  }
  const client = await connectDirect(env, "check-client-reads-are-granted");
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    const res = await client.query(WALL_QUERY, [FOREIGN_SCHEMAS]);
    const readable = await client.query(READABLE_NAMES_QUERY, [FOREIGN_SCHEMAS]);
    return {
      walled: res.rows.map((r) => ({
        rel: String(r.rel),
        name: String(r.name),
        granted: (r.granted ?? []) as string[],
        withheld: (r.withheld ?? []) as string[],
      })),
      readableNames: new Set(readable.rows.map((r) => String(r.name))),
    };
  } finally {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* the transaction is read-only; a failed rollback changes nothing */
    }
    await client.end();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The source scan
// ─────────────────────────────────────────────────────────────────────────────

/** How far past `.from("x")` a chained `.select(...)` can sit and still belong
 *  to it. Generous on purpose: the longest real chain in this repo (the paged
 *  `readAllRows` callbacks) is ~320 characters. */
const CHAIN_WINDOW = 600;

const WRITE_STARTERS = /^\s*\.\s*(update|insert|upsert|delete)\b/;

/** How far BEFORE `.from("x")` the schema that qualifies it can sit — either
 *  `.schema("docproc")` written out, or the `docprocDb(supabase)` helper that
 *  is the only place this repo names that schema. */
const SCHEMA_WINDOW = 220;

export function collectReadSites(
  files: ReadonlyMap<string, string>,
  names: ReadonlySet<string>,
): ReadSite[] {
  const sites: ReadSite[] = [];
  const helperSchemas = collectSchemaHelpers(files);
  for (const [file, raw] of files) {
    // Comments are blanked IN PLACE — same length, same newlines — so a
    // commented-out call is invisible while every line number stays true.
    const src = blankComments(raw);
    const re = /\.from\(\s*["'`]([a-zA-Z0-9_]+)["'`]\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const name = m[1]!;
      if (!names.has(name)) continue;
      const tail = src.slice(m.index + m[0].length, m.index + m[0].length + CHAIN_WINDOW);
      const line = src.slice(0, m.index).split("\n").length;
      const selectArg = extractSelectArg(tail);
      const writeOnly = WRITE_STARTERS.test(stripComments(tail)) && selectArg === null;
      const head = src.slice(Math.max(0, m.index - SCHEMA_WINDOW), m.index);
      sites.push({
        file,
        line,
        name,
        schema: resolveSchema(head, helperSchemas),
        selectArg,
        writeOnly,
      });
    }
  }
  return sites;
}

/** `const docprocDb = (c) => c.schema("docproc")` → `docprocDb → docproc`. The
 *  repo's own convention (`filesDb`, `docprocDb`, `usersDb`) exists precisely so
 *  the schema is named once; this reads that one place instead of guessing. */
export function collectSchemaHelpers(
  files: ReadonlyMap<string, string>,
): Map<string, string> {
  const out = new Map<string, string>();
  const re =
    /(?:export\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*\([^)]*\)\s*(?::[^=]+)?=>\s*[^;\n]{0,120}?\.schema\(\s*["'`]([a-z_]+)["'`]\s*\)/g;
  for (const src of files.values()) {
    let m: RegExpExecArray | null;
    const scan = new RegExp(re.source, "g");
    while ((m = scan.exec(src)) !== null) out.set(m[1]!, m[2]!);
  }
  return out;
}

/** The schema qualifying a `.from(...)`: the nearest `.schema("x")` before it,
 *  or the schema helper it is chained onto. `null` = the call site did not say. */
export function resolveSchema(
  head: string,
  helpers: ReadonlyMap<string, string>,
): string | null {
  const direct = [...head.matchAll(/\.schema\(\s*["'`]([a-z_]+)["'`]\s*\)/g)].pop();
  const viaHelper = [
    ...head.matchAll(/([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^()]*\)\s*$/g),
  ].pop();
  const helperName = viaHelper?.[1];
  if (direct !== undefined && helperName === undefined) return direct[1]!;
  if (helperName !== undefined && helpers.has(helperName)) return helpers.get(helperName)!;
  if (direct !== undefined) return direct[1]!;
  return null;
}

/** Replace `//` and block comments with spaces of the SAME LENGTH, keeping every
 *  newline, so a commented-out `.select("*")` is invisible to the scan while the
 *  line number of everything after it is still the file's real line number. */
export function blankComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
}

/** Strip comments where offsets do not matter (inside a single chain tail). */
export function stripComments(src: string): string {
  return blankComments(src);
}

/** The text inside the FIRST `.select(` of a chain, balanced to its own closing
 *  paren so a nested `count: "exact"` or an embedded resource is kept whole. */
export function extractSelectArg(tail: string): string | null {
  const code = stripComments(tail);
  const at = code.search(/\.\s*select\s*\(/);
  if (at < 0) return null;
  const open = code.indexOf("(", at);
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const ch = code[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return code.slice(open + 1, i).trim();
    }
  }
  return null;
}

/** `select("a, b")` → ["a","b"]; `select(CONNECTION_SELECT)` → resolved through
 *  the file's own `const` declarations and this repo's imports. Returns null
 *  when the argument cannot be turned into a column list — which is a FAIL,
 *  never a pass. */
export function resolveColumnList(
  arg: string,
  file: string,
  files: ReadonlyMap<string, string>,
): string[] | null {
  // Drop a trailing options object: select(X, { count: "exact" }).
  const firstArg = splitTopLevel(arg)[0]?.trim() ?? "";
  if (firstArg.length === 0) return ["*"]; // select() with no argument is `*`

  const literal = asStringLiteral(firstArg);
  if (literal !== null) return parseSelectString(literal);

  const ident = firstArg.match(/^([A-Za-z_$][A-Za-z0-9_$]*)$/)?.[1];
  if (ident === undefined) return null;

  const fromHere = findConstString(files.get(file) ?? "", ident);
  if (fromHere !== null) return parseSelectString(fromHere);

  // An import of the constant from another module in this repository.
  for (const [other, src] of files) {
    if (other === file) continue;
    if (!new RegExp(`export\\s+const\\s+${ident}\\b`).test(src)) continue;
    const there = findConstString(src, ident);
    if (there !== null) return parseSelectString(there);
  }
  return null;
}

/** Split an argument list on top-level commas (ignoring commas inside strings,
 *  objects, arrays and calls). */
export function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote !== null) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === "," && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

/** A string literal, or several concatenated with `+`. Returns null for
 *  anything else (a template with `${…}`, a call, a ternary). */
export function asStringLiteral(expr: string): string | null {
  // `"a, b" as const` / `as string` is still a literal.
  const bare = expr.replace(/\s+as\s+(const|string)\s*$/, "").trim();
  const parts = bare.split("+").map((p) => p.trim());
  let out = "";
  for (const part of parts) {
    const m = part.match(/^(["'`])([\s\S]*)\1$/);
    if (m === null) return null;
    if (m[1] === "`" && m[2]!.includes("${")) return null;
    out += m[2]!;
  }
  return out;
}

export function findConstString(src: string, ident: string): string | null {
  const re = new RegExp(
    `(?:export\\s+)?const\\s+${ident}\\s*(?::[^=]+)?=\\s*([\\s\\S]{0,4000}?);\\n`,
  );
  const m = src.match(re);
  if (m === null) return null;
  return asStringLiteral(m[1]!.trim());
}

/** PostgREST select syntax → the top-level column names it asks for.
 *  Embedded resources (`folder:folders(id,name)`) are their own relation and are
 *  judged by their own `.from()` call site, so only the embed's NAME is kept. */
export function parseSelectString(sel: string): string[] {
  const cols: string[] = [];
  let depth = 0;
  let token = "";
  const flush = () => {
    const t = token.trim();
    token = "";
    if (t.length === 0) return;
    // `alias:column` → column; `column::text` → column; `a->>b` → a
    const bare = t.split(":").pop()!.split("->")[0]!.trim();
    if (bare.length > 0) cols.push(bare);
  };
  for (const ch of sel) {
    if (ch === "(") {
      depth++;
      if (depth === 1) {
        // The embed's own name was already accumulated; drop its inner columns.
        flush();
        token = "";
        continue;
      }
    }
    if (ch === ")") {
      depth--;
      continue;
    }
    if (depth > 0) continue;
    if (ch === ",") {
      flush();
      continue;
    }
    token += ch;
  }
  flush();
  return cols;
}

// ─────────────────────────────────────────────────────────────────────────────
// The judgement
// ─────────────────────────────────────────────────────────────────────────────

/** A relation NAME can exist in several schemas — `provision` is both
 *  `mandate.provision` (readable) and `graveyard.provision` (shut). Picking the
 *  wrong one is how a guard invents a defect, so a site that names its schema is
 *  matched on the schema, and a site that names none while the name is readable
 *  somewhere else is reported as UNRESOLVED rather than guessed either way. */
export function judge(
  sites: readonly ReadSite[],
  wall: ReadonlyMap<string, WalledRelation[]>,
  files: ReadonlyMap<string, string>,
  readableElsewhere: ReadonlySet<string> = new Set(),
): Violation[] {
  const out: Violation[] = [];
  for (const site of sites) {
    const candidates = wall.get(site.name);
    if (candidates === undefined || candidates.length === 0) continue;

    let rel: WalledRelation | undefined;
    if (site.schema !== null) {
      rel = candidates.find((c) => c.rel.startsWith(`${site.schema}.`));
      if (rel === undefined) continue; // it reads a different schema's relation
    } else if (candidates.length === 1 && !readableElsewhere.has(site.name)) {
      rel = candidates[0];
    } else {
      out.push({
        file: site.file,
        line: site.line,
        rel: candidates.map((c) => c.rel).join(" / "),
        why: `this read names \`${site.name}\` without a schema, and \`${site.name}\` exists in more than one schema — including ${candidates.map((c) => c.rel).join(" and ")}, which \`authenticated\` may not read in full.`,
        remedy: `Qualify the read (\`.schema("…")\`, or the repo's schema helper) so which relation it means is not a guess — for this guard or for the next reader.`,
      });
      continue;
    }

    if (rel.granted.length === 0) {
      out.push({
        file: site.file,
        line: site.line,
        rel: rel.rel,
        why: `${rel.rel} grants \`authenticated\` NOTHING — not one column — and this screen reads it. Every signed-in visitor gets 42501 at HTTP 403.`,
        remedy: `Either grant the read (a migration through \`pnpm db:apply\`, with the access delta measured), or take the read off the screen — the control is absent or says why, never dead.`,
      });
      continue;
    }
    if (site.writeOnly) continue;

    if (site.selectArg === null) {
      out.push({
        file: site.file,
        line: site.line,
        rel: rel.rel,
        why: `a read of ${rel.rel} with no \`.select(...)\` within ${CHAIN_WINDOW} characters. PostgREST defaults to \`*\`, and \`*\` includes the walled column(s): ${rel.withheld.join(", ")}.`,
        remedy: `Name the columns this screen actually needs.`,
      });
      continue;
    }
    const cols = resolveColumnList(site.selectArg, site.file, files);
    if (cols === null) {
      out.push({
        file: site.file,
        line: site.line,
        rel: rel.rel,
        why: `the \`.select(${site.selectArg.slice(0, 60)})\` argument on ${rel.rel} could not be resolved to a column list, so this guard cannot tell whether it asks for a walled column (${rel.withheld.join(", ")}).`,
        remedy: `Make the select list a plain string constant this guard can read — an unmeasurable call site is never a pass.`,
      });
      continue;
    }
    if (cols.includes("*")) {
      out.push({
        file: site.file,
        line: site.line,
        rel: rel.rel,
        why: `\`.select("*")\` on ${rel.rel}, whose column(s) ${rel.withheld.join(", ")} are server-only. \`*\` asks for them and the whole read is refused — 42501, naming the table and never the column.`,
        remedy: `Name the columns this screen needs; the granted set is: ${rel.granted.join(", ")}.`,
      });
      continue;
    }
    const asked = cols.filter((c) => rel.withheld.includes(c));
    if (asked.length > 0) {
      out.push({
        file: site.file,
        line: site.line,
        rel: rel.rel,
        why: `this read names ${asked.join(", ")} on ${rel.rel}; \`authenticated\` holds no SELECT on ${asked.length === 1 ? "that column" : "those columns"}, so the whole read is refused.`,
        remedy: `Drop ${asked.join(", ")} from the select list. If the screen genuinely needs the fact behind ${asked.length === 1 ? "it" : "them"}, publish a generated, client-safe column (the shape \`users.integration_connections.credential_present\` uses) rather than opening the wall.`,
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wiring
// ─────────────────────────────────────────────────────────────────────────────

/** Group the walled relations by bare name — one name, possibly several schemas. */
export function byName(
  relations: readonly WalledRelation[],
): Map<string, WalledRelation[]> {
  const out = new Map<string, WalledRelation[]>();
  for (const r of relations) {
    const bucket = out.get(r.name);
    if (bucket === undefined) out.set(r.name, [r]);
    else bucket.push(r);
  }
  return out;
}

export function loadSources(dirs: readonly string[] = SCAN_DIRS): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if ([".ts", ".tsx"].includes(extname(p)) && !p.includes(".test."))
        files.set(relative(ROOT, p), readFileSync(p, "utf8"));
    }
  };
  for (const d of dirs) walk(join(ROOT, d));
  return files;
}

async function main(): Promise<number> {
  if (process.argv.includes("--self-test")) return selfTest();

  const { walled, readableNames } = await readWallMap();
  const wall = byName(walled);
  const files = loadSources();
  const sites = collectReadSites(files, new Set(wall.keys()));
  const violations = judge(sites, wall, files, readableNames);

  if (violations.length === 0) {
    console.log(
      `check-client-reads-are-granted: OK — ${sites.length} client read(s) touch the ` +
        `${walled.length} relation(s) this database withholds from \`authenticated\`, ` +
        `and every one of them names columns it is allowed to have.`,
    );
    return 0;
  }
  console.error("check-client-reads-are-granted: DD-238 is reopening.\n");
  for (const v of violations) {
    console.error(`- ${v.file}:${v.line}\n  ${v.why}\n  → ${v.remedy}\n`);
  }
  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Self-test — every shape of the defect, proven to FAIL, and the fix to pass.
// The two live shapes use REAL bytes: the pre-fix `ai.provider_sync_candidates`
// wall (no grant at all) against the real `features/ai-models/service.ts`, and
// the pre-fix Google select list that production actually ran until 3918449ce7.
// ─────────────────────────────────────────────────────────────────────────────

function selfTest(): number {
  let failures = 0;
  const check = (name: string, ok: boolean) => {
    console.log(`[self-test] ${ok ? "PASS" : "FAIL"}  ${name}`);
    if (!ok) failures++;
  };

  const walled = (over: Partial<WalledRelation> = {}): WalledRelation => ({
    rel: "users.integration_connections",
    name: "integration_connections",
    granted: ["id", "status", "credential_present"],
    withheld: ["vault_secret_key", "credential_item_id"],
    ...over,
  });
  const run = (src: string, w: WalledRelation, file = "x/y.ts") => {
    const files = new Map([[file, src]]);
    const wall = byName([w]);
    return judge(collectReadSites(files, new Set(wall.keys())), wall, files);
  };

  check(
    "a named, fully granted select passes",
    run(`db.from("integration_connections").select("id, status")`, walled()).length === 0,
  );
  check(
    'select("*") on a walled relation is flagged',
    run(`db.from("integration_connections").select("*")`, walled()).length === 1,
  );
  check(
    "a select naming a walled column is flagged",
    run(
      `db.from("integration_connections").select("id, credential_item_id")`,
      walled(),
    ).length === 1,
  );
  check(
    "a read with no select at all is flagged",
    run(`db.from("integration_connections").eq("id", x)`, walled()).length === 1,
  );
  check(
    "a write with no returning select is not judged",
    run(`db.from("integration_connections").update({ status: "x" }).eq("id", y)`, walled())
      .length === 0,
  );
  check(
    "a write that RETURNS rows is judged",
    run(
      `db.from("integration_connections").update({ status: "x" }).select("*")`,
      walled(),
    ).length === 1,
  );
  check(
    "a select list held in a same-file constant is resolved and passes",
    run(
      `const COLS = "id, status";\ndb.from("integration_connections").select(COLS)`,
      walled(),
    ).length === 0,
  );
  check(
    "a select list held in a same-file constant is resolved and CAUGHT",
    run(
      `const COLS = "id, vault_secret_key";\ndb.from("integration_connections").select(COLS)`,
      walled(),
    ).length === 1,
  );
  check(
    "an unresolvable select expression is flagged, never shrugged off",
    run(
      `db.from("integration_connections").select(buildSelect(kind))`,
      walled(),
    ).length === 1,
  );
  check(
    "a commented-out offender is not a finding",
    run(
      `// db.from("integration_connections").select("*")\nconst k = 1;`,
      walled(),
    ).length === 0,
  );
  check(
    "an embedded resource's inner columns belong to the embed, not this relation",
    run(
      `db.from("integration_connections").select("id, resources:integration_connection_resources(id, vault_secret_key)")`,
      walled(),
    ).length === 0,
  );
  check(
    "a relation with NO granted column is flagged however carefully it is read",
    run(
      `db.from("provider_sync_candidates").select("provider_id")`,
      walled({
        rel: "ai.provider_sync_candidates",
        name: "provider_sync_candidates",
        granted: [],
        withheld: ["provider_id", "model_id"],
      }),
    ).length === 1,
  );

  // ── The two live shapes, against real bytes in this working tree ──────────
  const files = loadSources();

  const preFixView: WalledRelation = {
    rel: "ai.provider_sync_candidates",
    name: "provider_sync_candidates",
    granted: [],
    withheld: ["provider_id", "model_id", "status"],
  };
  const viewWall = byName([preFixView]);
  const viewFindings = judge(
    collectReadSites(files, new Set(viewWall.keys())),
    viewWall,
    files,
  );
  check(
    "LIVE SHAPE 1 — the real admin screen against the pre-migration (ungranted) view FAILS",
    viewFindings.length > 0 &&
      viewFindings.some((v) => v.file.includes("features/ai-models/service.ts")),
  );

  const icWall = byName([walled()]);
  const preFixGoogle = new Map(files);
  const googleFile = "features/marketing/google/service.ts";
  const googleSrc = preFixGoogle.get(googleFile);
  check(
    "LIVE SHAPE 2 — the real Google connector file is present to replay against",
    googleSrc !== undefined,
  );
  if (googleSrc !== undefined) {
    check(
      "LIVE SHAPE 2 — today's Google connector read passes",
      judge(collectReadSites(preFixGoogle, new Set(icWall.keys())), icWall, preFixGoogle)
        .filter((v) => v.file === googleFile).length === 0,
    );
    // The exact select list production ran until commit 3918449ce7.
    preFixGoogle.set(
      googleFile,
      googleSrc.replace(
        /credential_present, credential_stable/,
        "credential_item_id, vault_secret_key",
      ),
    );
    check(
      "LIVE SHAPE 2 — the pre-3918449ce7 Google select list FAILS",
      judge(collectReadSites(preFixGoogle, new Set(icWall.keys())), icWall, preFixGoogle)
        .filter((v) => v.file === googleFile).length === 1,
    );
  }

  if (failures === 0) {
    console.log(
      "[self-test] PASS — the rule fails on every shape of the defect, including the two that happened, and passes on the fix.",
    );
    return 0;
  }
  console.error(`[self-test] ${failures} self-test(s) FAILED`);
  return 1;
}

main()
  .then((code) => exitAfterDrain(code))
  .catch((error) => {
    console.error("check-client-reads-are-granted: unexpected error");
    console.error(error instanceof Error ? error.message : error);
    exitAfterDrain(2);
  });

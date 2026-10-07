/**
 * check:no-old-flexible-store — NOTHING NEW READS OR WRITES THE OLD FLEXIBLE DATA SYSTEM
 * (lane PLATFORM-APP-DATA, 2026-10-02).
 *
 * `platform.flexible_data`, `platform.custom_entity_definition` and `platform.custom_record` are the
 * old flexible data system. Kinds live in `content_ir.kind_definition` / `kind_example` (Arman,
 * 2026-10-02: platform machinery is never kept in the custom record store), and every organization's
 * own data lives in the record store (`custom.*`, through `@ai-matrx/records`). Lane ONE-HOME retires
 * the old tables; until then this guard keeps anyone from adding a reader or writer.
 *
 * It scans this repo AND aidream beside it (`../aidream`), and fails on any source line that reaches
 * one of the three tables:
 *
 *   - SQL naming the table: `platform.flexible_data`, `"platform"."custom_record"` (never the
 *     different `custom_record_mirror`, `custom.record` or `platform._custom_record_guard`)
 *   - a client read: `.from("flexible_data" | "custom_entity_definition" | "custom_record")`
 *   - the table's doors: `flexible_data_write`, `flexible_data_archive`
 *   - Python reaching the generated ORM layer: `db.managers.platform.<table>`, `FlexibleData*`,
 *     `CustomRecord*`, `CustomEntityDefinition*`
 *
 * Comments never count (TS/JS via the store guard's lexer; `#`, `--` and Python docstrings blanked).
 * Out of scope on purpose: ledgered migrations (history), generated schema descriptions
 * (`database.types.ts`, `*.generated.*`, the matrx-orm generated layer in aidream `db/managers`,
 * `db/models`, `db/helpers/auto_config_*`) and the guards that name these tables to police them.
 *
 * ALLOWED is shrink-only: an entry whose file no longer reaches a table fails as STALE until it is
 * removed, so the list empties as lane ONE-HOME retires the tables.
 *
 * THE NEW-TABLE HALF (lane ONE-HOME, wave 5): a migration added after MIGRATION_BASELINE that
 * creates a flexible-data table (a jsonb bag + a generic name or only label columns) outside
 * `custom.*` / `deprecated.*` fails too — see `flexibleCreates`.
 *
 *   pnpm check:no-old-flexible-store                       the tree (both repos)
 *   pnpm check:no-old-flexible-store --frontend-ref <rev>  this repo as of <rev> (proves red on history)
 *   pnpm check:no-old-flexible-store:self-test             planted reaches and tables fail, non-reaches pass
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "./check-no-custom-store-code";

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const AIDREAM = resolve(FRONTEND, "../aidream");

const TABLES = "flexible_data|custom_entity_definition|custom_record";

/** The reach shapes, applied to comment-blanked source. */
export const REACH: ReadonlyArray<{ name: string; re: RegExp; python?: boolean }> = [
  { name: "sql", re: new RegExp(String.raw`\bplatform"?\s*\.\s*"?(?:${TABLES})\b`) },
  { name: "client", re: new RegExp(String.raw`\.from\(\s*["'\`](?:${TABLES})["'\`]\s*\)`) },
  { name: "door", re: /\bflexible_data_(?:write|archive)\b/ },
  // THE OLD NAMES COMING BACK (cleanup 2, 2026-10-07): the table is in `deprecated`, its entity type
  // is inactive, its doors, search projection and registry rows are gone. A quoted `flexible_data`
  // token (reference-kind list, schemaSource union, entity token), a `flexible_data:` registry key
  // or the retired search-sync function in code means someone re-added the name.
  { name: "token", re: /["'`]flexible_data["'`]/ },
  { name: "registry-key", re: /^\s*flexible_data\s*:\s*\{/m },
  { name: "search-sync", re: /\b_search_item_sync_flexible_data\b/ },
  { name: "orm", re: new RegExp(String.raw`\bmanagers\.platform\.(?:${TABLES})\b`), python: true },
  {
    name: "orm",
    re: /\b(?:FlexibleData|CustomRecord|CustomEntityDefinition)(?:Manager|View|DTO|Base)?\b/,
    python: true,
  },
];

/** Cheap pre-filter for `git grep -l` (any file without one of these cannot reach). */
const NEEDLE = "flexible_data|custom_entity_definition|custom_record|FlexibleData|CustomRecord|CustomEntityDefinition";

const SCANNED = /\.(tsx?|mts|cts|mjs|cjs|jsx?|py|sql)$/;

/** Not source that runs: history, generated descriptions, and the guards that police these names. */
export const OUT_OF_SCOPE: ReadonlyArray<RegExp> = [
  /^(?:aidream:)?(?:db\/)?migrations\//, // ledgered DDL — history is never edited
  /^types\/database\.types\.ts$/,
  /^packages\/chat\/src\/host\/db-types\.ts$/,
  /\.generated\./,
  /^aidream:apps\/dashboard\/src\/types\/database\.types\.ts$/,
  /^aidream:apps\/shared\/chat\/src\/host\/db-types\.ts$/,
  /^aidream:db\/(?:managers|models)\//, // matrx-orm generated layer
  /^aidream:db\/helpers\/auto_config_[a-z_]+\.py$/,
  /(?:^|\/)node_modules\//,
  // The guards that name these tables to POLICE them (a guard gated on what it guards stops guarding).
  /^scripts\/check-no-old-flexible-store\.ts$/,
  /^scripts\/lib\/campaign-entry-points\.ts$/,
  /^lib\/knobs\/unifiedDataCampaign\.register\.ts$/,
  /^scripts\/fixtures\/campaign-entry-points\//,
  /^aidream:aidream\/services\/unified_data_campaign\/register\.py$/,
  /^aidream:scripts\/check_context_reads_the_door\.py$/,
  /^aidream:scripts\/check_campaign_entry_points\.py$/,
  /^aidream:scripts\/fixtures\/campaign_entry_points\//,
];

/** The readers and writers that exist today, each with why. Shrink-only. */
export const ALLOWED: Readonly<Record<string, string>> = {
  "features/scopes/utils/__tests__/referenceTypeGroups.test.ts":
    "asserts the retired flexible_data token stays out of the visible reference types",
  "scripts/lib/__tests__/trash-doors.test.ts":
    "a fixture list of trash-door tokens, frozen history of the door census",
};

/**
 * Blank `#` / `--` comments and Python docstrings — a triple-quoted string that opens a line right
 * after a `def`/`class`/block header (`…:`) or at the top of the file. Any other triple-quoted
 * string is code (SQL handed to a driver) and is kept.
 */
export function blankNonCode(file: string, text: string): string {
  if (/\.(tsx?|mts|cts|mjs|cjs|jsx?)$/.test(file)) return stripComments(text);
  const lines = text.split("\n");
  if (file.endsWith(".sql")) return lines.map((l) => l.replace(/--.*$/, "")).join("\n");
  // Python
  const out: string[] = [];
  let doc: string | null = null; // the closing quote of an open docstring
  let str: string | null = null; // the closing quote of an open code string (kept)
  let prev = ""; // the last non-blank code line, trimmed
  for (const line of lines) {
    if (doc) {
      if (line.includes(doc)) {
        out.push(" ".repeat(line.indexOf(doc) + 3) + line.slice(line.indexOf(doc) + 3));
        doc = null;
      } else out.push("");
      continue;
    }
    if (str) {
      out.push(line);
      if (line.includes(str)) str = null;
      continue;
    }
    const opener = line.match(/^\s*[rRbBuU]?("""|''')/);
    if (opener && (prev === "" || prev.endsWith(":"))) {
      const q = opener[1];
      const rest = line.slice(line.indexOf(q) + 3);
      if (!rest.includes(q)) doc = q;
      out.push("");
      continue;
    }
    const code = line.replace(/(^|\s)#.*$/, "$1");
    const tq = code.match(/("""|''')/g);
    if (tq && tq.length % 2 === 1) str = tq[0];
    out.push(code);
    if (code.trim()) prev = code.trim();
  }
  return out.join("\n");
}

export function reaches(file: string, text: string): string[] {
  const python = file.endsWith(".py");
  const hits: string[] = [];
  blankNonCode(file, text)
    .split("\n")
    .forEach((line, i) => {
      for (const r of REACH) {
        if (r.python && !python) continue;
        if (r.re.test(line)) {
          hits.push(`${file}:${i + 1} [${r.name}] ${line.trim().slice(0, 160)}`);
          break;
        }
      }
    });
  return hits;
}

export type Finding = { kind: "new" | "stale"; file: string; says: string };

export function judge(
  files: Map<string, string>,
  scannedPrefixes: string[],
  allowed: Readonly<Record<string, string>> = ALLOWED,
): Finding[] {
  const findings: Finding[] = [];
  const reaching = new Set<string>();
  for (const [file, text] of files) {
    if (OUT_OF_SCOPE.some((re) => re.test(file))) continue;
    const hits = reaches(file, text);
    if (!hits.length) continue;
    reaching.add(file);
    if (!(file in allowed)) for (const h of hits) findings.push({ kind: "new", file, says: h });
  }
  for (const file of Object.keys(allowed)) {
    const prefix = file.startsWith("aidream:") ? "aidream:" : "";
    if (!scannedPrefixes.includes(prefix)) continue; // that repo was not scanned this run
    if (!reaching.has(file)) {
      findings.push({ kind: "stale", file, says: "no longer reaches an old table — remove it from ALLOWED" });
    }
  }
  return findings;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

/** Candidate files (tracked, containing a needle) and their text; at `ref` when given. */
function candidates(cwd: string, prefix: string, ref?: string): Map<string, string> {
  const out = new Map<string, string>();
  let listed: string;
  try {
    listed = git(cwd, ["grep", "-l", "-I", "-E", NEEDLE, ...(ref ? [ref] : []), "--", "."]);
  } catch (error) {
    // git grep exits 1 when nothing matches — that is an empty, measured result.
    if ((error as { status?: number }).status === 1) return out;
    throw error;
  }
  for (const raw of listed.split("\n")) {
    if (!raw) continue;
    const file = ref ? raw.slice(ref.length + 1) : raw;
    if (!SCANNED.test(file)) continue;
    const text = ref ? git(cwd, ["show", `${ref}:${file}`]) : readFileSync(join(cwd, file), "utf8");
    out.set(prefix + file, text);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE NEW-TABLE HALF (lane ONE-HOME, wave 5): no NEW flexible-data table outside `custom.*`.
//
// The three old tables were generic holders whose rows carried their shape in a jsonb bag. The
// record store (`custom.*`) is now the one home for that shape, so a migration that creates another
// such holder anywhere else fails here. Static: every migration `.sql` file in this repo and in
// aidream (tracked or not) that did not exist at the baseline commit below. A `create table
// <schema>.<name> (…)` is red when ALL hold:
//   - the schema is not `custom` or `deprecated` (unqualified = `public`);
//   - a column is `jsonb` and named data / fields / values / record_data / attributes (the bag);
//   - the name says it is a generic holder (FLEXIBLE_NAME), or every column besides the standard
//     bookkeeping ones is a label or the bag (LABEL_BAG): a bag with a label and nothing else.
// A feature's own payload column (`canvas.canvas_scores.data` beside score / canvas_id) is green.
// Files that existed at the baseline are history and are not re-judged.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Migration files that existed at these commits are history (2026-10-03, wave 5 step 1). */
export const MIGRATION_BASELINE = { frontend: "471ff8fcbb", aidream: "4e0b6522ba" } as const;

const MIGRATION_FILE = /(?:^|\/)migrations\/.*\.sql$/;
const ALLOWED_SCHEMAS = new Set(["custom", "deprecated"]);
const BAG_COLUMNS = new Set(["data", "fields", "values", "record_data", "attributes"]);
const FLEXIBLE_NAME = /(flexible|custom_(?:entity|record|object)|dynamic_|generic_|eav|schema_template|_records?$|_entries$)/;
/** Bookkeeping every table carries; never evidence either way. */
const STANDARD_COLUMNS = new Set([
  "id", "created_at", "updated_at", "created_by", "updated_by", "deleted_at", "deleted_by", "archived_at",
  "archived_by", "organization_id", "user_id", "owner_id", "project_id", "version", "is_public", "is_archived",
  "is_active", "metadata", "sort_order", "position",
]);
/** A table whose other columns are all in here is a labelled bag. */
const LABEL_BAG = new Set(["label", "slug", "name", "title", "description", "category_id", "kind", "type", ...BAG_COLUMNS]);

function blankSql(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

function unquote(id: string): string {
  return id.startsWith('"') ? id.slice(1, -1) : id.toLowerCase();
}

/** Split a create-table body on top-level commas. */
function topLevelParts(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of body) {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const CONSTRAINT_START = /^(?:constraint|primary\s+key|unique|check|foreign\s+key|exclude|like)\b/i;
const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const CREATE_TABLE = new RegExp(
  String.raw`\bcreate\s+(?:(?:global|local)\s+)?(?:(?:temp|temporary|unlogged)\s+)?table\s+(?:if\s+not\s+exists\s+)?(${IDENT})(?:\s*\.\s*(${IDENT}))?\s*\(`,
  "gi",
);

/** Every flexible-data-shaped `create table` in one SQL text, as `schema.name: why`. */
export function flexibleCreates(text: string): string[] {
  const sql = blankSql(text);
  const hits: string[] = [];
  for (const m of sql.matchAll(CREATE_TABLE)) {
    const schema = m[2] ? unquote(m[1]) : "public";
    const name = unquote(m[2] ?? m[1]);
    if (/^(?:temp|temporary|pg_temp)$/.test(schema) || /\b(?:temp|temporary)\b/i.test(m[0])) continue;
    if (ALLOWED_SCHEMAS.has(schema)) continue;
    // The column list: from the opening paren to its match.
    let depth = 0;
    let end = -1;
    const open = (m.index ?? 0) + m[0].length - 1;
    for (let i = open; i < sql.length; i++) {
      if (sql[i] === "(") depth++;
      else if (sql[i] === ")" && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end < 0) continue;
    const columns: Array<{ name: string; type: string }> = [];
    for (const part of topLevelParts(sql.slice(open + 1, end))) {
      if (CONSTRAINT_START.test(part)) continue;
      const col = part.match(new RegExp(String.raw`^(${IDENT})\s+([A-Za-z_][A-Za-z0-9_ ]*)`));
      if (col) columns.push({ name: unquote(col[1]), type: col[2].trim().toLowerCase() });
    }
    const bag = columns.find((c) => BAG_COLUMNS.has(c.name) && /^jsonb\b/.test(c.type));
    if (!bag) continue;
    const others = columns.map((c) => c.name).filter((c) => !STANDARD_COLUMNS.has(c));
    const byName = FLEXIBLE_NAME.test(name);
    const labelled = others.every((c) => LABEL_BAG.has(c));
    if (!byName && !labelled) continue;
    hits.push(
      `${schema}.${name}: jsonb bag \`${bag.name}\` + ${byName ? "a generic-holder name" : `only label columns (${others.join(", ")})`}`,
    );
  }
  return hits;
}

/** Migration files present now (tracked and untracked) that were not at the baseline commit. */
function newMigrationFiles(cwd: string, prefix: string, baseline: string): Map<string, string> {
  const out = new Map<string, string>();
  try {
    git(cwd, ["cat-file", "-e", `${baseline}^{commit}`]);
  } catch {
    throw new Error(
      `UNMEASURED: the migration baseline ${baseline} is not in ${cwd} (shallow clone?) — fetch it; the new-table half cannot judge without it`,
    );
  }
  const before = new Set(git(cwd, ["ls-tree", "-r", "--name-only", baseline]).split("\n"));
  const now = git(cwd, ["ls-files", "-co", "--exclude-standard"]).split("\n");
  for (const file of now) {
    if (!file || before.has(file) || !MIGRATION_FILE.test(file) || /(?:^|\/)node_modules\//.test(file)) continue;
    const path = join(cwd, file);
    if (!existsSync(path)) continue; // deleted in the working tree
    out.set(prefix + file, readFileSync(path, "utf8"));
  }
  return out;
}

export function judgeNewTables(files: Map<string, string>): string[] {
  const findings: string[] = [];
  for (const [file, text] of files) for (const h of flexibleCreates(text)) findings.push(`${file} — ${h}`);
  return findings;
}

const TABLE_RED_PLANTS: string[] = [
  "create table platform.flexible_things (id uuid primary key, label text, data jsonb);",
  "create table workbench.custom_object_rows (id uuid, record_data jsonb);",
  "create table if not exists ops.generic_bag (id uuid, fields jsonb, category_id uuid);",
  'CREATE TABLE "crm"."lead_bag" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "name" text NOT NULL, "data" JSONB DEFAULT \'{}\'::jsonb, created_at timestamptz DEFAULT now(), CONSTRAINT lead_bag_name_check CHECK (length(name) > 0));',
];

const TABLE_GREEN_PLANTS: string[] = [
  "create table custom.table_x (id uuid, label text, data jsonb);",
  "create table deprecated.flexible_data (id uuid, label text, data jsonb);",
  "create table canvas.canvas_scores (id uuid primary key, score int, data jsonb, canvas_id uuid, user_id uuid, created_at timestamptz);",
  "-- create table platform.flexible_things (id uuid, label text, data jsonb);\nselect 1;",
  "/* create table ops.generic_bag (id uuid, fields jsonb); */ select 1;",
  "create table platform.flexible_notes (id uuid, label text, data text);",
  "create temporary table generic_bag (id uuid, data jsonb);",
];

const RED_PLANTS: Array<[string, string]> = [
  ["features/x/kinds.ts", 'export const KINDS = ["feature_doc", "flexible_data", "folder"] as const;'],
  ["utils/permissions/registry.ts", "export const R = {\n  flexible_data: {\n    resourceType: \"flexible_data\",\n  },\n};"],
  ["aidream:aidream/services/x/sync.py", "perform = '_search_item_sync_flexible_data'"],
  ["features/x/a.ts", 'const { data } = await supabase.schema("platform").from("flexible_data").select("*");'],
  ["features/x/b.ts", 'await supabase.rpc("flexible_data_write", { p_patch: {} });'],
  ["features/x/c.ts", "const sql = `select * from platform.custom_record where id = $1`;"],
  ["scripts/campaign-tests/new_suite.sql", "insert into platform.custom_entity_definition (id) values (gen_random_uuid());"],
  ["aidream:aidream/services/x/reader.py", "from db.managers.platform.custom_record import CustomRecordManager"],
  ["aidream:aidream/services/x/sql.py", 'ROWS = await conn.fetch("""\n    select id from "platform"."flexible_data"\n""")'],
  ["aidream:aidream/services/x/call.py", 'async def f(conn):\n    """Load rows."""\n    return await conn.fetch(\n        """\n        select * from platform.custom_entity_definition\n        """,\n    )'],
];

const GREEN_PLANTS: Array<[string, string]> = [
  ["features/x/h.ts", "// the flexible_data token and the `flexible_data: {` registry key are retired\nexport const kinds = [\"folder\"];"],
  ["features/x/d.ts", "// the old platform.flexible_data store is retired\nconst x = 1;"],
  ["features/x/e.ts", "/* reads platform.custom_record — never again */\nexport {};"],
  ["aidream:aidream/services/x/doc.py", 'def f():\n    """Reads ``platform.custom_record`` no more."""\n    return 1  # platform.flexible_data was here'],
  ["aidream:matrx-local/mirror.py", "cur.execute('select * from custom_record_mirror')"],
  ["features/x/f.ts", 'await supabase.schema("custom").from("record").select("*");'],
  ["features/x/g.sql", "-- platform.flexible_data is retired\nselect platform._custom_record_guard();"],
  ["types/database.types.ts", 'flexible_data: { Row: {} } // "platform"."flexible_data"'],
  ["migrations/campaign/old.sql", "alter table platform.flexible_data enable row level security;"],
  ["aidream:db/managers/platform/flexible_data.py", "class FlexibleDataManager: ..."],
];

function selfTest(): void {
  let failed = false;
  for (const [file, text] of RED_PLANTS) {
    const found = judge(new Map([[file, text]]), []);
    const ok = found.some((f) => f.kind === "new");
    console.log(`  ${ok ? "RED  " : "MISS "} ${file}`);
    if (!ok) failed = true;
  }
  for (const [file, text] of GREEN_PLANTS) {
    const found = judge(new Map([[file, text]]), []);
    console.log(`  ${found.length ? "FALSE" : "GREEN"} ${file}${found.length ? ` — ${found[0].says}` : ""}`);
    if (found.length) failed = true;
  }
  for (const text of TABLE_RED_PLANTS) {
    const ok = flexibleCreates(text).length > 0;
    console.log(`  ${ok ? "RED  " : "MISS "} new table: ${text.slice(0, 70)}`);
    if (!ok) failed = true;
  }
  for (const text of TABLE_GREEN_PLANTS) {
    const found = flexibleCreates(text);
    console.log(`  ${found.length ? "FALSE" : "GREEN"} new table: ${text.replace(/\n/g, " ").slice(0, 70)}${found.length ? ` — ${found[0]}` : ""}`);
    if (found.length) failed = true;
  }
  // ALLOWED is empty now (wave 5 step 1), so the stale rule is proven on a planted allowance.
  const stale = judge(new Map(), ["aidream:"], { "aidream:aidream/services/x/old_reader.py": "planted" }).filter(
    (f) => f.kind === "stale",
  );
  console.log(`  ${stale.length ? "RED  " : "MISS "} an allowed reader that no longer reaches fails as stale (${stale.length})`);
  if (!stale.length) failed = true;
  if (failed) {
    console.error("✗ self-test FAILED — the guard cannot be trusted");
    process.exit(1);
  }
  console.log(
    `✓ self-test: ${RED_PLANTS.length} planted reaches fail, ${GREEN_PLANTS.length} non-reaches pass, a stale allowance fails; ` +
      `${TABLE_RED_PLANTS.length} planted flexible tables fail, ${TABLE_GREEN_PLANTS.length} non-flexible creates pass`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) {
    selfTest();
  } else {
    const refAt = argv.indexOf("--frontend-ref");
    const ref = refAt >= 0 ? argv[refAt + 1] : undefined;
    const files = candidates(FRONTEND, "", ref);
    const scanned = [""];
    if (existsSync(join(AIDREAM, ".git"))) {
      for (const [k, v] of candidates(AIDREAM, "aidream:")) files.set(k, v);
      scanned.push("aidream:");
    } else {
      console.log(`[WARN] UNMEASURED: ${AIDREAM} is not checked out beside this repo — aidream was NOT scanned.`);
    }
    const findings = judge(files, scanned);
    // The new-table half.
    const migrations = newMigrationFiles(FRONTEND, "", MIGRATION_BASELINE.frontend);
    if (scanned.includes("aidream:")) {
      for (const [k, v] of newMigrationFiles(AIDREAM, "aidream:", MIGRATION_BASELINE.aidream)) migrations.set(k, v);
    }
    const tables = judgeNewTables(migrations);
    if (tables.length) {
      console.log(`✗ ${tables.length} new flexible-data table(s) outside custom.* — one home for an organization's own shapes:`);
      for (const t of tables) console.log(`    [new-table] ${t}`);
      console.log(
        "  Remedy: an organization's own data → the record store (custom.* via @ai-matrx/records); data the app " +
          "relies on → a declared app table (defineAppTable); kinds → content_ir. Give a feature payload its own " +
          "named columns beside the jsonb, or a non-generic name.",
      );
    }
    if (findings.length) {
      console.log(`✗ ${findings.length} finding(s) — the old flexible data system gets no new reader or writer:`);
      for (const f of findings) console.log(`    [${f.kind}] ${f.says}`);
      console.log(
        "  Remedy: kinds → content_ir (features/content-ir/registry/schema-source-kind-tables.ts); an organization's " +
          "own data → the record store through @ai-matrx/records.",
      );
      process.exit(1);
    }
    if (tables.length) process.exit(1);
    console.log(
      `✓ nothing new reaches platform.flexible_data / custom_entity_definition / custom_record ` +
        `(${files.size} candidate files${ref ? ` at ${ref}` : ""}; ${Object.keys(ALLOWED).length} allowed, retiring); ` +
        `no new flexible-data table outside custom.* (${migrations.size} migration files since the baseline)`,
    );
  }
}

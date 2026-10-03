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
 *   pnpm check:no-old-flexible-store                       the tree (both repos)
 *   pnpm check:no-old-flexible-store --frontend-ref <rev>  this repo as of <rev> (proves red on history)
 *   pnpm check:no-old-flexible-store:self-test             planted reaches fail, non-reaches pass
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
  "aidream:packages/matrx-records/matrx_records/movers/flexible_data.py":
    "the mover that copies flexible_data rows into the record store; retires with the table (lane ONE-HOME)",
  "aidream:packages/matrx-records/matrx_records/movers/platform_custom.py":
    "the mover that copies custom_entity_definition / custom_record into the record store; retires with the tables",
  "aidream:packages/matrx-records/tests/test_movers_against_the_main_database.py":
    "the two movers' own test; goes with them",
  "scripts/campaign-tests/doorsonly3_the_three_not_proven_tables.sql":
    "clone proof suite of the old tables' doors; deleted when the tables are dropped",
  "scripts/campaign-tests/w1_org_red.sql": "clone proof suite seeding custom_entity_definition; deleted with the table",
  "scripts/campaign-tests/w1_org_c7.sql": "clone proof suite seeding custom_entity_definition; deleted with the table",
  "scripts/campaign-tests/trashcoverage2_green.sql":
    "clone proof suite archiving through flexible_data_archive; deleted with the door",
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

export function judge(files: Map<string, string>, scannedPrefixes: string[]): Finding[] {
  const findings: Finding[] = [];
  const reaching = new Set<string>();
  for (const [file, text] of files) {
    if (OUT_OF_SCOPE.some((re) => re.test(file))) continue;
    const hits = reaches(file, text);
    if (!hits.length) continue;
    reaching.add(file);
    if (!(file in ALLOWED)) for (const h of hits) findings.push({ kind: "new", file, says: h });
  }
  for (const file of Object.keys(ALLOWED)) {
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

const RED_PLANTS: Array<[string, string]> = [
  ["features/x/a.ts", 'const { data } = await supabase.schema("platform").from("flexible_data").select("*");'],
  ["features/x/b.ts", 'await supabase.rpc("flexible_data_write", { p_patch: {} });'],
  ["features/x/c.ts", "const sql = `select * from platform.custom_record where id = $1`;"],
  ["scripts/campaign-tests/new_suite.sql", "insert into platform.custom_entity_definition (id) values (gen_random_uuid());"],
  ["aidream:aidream/services/x/reader.py", "from db.managers.platform.custom_record import CustomRecordManager"],
  ["aidream:aidream/services/x/sql.py", 'ROWS = await conn.fetch("""\n    select id from "platform"."flexible_data"\n""")'],
  ["aidream:aidream/services/x/call.py", 'async def f(conn):\n    """Load rows."""\n    return await conn.fetch(\n        """\n        select * from platform.custom_entity_definition\n        """,\n    )'],
];

const GREEN_PLANTS: Array<[string, string]> = [
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
  const stale = judge(new Map(), ["aidream:"]).filter((f) => f.kind === "stale");
  console.log(`  ${stale.length ? "RED  " : "MISS "} an allowed reader that no longer reaches fails as stale (${stale.length})`);
  if (!stale.length) failed = true;
  if (failed) {
    console.error("✗ self-test FAILED — the guard cannot be trusted");
    process.exit(1);
  }
  console.log(`✓ self-test: ${RED_PLANTS.length} planted reaches fail, ${GREEN_PLANTS.length} non-reaches pass, a stale allowance fails`);
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
    if (findings.length) {
      console.log(`✗ ${findings.length} finding(s) — the old flexible data system gets no new reader or writer:`);
      for (const f of findings) console.log(`    [${f.kind}] ${f.says}`);
      console.log(
        "  Remedy: kinds → content_ir (features/content-ir/registry/schema-source-kind-tables.ts); an organization's " +
          "own data → the record store through @ai-matrx/records.",
      );
      process.exit(1);
    }
    console.log(
      `✓ nothing new reaches platform.flexible_data / custom_entity_definition / custom_record ` +
        `(${files.size} candidate files${ref ? ` at ${ref}` : ""}; ${Object.keys(ALLOWED).length} allowed, retiring)`,
    );
  }
}

/**
 * check:old-system-unreachable — EVERY CODE PATH THAT STILL REACHES THE OLDER DATA SYSTEM, LISTED
 * (lane FINAL-SWITCH, 2026-09-26; the older tables themselves, owners on every allowed place: lane
 * OLD-READERS-REMOVAL, 2026-10-01).
 *
 * THE OWNER'S WORDS. Arman, 2026-09-26: "Old gone, new in place." Arman, 2026-10-01: "do it right
 * and leave no trace of the old stuff."
 *
 * WHAT COUNTS AS REACHING THE OLDER SYSTEM (code only — comments are not code; strings are):
 *   - TABLE    the six older relations step two moves to the graveyard — `workbench.udt_datasets`,
 *              `udt_dataset_fields`, `udt_dataset_rows`, `udt_dataset_row_versions`,
 *              `udt_structured_lists`, `udt_structured_list_items` — by name (a `.from(…)`, a realtime
 *              filter, a resource token, a SQL string) or, in Python, by their ORM model
 *              (`UdtDatasets`, …). The dataset TEMPLATES tables are not here: the record store's scope
 *              provisioning still reads them, and they move later with the context.* tables.
 *   - WRITE    a quoted older write door — read from the final switch's campaign file itself
 *              (between OLD-WRITE-DOORS-BEGIN/END, so the guard and the press never name different
 *              doors) plus the two older-only doors step two's file c also retires.
 *   - READ     a quoted older read door (the list below).
 *   - MODULE   an import of a module that retires with the older half of the Data tables screen.
 *   - RELATION an older relation of another campaign (`content_ir.kind_instance`, the context.* scope
 *              tables), matched by its own rule.
 *
 * THE BASELINE NAMES AN OWNER FOR EVERY PLACE. `scripts/old-system-unreachable/baseline.json` maps
 * each allowed place (`repo:file door`) to who keeps it and why — the final switch, its undo and step
 * two name the older tables ON PURPOSE until step two runs; the switch's own census names every door
 * to prove it gone. Any place NOT in the baseline fails (a new reader of the older system); a place in
 * it that no longer names its door fails as stale until `--write-baseline` drops it (it never adds);
 * a baseline entry with no owner fails. A new allowed place is added by hand, with its owner, in the
 * same commit as the machinery that needs it — never by the script.
 *
 * NOT SCANNED, on purpose: migration history (`migrations/`, `supabase/`, `scripts/campaign-tests/` —
 * the proofs of ledgered campaign files, history like the files they prove), generated files
 * (database types, `*.generated.ts`, python-generated), tests (`__tests__`, `tests`, `*.test.*`,
 * `test_*.py`), and this guard.
 *
 *   pnpm check:old-system-unreachable                   report + gate
 *   pnpm check:old-system-unreachable --json            the census as JSON
 *   pnpm check:old-system-unreachable --write-baseline  shrink the baseline (never grows it)
 *   pnpm check:old-system-unreachable:self-test         proves every direction on planted fixtures
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

import { codeOnly, codeOnlySelfTest } from "./lib/code-only";

const FRONTEND = resolve(__dirname, "..");
const WORKSPACE = resolve(FRONTEND, "..");
const CAMPAIGN = join(
  FRONTEND,
  "migrations/campaign/finalswitch_one_press_switches_every_organization_and_one_undo_reverses_it.sql",
);
const BASELINE = join(FRONTEND, "scripts/old-system-unreachable/baseline.json");

/** The six older relations step two moves to the graveyard, as names and as aidream ORM models. */
export const OLD_TABLES = [
  "udt_datasets",
  "udt_dataset_fields",
  "udt_dataset_rows",
  "udt_dataset_row_versions",
  "udt_structured_lists",
  "udt_structured_list_items",
] as const;
const OLD_TABLE_MODELS = [
  "UdtDatasets",
  "UdtDatasetFields",
  "UdtDatasetRows",
  "UdtDatasetRowVersions",
  "UdtStructuredLists",
  "UdtStructuredListItems",
] as const;
const TABLE_RE = new RegExp(`\\b(${OLD_TABLES.join("|")})\\b`, "g");
const MODEL_RE = new RegExp(`\\b(${OLD_TABLE_MODELS.join("|")})\\b`, "g");

/** The older READ doors: they answer every moved table with the moved sentence and retire last. */
export const OLD_READ_DOORS = [
  "get_user_tables",
  "udt_list_example_tables",
  "get_full_table",
  "get_table_cell",
  "get_table_column",
  "get_table_row",
  "get_user_table_complete",
  "get_user_table_data_paginated",
  "get_user_table_data_paginated_v2",
  "list_table_columns",
  "list_table_rows",
  "export_user_table_as_csv",
  "udt_column_facets",
  "udt_table_profile",
  "udt_validate_row",
  "list_udt_dataset_templates",
] as const;

/** Older-only doors step two's file c retires beside the press's write list. */
export const EXTRA_WRITE_DOORS = ["create_user_list", "udt_row_words_many"] as const;

/**
 * Old modules (import specifiers) that retired with the older half of the Data tables screen. The
 * `utils/user-table-utls` helpers were folded into `features/data-tables` (lane OLD-READERS-REMOVAL);
 * a re-created import is RED. `components/user-generated-table-data` is NOT here: what is left of it
 * is the Sheet layout over the record store (`UserTableViewer` through `features/data-tables/service.ts`),
 * and the table and door scans above prove it reaches nothing older.
 */
export const OLD_MODULES = ["@/utils/user-table-utls"] as const;

/**
 * Older RELATIONS of other campaigns (coordinator ruling 2026-09-27): `content_ir.kind_instance` is
 * superseded by `custom.record`; its writers go through aidream's per-organization door
 * (`aidream/services/kind_records/routed.py`) or the frontend's
 * `features/content-ir/studio/kind-record-home.ts`.
 *
 * THE OLD SCOPE TABLES (lane SCOPES-READS-WEB, SCOPES-CUTOVER-PLAN step 2.4; SCOPES-WEB-REVERT
 * 2026-09-29): every web read of a scope type / scope / context item goes through the store's
 * `custom.context_*` doors once `scopes/read_from_store` is on; the knob-off old-table reads are in
 * the baseline with their owner. The context schema's REFERENCE tables stay and are not matched.
 */
export const OLD_RELATIONS: ReadonlyArray<{ name: string; re: RegExp; only?: RegExp }> = [
  { name: "content_ir.kind_instance", re: /\.from\(\s*['"`]kind_instance['"`]\s*\)|get_db_model\(\s*['"]KindInstance['"]\s*\)|\bKindInstance\.(?:create|create_item|filter|get|get_or_none|update_where|objects)\b/ },
  {
    name: "context.* scope tables",
    // The web app's own code (matrx-frontend's shipped directories, matrx-extend's src): walks,
    // censuses and seeds under scripts/ read the old tables to VERIFY the store, which is their job.
    only: /^(?:app|features|components|lib|utils|hooks|providers|packages)\/|^src\//,
    re: /contextDb\(|\.schema\(\s*['"`]context['"`]\s*\)(?!\s*\.from\(\s*['"`](?:system_context_item|templates|template_scope_types|template_context_items|user_active_context|context_access_log|scope_door_registry)['"`])|\.from\(\s*['"`](?:scope_types|scopes|context_items|context_item_values|context_value_refs|scope_dataset_instances)['"`]\s*\)/,
  },
];

type Root = { repo: string; dir: string };
const ROOTS: Root[] = [
  { repo: "matrx-frontend", dir: FRONTEND },
  { repo: "matrx-extend", dir: join(WORKSPACE, "matrx-extend", "src") },
  { repo: "aidream", dir: join(WORKSPACE, "aidream", "aidream") },
  { repo: "aidream", dir: join(WORKSPACE, "aidream", "packages") },
  { repo: "aidream", dir: join(WORKSPACE, "aidream", "user_data") },
  { repo: "aidream", dir: join(WORKSPACE, "aidream", "apps") },
  { repo: "matrx-local", dir: join(WORKSPACE, "matrx-local", "app") },
  { repo: "matrx-local", dir: join(WORKSPACE, "matrx-local", "desktop", "src") },
  { repo: "matrx-sandbox", dir: join(WORKSPACE, "matrx-sandbox", "orchestrator") },
  { repo: "matrx-sandbox", dir: join(WORKSPACE, "matrx-sandbox", "sandbox-image") },
];

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", ".venv", "dist", "build", "coverage", ".turbo", "work", ".wt",
  "migrations", "supabase", "__tests__", "tests", "python-generated", "_generated", "__pycache__", "tmp",
  "campaign-tests",
]);
const FILE_RE = /\.(tsx?|mjs|cjs|js|py)$/;
const SKIP_FILE_RE = /(\.test\.|\.spec\.|database\.types\.ts$|\.generated\.ts$|\/test_[^/]+\.py$|_test\.py$|\/conftest\.py$)/;
/** This guard and its lexer (whose self-test names the tables) are not callers. */
const SELF = new Set(["scripts/check-old-system-unreachable.ts", "scripts/lib/code-only.ts"]);

export function writeDoorsFromCampaign(sql: string): string[] {
  const begin = sql.indexOf("-- OLD-WRITE-DOORS-BEGIN");
  const end = sql.indexOf("-- OLD-WRITE-DOORS-END");
  if (begin < 0 || end < begin) throw new Error("the campaign file carries no OLD-WRITE-DOORS markers");
  const names = [...sql.slice(begin, end).matchAll(/'public\.([a-z_0-9]+)\(/g)].map((m) => m[1]!);
  if (names.length === 0) throw new Error("the campaign file's OLD-WRITE-DOORS list is empty");
  return [...new Set(names)].sort();
}

export type Hit = { repo: string; file: string; line: number; door: string; kind: "table" | "write" | "read" | "module" | "relation" };

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (FILE_RE.test(name) && !SKIP_FILE_RE.test(full.split(sep).join("/"))) out.push(full);
  }
}

export function scan(roots: Root[], writeDoors: readonly string[], readDoors: readonly string[], modules: readonly string[]): Hit[] {
  const hits: Hit[] = [];
  const doorRes = [
    ...writeDoors.map((d) => ({ door: d, kind: "write" as const, re: new RegExp(`['"\`]${d}['"\`]`) })),
    ...readDoors.map((d) => ({ door: d, kind: "read" as const, re: new RegExp(`['"\`]${d}['"\`]`) })),
  ];
  const modRes = modules.map((m) => ({
    door: m,
    kind: "module" as const,
    re: new RegExp(`from\\s+['"]${m.replace(/[/.@-]/g, (c) => `\\${c}`)}(?:/[^'"]*)?['"]|import\\(\\s*['"]${m.replace(/[/.@-]/g, (c) => `\\${c}`)}`),
  }));
  for (const root of roots) {
    const files: string[] = [];
    walk(root.dir, files);
    for (const f of files) {
      // matrx-frontend's one root IS the repository (FRONTEND), or the self-test's planted checkout.
      const rel = relative(root.repo === "matrx-frontend" ? root.dir : join(WORKSPACE, root.repo), f).split(sep).join("/");
      if (root.repo === "matrx-frontend" && SELF.has(rel)) continue;
      const code = codeOnly(f, readFileSync(f, "utf8"));
      const isPy = f.endsWith(".py");
      code.split("\n").forEach((line, i) => {
        if (!line.trim()) return;
        const at = (door: string, kind: Hit["kind"]) => hits.push({ repo: root.repo, file: rel, line: i + 1, door, kind });
        for (const m of line.matchAll(TABLE_RE)) at(`workbench.${m[1]}`, "table");
        if (isPy) for (const m of line.matchAll(MODEL_RE)) at(`workbench.${OLD_TABLES[OLD_TABLE_MODELS.indexOf(m[1] as (typeof OLD_TABLE_MODELS)[number])]}`, "table");
        for (const d of doorRes) if (d.re.test(line)) at(d.door, d.kind);
        for (const m of modRes) if (m.re.test(line)) at(m.door, m.kind);
        for (const r of OLD_RELATIONS) if ((!r.only || (root.repo !== "aidream" && r.only.test(rel))) && r.re.test(line)) at(r.name, "relation");
      });
    }
  }
  return hits;
}

/** A census key is file + door (line numbers move; the fact is "this file names this door"). */
function key(h: Pick<Hit, "repo" | "file" | "door">): string {
  return `${h.repo}:${h.file} ${h.door}`;
}

/** Each allowed place and its owner: "<OWNER>: <why this place may still name it>". */
export type Baseline = Record<string, string>;

type Verdict = { newPlaces: string[]; stale: string[]; ownerless: string[]; census: Record<string, Hit[]> };

export function judge(hits: Hit[], baseline: Baseline): Verdict {
  const present = new Set(hits.map(key));
  const census: Record<string, Hit[]> = {};
  for (const h of hits) (census[h.door] ??= []).push(h);
  return {
    newPlaces: [...present].filter((k) => !(k in baseline)).sort(),
    stale: Object.keys(baseline).filter((k) => !present.has(k)).sort(),
    ownerless: Object.entries(baseline)
      .filter(([, owner]) => !/^[A-Z][A-Z0-9-]+: \S/.test(owner ?? ""))
      .map(([k]) => k)
      .sort(),
    census,
  };
}

function readBaseline(): Baseline {
  if (!existsSync(BASELINE)) return {};
  const raw = JSON.parse(readFileSync(BASELINE, "utf8")) as { entries: Baseline | string[] };
  if (Array.isArray(raw.entries)) return Object.fromEntries(raw.entries.map((k) => [k, ""]));
  return raw.entries;
}

function report(v: Verdict, baseline: Baseline): void {
  const doors = Object.keys(v.census).sort();
  const files = new Set(Object.values(v.census).flat().map((h) => `${h.repo}:${h.file}`));
  console.log(`OLD SYSTEM UNREACHABLE — ${files.size} files still name ${doors.length} older tables, doors or modules\n`);
  for (const d of doors) {
    const hs = v.census[d]!;
    const byFile = new Map<string, number[]>();
    for (const h of hs) byFile.set(`${h.repo}:${h.file}`, [...(byFile.get(`${h.repo}:${h.file}`) ?? []), h.line]);
    console.log(`  ${d} (${hs[0]!.kind}) — ${byFile.size} file(s)`);
    for (const [f, ls] of [...byFile].sort()) {
      const owner = baseline[`${f} ${d}`];
      console.log(`      ${f}:${[...new Set(ls)].join(",")}${owner ? `   [${owner.split(":")[0]}]` : ""}`);
    }
  }
  if (v.newPlaces.length) {
    console.log(`\n✗ ${v.newPlaces.length} NEW place(s) reach the older system — move them to the record store's doors instead:`);
    for (const k of v.newPlaces) console.log(`    ${k}`);
  }
  if (v.stale.length) {
    console.log(`\n✗ ${v.stale.length} baseline entr(ies) no longer reach their door — good; shrink it: pnpm check:old-system-unreachable --write-baseline`);
    for (const k of v.stale) console.log(`    ${k}`);
  }
  if (v.ownerless.length) {
    console.log(`\n✗ ${v.ownerless.length} baseline entr(ies) name no owner — write "<OWNER>: <why>" for each:`);
    for (const k of v.ownerless) console.log(`    ${k}`);
  }
  if (!v.newPlaces.length && !v.stale.length && !v.ownerless.length) {
    const owners = new Map<string, number>();
    for (const o of Object.values(baseline)) owners.set(o.split(":")[0]!, (owners.get(o.split(":")[0]!) ?? 0) + 1);
    console.log(`\n✓ no new path to the older system; the baseline is exact (${Object.keys(baseline).length} places: ${[...owners].map(([o, n]) => `${o} ${n}`).join(", ")}).`);
  }
}

function writeBaseline(next: Baseline): void {
  mkdirSync(join(FRONTEND, "scripts/old-system-unreachable"), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        about:
          "check:old-system-unreachable baseline — every place that may still name an older table, door or module, with its owner and why. It only shrinks; a new place is added by hand with its owner (lane OLD-READERS-REMOVAL).",
        entries: sorted,
      },
      null,
      2,
    ) + "\n",
  );
}

function selfTest(): number {
  const dir = mkdtempSync(join(tmpdir(), "old-system-unreachable-"));
  try {
    const roots = [{ repo: "matrx-frontend", dir }];
    const doors = { write: ["udt_bulk_write", ...EXTRA_WRITE_DOORS], read: ["get_full_table"], modules: ["@/components/user-generated-table-data"] };
    const run = () => scan(roots, doors.write, doors.read, doors.modules);
    mkdirSync(join(dir, "features"), { recursive: true });
    mkdirSync(join(dir, "scripts/campaign-tests"), { recursive: true });
    // 1. An older door, an old module, a direct older-table read, a realtime filter on one, and the
    //    older list maker are each RED.
    writeFileSync(join(dir, "features/old.ts"), 'await supabase.rpc("udt_bulk_write", {});\nimport X from "@/components/user-generated-table-data/TableCards";\n');
    writeFileSync(join(dir, "features/table.ts"), 'await supabase.schema("workbench").from("udt_structured_list_items").select("*");\n');
    writeFileSync(join(dir, "features/feed.ts"), 'channel.on("postgres_changes", { schema: "workbench", table: "udt_dataset_rows" }, f);\n');
    writeFileSync(join(dir, "features/list.ts"), 'await supabase.rpc("create_user_list", {});\n');
    writeFileSync(join(dir, "features/model.py"), "rows = await UdtDatasetRows.filter(table_id=t).all()\n");
    // 2. Not the older system: a store door, a comment, a docstring, the templates table, a proof
    //    of a ledgered campaign file.
    writeFileSync(join(dir, "features/new.ts"), 'await supabase.schema("custom").rpc("record_write", {});\n// this used to read udt_datasets\n/* udt_dataset_rows\n   udt_bulk_write */\nconst t = "udt_dataset_templates";\n');
    writeFileSync(join(dir, "features/doc.py"), '"""Reads what udt_datasets held."""\n# UdtDatasets moved\ndef f():\n    """UdtDatasetRows here."""\n    return 1\n');
    writeFileSync(join(dir, "scripts/campaign-tests/x_green.mjs"), 'await db.rpc("udt_bulk_write");\n');
    const planted = judge(run(), {});
    const want = [
      "matrx-frontend:features/feed.ts workbench.udt_dataset_rows",
      "matrx-frontend:features/list.ts create_user_list",
      "matrx-frontend:features/model.py workbench.udt_dataset_rows",
      "matrx-frontend:features/old.ts @/components/user-generated-table-data",
      "matrx-frontend:features/old.ts udt_bulk_write",
      "matrx-frontend:features/table.ts workbench.udt_structured_list_items",
    ];
    if (planted.newPlaces.join() !== want.join()) throw new Error(`RED expected ${want}, got ${planted.newPlaces}`);
    // 3. A "/*" inside a string (a glob) never hides the code after it (the registry.ts false green).
    writeFileSync(join(dir, "features/glob.ts"), 'const g = "src/**/*.ts";\nconst entry = { tableName: "udt_datasets" };\n');
    if (!judge(run(), {}).newPlaces.includes("matrx-frontend:features/glob.ts workbench.udt_datasets")) throw new Error("a glob string hid the code after it");
    rmSync(join(dir, "features/glob.ts"));
    const lexer = codeOnlySelfTest();
    if (lexer.length) throw new Error(`the code-only lexer: ${lexer.join("; ")}`);
    // 4. Line numbers survive a block comment.
    writeFileSync(join(dir, "features/lines.ts"), '/*\n a\n b\n*/\nconst x = "udt_datasets";\n');
    const line = run().find((h) => h.file === "features/lines.ts")?.line;
    if (line !== 5) throw new Error(`a block comment must keep line numbers; got ${line}`);
    rmSync(join(dir, "features/lines.ts"));
    // 5. The baseline with owners makes it GREEN; an entry with no owner is RED.
    const owned = Object.fromEntries(want.map((k) => [k, "FINAL-SWITCH: planted for the self-test"]));
    const allowed = judge(run(), owned);
    if (allowed.newPlaces.length || allowed.stale.length || allowed.ownerless.length) throw new Error("GREEN expected with an owned baseline");
    const unowned = judge(run(), { ...owned, [want[0]!]: "" });
    if (unowned.ownerless.join() !== want[0]) throw new Error("an entry with no owner must be RED");
    // 6. A removed read is STALE.
    writeFileSync(join(dir, "features/table.ts"), 'await supabase.schema("custom").rpc("choice_options", {});\n');
    const moved = judge(run(), owned);
    if (moved.stale.join() !== "matrx-frontend:features/table.ts workbench.udt_structured_list_items") throw new Error(`STALE expected, got ${moved.stale}`);
    // 7. THE OLD SCOPE TABLES (lane SCOPES-READS-WEB): a web read of a leaving context table is RED;
    //    a read of the context schema's reference data, and a verification walk under scripts/, are not.
    writeFileSync(join(dir, "features/scopeRead.ts"), 'await supabase.schema("context").from("scopes").select("id");\n');
    writeFileSync(join(dir, "features/scopeRead2.ts"), "const db = contextDb(supabase);\n");
    writeFileSync(join(dir, "features/reference.ts"), 'await admin.schema("context").from("system_context_item").select("*");\n');
    writeFileSync(join(dir, "scripts/walk.mjs"), 'await db.schema("context").from("scopes").select("id");\n');
    const ctx = judge(scan(roots, [], [], []), {}).newPlaces.filter((k) => k.endsWith("context.* scope tables")).sort();
    const wantCtx = ["matrx-frontend:features/scopeRead.ts context.* scope tables", "matrx-frontend:features/scopeRead2.ts context.* scope tables"];
    if (ctx.join() !== wantCtx.join()) throw new Error(`context scope tables: expected ${wantCtx}, got ${ctx}`);
    // 8. The press's write list is read from the campaign file.
    const sql = "x\n    -- OLD-WRITE-DOORS-BEGIN\n    'public.udt_bulk_write(uuid, jsonb)',\n    -- OLD-WRITE-DOORS-END\n";
    if (writeDoorsFromCampaign(sql).join() !== "udt_bulk_write") throw new Error("campaign list not read");
    console.log(
      "✓ self-test: an older door, module, table read, realtime filter, ORM model and the older list maker are RED; a store door, comments, docstrings, the templates table and campaign proofs are not; a glob string hides nothing; line numbers survive block comments; an owned baseline is GREEN, an owner-less entry RED, a removed read STALE; old scope-table web reads RED; the press's list is read from the campaign file",
    );
    return 0;
  } catch (e) {
    console.error(`✗ self-test: ${(e as Error).message}`);
    return 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) return selfTest();
  const writeDoors = [...writeDoorsFromCampaign(readFileSync(CAMPAIGN, "utf8")), ...EXTRA_WRITE_DOORS];
  const hits = scan(ROOTS, writeDoors, OLD_READ_DOORS, OLD_MODULES);
  const baseline = readBaseline();
  const v = judge(hits, baseline);
  if (argv.includes("--write-baseline")) {
    if (v.newPlaces.length) {
      console.error(`✗ --write-baseline only shrinks the baseline; ${v.newPlaces.length} new place(s) must move to the record store instead (or be added by hand with an owner):`);
      for (const k of v.newPlaces) console.error(`    ${k}`);
      return 1;
    }
    const next = Object.fromEntries(Object.entries(baseline).filter(([k]) => !v.stale.includes(k)));
    writeBaseline(next);
    console.log(`baseline written: ${Object.keys(next).length} places (${v.stale.length} dropped)`);
    return 0;
  }
  if (argv.includes("--json")) {
    process.stdout.write(JSON.stringify({ writeDoors, readDoors: OLD_READ_DOORS, tables: OLD_TABLES, modules: OLD_MODULES, ...v }, null, 2) + "\n");
    return v.newPlaces.length || v.stale.length || v.ownerless.length ? 1 : 0;
  }
  report(v, baseline);
  return v.newPlaces.length || v.stale.length || v.ownerless.length ? 1 : 0;
}

process.exitCode = main();

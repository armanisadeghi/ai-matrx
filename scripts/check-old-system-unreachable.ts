/**
 * check:old-system-unreachable — EVERY CODE PATH THAT STILL REACHES AN OLD DOOR, LISTED (lane
 * FINAL-SWITCH, 2026-09-26).
 *
 * THE OWNER'S WORDS (Arman, 2026-09-26): "We will switch everything over once we know it works and
 * it's done. Old gone, new in place."
 *
 * "Old gone" has two halves. The final switch (migrations/campaign/finalswitch_*.sql) closes the
 * older WRITE doors to every browser at the press, through the door registry. The older READ doors
 * and the old modules retire later, in the retirement window, and only once nothing calls them.
 * This guard is what makes "nothing calls them" a fact instead of a hope:
 *
 *   - It reads the WRITE doors from the campaign file itself (between OLD-WRITE-DOORS-BEGIN/END),
 *     so the guard and the press can never name different doors.
 *   - It names the READ doors and OLD MODULES below (the retirement plan's list, PROGRESS-FINAL-SWITCH).
 *   - It scans matrx-frontend, matrx-extend (src) and aidream (aidream/, packages/) for every place
 *     that names one — a quoted door name (an RPC call, a door map, a registry), or an import of an
 *     old module — and prints them grouped by door, with file:line.
 *   - THE CENSUS ONLY SHRINKS. `scripts/old-system-unreachable/baseline.json` holds every place that
 *     named an old door when the guard landed. A place NOT in it fails (new code reaching an old
 *     door); a place in it that no longer names the door fails as stale until it is removed with
 *     `--write-baseline` (which refuses to add). So the list can only get shorter, and it reaches
 *     zero before the retirement window revokes the read doors and deletes the modules.
 *
 *   pnpm check:old-system-unreachable              report + gate
 *   pnpm check:old-system-unreachable --json       the census as JSON
 *   pnpm check:old-system-unreachable --write-baseline   shrink the census (never grows it)
 *   pnpm check:old-system-unreachable:self-test    proves both directions on planted fixtures
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

const FRONTEND = resolve(__dirname, "..");
const WORKSPACE = resolve(FRONTEND, "..");
const CAMPAIGN = join(
  FRONTEND,
  "migrations/campaign/finalswitch_one_press_switches_every_organization_and_one_undo_reverses_it.sql",
);
const BASELINE = join(FRONTEND, "scripts/old-system-unreachable/baseline.json");

/** The older READ doors: they answer every moved table with its pointer and retire last. */
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

/** Old modules (import specifiers) that retire with the older half of the Data tables screen. */
export const OLD_MODULES = [
  "@/components/user-generated-table-data",
  "@/utils/user-table-utls",
] as const;

/**
 * Older RELATIONS whose direct readers and writers the switch retires (coordinator ruling
 * 2026-09-27): `content_ir.kind_instance` is superseded by `custom.record`; its writers go through
 * aidream's per-organization door (`aidream/services/kind_records/routed.py`) or the frontend's
 * `features/content-ir/studio/kind-record-home.ts`. Matched as a table read in TS (`.from("kind_instance")`)
 * or the generated model in Python (`get_db_model("KindInstance")`, `KindInstance.`).
 */
export const OLD_RELATIONS = [
  { name: "content_ir.kind_instance", re: /\.from\(\s*['"`]kind_instance['"`]\s*\)|get_db_model\(\s*['"]KindInstance['"]\s*\)|\bKindInstance\.(?:create|create_item|filter|get|get_or_none|update_where|objects)\b/ },
] as const;

type Root = { repo: string; dir: string };
const ROOTS: Root[] = [
  { repo: "matrx-frontend", dir: FRONTEND },
  { repo: "matrx-extend", dir: join(WORKSPACE, "matrx-extend", "src") },
  { repo: "aidream", dir: join(WORKSPACE, "aidream", "aidream") },
  { repo: "aidream", dir: join(WORKSPACE, "aidream", "packages") },
];

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", ".venv", "dist", "build", "coverage", ".turbo", "work", ".wt",
  "migrations", "supabase", "__tests__", "tests", "python-generated", "_generated", "__pycache__", "tmp",
]);
const FILE_RE = /\.(tsx?|mjs|cjs|js|py)$/;
const SKIP_FILE_RE = /(\.test\.|\.spec\.|database\.types\.ts$|\.generated\.ts$|\/test_[^/]+\.py$)/;
/** This guard, and the campaign file it reads, are not callers. */
const SELF = new Set(["scripts/check-old-system-unreachable.ts"]);

export function writeDoorsFromCampaign(sql: string): string[] {
  const begin = sql.indexOf("-- OLD-WRITE-DOORS-BEGIN");
  const end = sql.indexOf("-- OLD-WRITE-DOORS-END");
  if (begin < 0 || end < begin) throw new Error("the campaign file carries no OLD-WRITE-DOORS markers");
  const names = [...sql.slice(begin, end).matchAll(/'public\.([a-z_0-9]+)\(/g)].map((m) => m[1]!);
  if (names.length === 0) throw new Error("the campaign file's OLD-WRITE-DOORS list is empty");
  return [...new Set(names)].sort();
}

type Hit = { repo: string; file: string; line: number; door: string; kind: "write" | "read" | "module" | "relation" };

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

export function scan(roots: Root[], writeDoors: string[], readDoors: readonly string[], modules: readonly string[]): Hit[] {
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
      const rel = relative(root.repo === "matrx-frontend" ? FRONTEND : join(WORKSPACE, root.repo), f).split(sep).join("/");
      if (root.repo === "matrx-frontend" && SELF.has(rel)) continue;
      const text = readFileSync(f, "utf8");
      if (!doorRes.some((d) => d.re.test(text)) && !modRes.some((m) => m.re.test(text)) && !OLD_RELATIONS.some((r) => r.re.test(text))) continue;
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        for (const d of doorRes) if (d.re.test(line)) hits.push({ repo: root.repo, file: rel, line: i + 1, door: d.door, kind: d.kind });
        for (const m of modRes) if (m.re.test(line)) hits.push({ repo: root.repo, file: rel, line: i + 1, door: m.door, kind: m.kind });
        for (const r of OLD_RELATIONS) if (r.re.test(line)) hits.push({ repo: root.repo, file: rel, line: i + 1, door: r.name, kind: "relation" });
      });
    }
  }
  return hits;
}

/** A census key is file + door (line numbers move; the fact is "this file names this door"). */
function key(h: Pick<Hit, "repo" | "file" | "door">): string {
  return `${h.repo}:${h.file} ${h.door}`;
}

type Verdict = { newPlaces: string[]; stale: string[]; census: Record<string, Hit[]> };

export function judge(hits: Hit[], baseline: string[]): Verdict {
  const present = new Set(hits.map(key));
  const allowed = new Set(baseline);
  const census: Record<string, Hit[]> = {};
  for (const h of hits) (census[h.door] ??= []).push(h);
  return {
    newPlaces: [...present].filter((k) => !allowed.has(k)).sort(),
    stale: [...allowed].filter((k) => !present.has(k)).sort(),
    census,
  };
}

function report(v: Verdict, writeDoors: string[]): void {
  const doors = Object.keys(v.census).sort();
  const files = new Set(Object.values(v.census).flat().map((h) => `${h.repo}:${h.file}`));
  console.log(`OLD SYSTEM UNREACHABLE — ${files.size} files still name ${doors.length} old doors or modules`);
  console.log(`  write doors (closed to browsers at the final switch): ${writeDoors.length}; read doors and modules retire when their list is empty\n`);
  for (const d of doors) {
    const hs = v.census[d]!;
    const kind = hs[0]!.kind;
    const byFile = new Map<string, number[]>();
    for (const h of hs) byFile.set(`${h.repo}:${h.file}`, [...(byFile.get(`${h.repo}:${h.file}`) ?? []), h.line]);
    console.log(`  ${d} (${kind}) — ${byFile.size} file(s)`);
    for (const [f, ls] of [...byFile].sort()) console.log(`      ${f}:${ls.join(",")}`);
  }
  if (v.newPlaces.length) {
    console.log(`\n✗ ${v.newPlaces.length} NEW place(s) reach an old door — move them to the new store (records doors) instead:`);
    for (const k of v.newPlaces) console.log(`    ${k}`);
  }
  if (v.stale.length) {
    console.log(`\n✗ ${v.stale.length} census entr(ies) no longer reach their door — good; shrink the census: pnpm check:old-system-unreachable --write-baseline`);
    for (const k of v.stale) console.log(`    ${k}`);
  }
  if (!v.newPlaces.length && !v.stale.length) console.log(`\n✓ no new path to an old door; the census is exact (${new Set(Object.values(v.census).flat().map(key)).size} entries).`);
}

function selfTest(): number {
  const dir = mkdtempSync(join(tmpdir(), "old-system-unreachable-"));
  try {
    mkdirSync(join(dir, "features"), { recursive: true });
    writeFileSync(join(dir, "features/old.ts"), 'await supabase.rpc("udt_bulk_write", {});\nimport X from "@/components/user-generated-table-data/TableCards";\n');
    writeFileSync(join(dir, "features/new.ts"), 'await supabase.schema("custom").rpc("record_write", {});\n');
    const roots = [{ repo: "matrx-frontend", dir }];
    const hits = scan(roots, ["udt_bulk_write"], ["get_full_table"], ["@/components/user-generated-table-data"]);
    const planted = judge(hits, []);
    if (planted.newPlaces.length !== 2) throw new Error(`RED expected 2 new places, got ${planted.newPlaces.length}: ${planted.newPlaces}`);
    const allowed = judge(hits, planted.newPlaces);
    if (allowed.newPlaces.length || allowed.stale.length) throw new Error("GREEN expected with the census");
    writeFileSync(join(dir, "features/old.ts"), "// moved to the new store\n");
    const moved = judge(scan(roots, ["udt_bulk_write"], ["get_full_table"], ["@/components/user-generated-table-data"]), planted.newPlaces);
    if (moved.stale.length !== 2) throw new Error("STALE expected when the old call is gone");
    const sql = "x\n    -- OLD-WRITE-DOORS-BEGIN\n    'public.udt_bulk_write(uuid, jsonb)',\n    -- OLD-WRITE-DOORS-END\n";
    if (writeDoorsFromCampaign(sql).join() !== "udt_bulk_write") throw new Error("campaign list not read");
    console.log("✓ self-test: a new call to an old door is RED, the census makes it GREEN, a removed call is STALE, the press's list is read from the campaign file");
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
  const writeDoors = writeDoorsFromCampaign(readFileSync(CAMPAIGN, "utf8"));
  const hits = scan(ROOTS, writeDoors, OLD_READ_DOORS, OLD_MODULES);
  const baseline: string[] = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")).entries : [];
  const v = judge(hits, baseline);
  if (argv.includes("--write-baseline")) {
    const next = baseline.length === 0 ? [...new Set(hits.map(key))].sort() : baseline.filter((k) => !v.stale.includes(k));
    if (baseline.length > 0 && v.newPlaces.length) {
      console.error(`✗ --write-baseline only shrinks the census; ${v.newPlaces.length} new place(s) must move to the new store instead.`);
      return 1;
    }
    mkdirSync(join(FRONTEND, "scripts/old-system-unreachable"), { recursive: true });
    writeFileSync(
      BASELINE,
      JSON.stringify({ about: "check:old-system-unreachable census — every place that names an old door; it only shrinks (lane FINAL-SWITCH).", entries: next }, null, 2) + "\n",
    );
    console.log(`census written: ${next.length} entries`);
    return 0;
  }
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ writeDoors, readDoors: OLD_READ_DOORS, modules: OLD_MODULES, ...v }, null, 2));
    return v.newPlaces.length || v.stale.length ? 1 : 0;
  }
  report(v, writeDoors);
  return v.newPlaces.length || v.stale.length ? 1 : 0;
}

process.exit(main());

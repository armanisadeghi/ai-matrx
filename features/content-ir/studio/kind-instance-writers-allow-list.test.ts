/**
 * GUARD 2 (a), web leg — no new writer of the retired store `content_ir.kind_instance`.
 *
 * KINDS-GLUE wave 5, slice 5.0 (common-docs
 * `projects/data-doctrine-adoption/v6/KINDS-GLUE-WAVES45-DESIGN.md` §B.1, §B.10). The server
 * leg is aidream's `scripts/check_kind_instance_writers.py`.
 *
 * `content_ir.kind_instance` is superseded by the record store. Every web writer that still
 * exists is in `ALLOWED`, file by file, with its number of write sites. The list only SHRINKS:
 * wave 2 slices 3 and 8 and wave 5 slice 5.1 remove writers, and each removal takes its line
 * out in the same change.
 *
 * A write site is
 *   - a `.from("kind_instance")` chain (up to the end of its statement) that calls
 *     `.insert(` / `.update(` / `.upsert(` / `.delete(`;
 *   - an `.rpc("…")` of one of the five database functions that write the table;
 *   - `INSERT INTO` / `UPDATE` / `DELETE FROM content_ir.kind_instance` in a `.sql` file.
 *
 * It fails on a file not on the list that writes (a new writer), on more sites than allowed
 * (a new write in an old writer), and on FEWER sites than allowed or a missing file (a stale
 * allowance would silently admit the next writer — shrink the number).
 */
import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../../..");

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".turbo",
  "dist",
  "build",
  "coverage",
  "public",
  "__tests__",
  // Ignored scratch checkouts of other repos (git check-ignore work).
  "work",
]);
const SKIP_FILES = new Set([
  // This guard.
  "features/content-ir/studio/kind-instance-writers-allow-list.test.ts",
  // A list-scope guard whose fixtures are query strings, not writers.
  "scripts/check-list-scope.ts",
]);

const WRITING_FUNCTIONS = [
  "confirm_kind_instances",
  "unconfirm_kind_instances",
  "archive_kind_instances",
  "edit_kind_instance_value",
  "revalidate_kind_instances",
];
const FROM_TABLE = /\.from\(\s*["'`](?:content_ir\.)?kind_instance["'`]\s*\)/g;
const CHAIN_WRITE = /\.(insert|update|upsert|delete)\s*\(/;
const RPC_WRITE = new RegExp(
  `\\.rpc\\(\\s*["'\`](?:content_ir\\.)?(${WRITING_FUNCTIONS.join("|")})["'\`]`,
  "g",
);
const SQL_WRITE =
  /\b(?:insert\s+into|update|delete\s+from)\s+content_ir\s*\.\s*kind_instance\b(?!_)/gi;

/** file -> write sites, measured 2026-10-03 on main. Only ever shrinks. */
export const ALLOWED: Record<string, number> = {
  // wave 2 slices 3 / 8 — web save and studio writers (instance-service is the one direct
  // writer; store-kind-record, message-kind-instances and ShapeTestTab reach it)
  "features/content-ir/studio/instance-service.ts": 4,
  // wave 5 slice 5.1 — web RPCs into the five writing functions
  "features/content-ir/records/kind-record-service.ts": 2,
  "features/content-ir/studio/records/records-service.ts": 4,
  // wave 5 slice 5.1 — migration history: function bodies, backfills, probes (frozen files)
  "migrations/campaign/errorshonest_s5_every_other_schema_says_not_found.sql": 1,
  "migrations/campaign/onehome_d_actors_are_user_agent_system.sql": 2,
  "migrations/campaign/w1_reg_the_deprecated_schema_and_its_guard.sql": 1,
  "migrations/dd131_actor_system_no_person_header.sql": 2,
  "migrations/dd198_knob_resolve_refuses_a_non_array_scopes.sql": 9,
  "migrations/dd211_the_agent_rung_on_a_write_is_real.sql": 7,
  "migrations/dd211b_the_carrier_names_its_rungs_where_a_guard_can_read_them.sql": 6,
  "migrations/inverse/errorshonest_s5_every_other_schema_says_not_found_down.sql": 1,
  "migrations/wine_tasting_title_key_and_instance_title_backfill.sql": 1,
};

type Site = { file: string; line: number; what: string };

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      yield* walk(path.join(dir, entry.name));
    } else if (/\.(ts|tsx|mts|js|mjs|sql)$/.test(entry.name) && !/\.test\.|\.spec\./.test(entry.name)) {
      yield path.join(dir, entry.name);
    }
  }
}

export function sitesIn(file: string, text: string): Site[] {
  const sites: Site[] = [];
  if (file.endsWith(".sql")) {
    for (const m of text.matchAll(SQL_WRITE)) {
      sites.push({ file, line: lineOf(text, m.index ?? 0), what: m[0].replace(/\s+/g, " ") });
    }
    return sites;
  }
  for (const m of text.matchAll(FROM_TABLE)) {
    const start = (m.index ?? 0) + m[0].length;
    const end = text.indexOf(";", start);
    const chain = text.slice(start, end === -1 ? undefined : end);
    const write = chain.match(CHAIN_WRITE);
    if (write) sites.push({ file, line: lineOf(text, m.index ?? 0), what: `.from("kind_instance").${write[1]}(` });
  }
  for (const m of text.matchAll(RPC_WRITE)) {
    sites.push({ file, line: lineOf(text, m.index ?? 0), what: `.rpc("${m[1]}")` });
  }
  return sites;
}

export function census(): Record<string, Site[]> {
  const found: Record<string, Site[]> = {};
  for (const abs of walk(REPO_ROOT)) {
    const file = path.relative(REPO_ROOT, abs).split(path.sep).join("/");
    if (SKIP_FILES.has(file)) continue;
    const text = fs.readFileSync(abs, "utf8");
    if (!text.includes("kind_instance")) continue;
    const sites = sitesIn(file, text);
    if (sites.length) found[file] = sites;
  }
  return found;
}

export function judge(found: Record<string, Site[]>, allowed: Record<string, number>): string[] {
  const problems: string[] = [];
  for (const [file, sites] of Object.entries(found).sort()) {
    const where = sites.map((s) => `${s.line}: ${s.what}`).join(", ");
    if (!(file in allowed)) {
      problems.push(
        `NEW WRITER of content_ir.kind_instance: ${file} (${where}). The table is retired — ` +
          "write through the record store instead.",
      );
    } else if (sites.length > allowed[file]) {
      problems.push(`NEW WRITE in ${file}: ${sites.length} sites, ${allowed[file]} allowed (${where}).`);
    }
  }
  for (const [file, count] of Object.entries(allowed).sort()) {
    const have = found[file]?.length ?? 0;
    if (have < count) {
      problems.push(
        `STALE ALLOWANCE: ${file} holds ${have} write site(s), the list allows ${count}. Shrink ` +
          "ALLOWED in this file (a stale allowance admits the next writer silently).",
      );
    }
  }
  return problems;
}

describe("no new writer of content_ir.kind_instance (guard 2 a, web leg)", () => {
  it("the repository matches the allow-list", () => {
    const found = census();
    // Non-vacuous: the census really sees the known writers.
    expect(Object.keys(found)).toContain("features/content-ir/studio/instance-service.ts");
    expect(judge(found, ALLOWED)).toEqual([]);
  });

  it("each write form is seen, and reads are not", () => {
    const ts = [
      `await db.schema("content_ir").from("kind_instance").insert(row);`,
      `await db.from("kind_instance")\n  .update({ title })\n  .eq("id", id);`,
      `await db.from("kind_instance").select("id").eq("id", id);`,
      `await db.rpc("archive_kind_instances", { p_ids });`,
    ].join("\n");
    expect(sitesIn("a.ts", ts).map((s) => s.what)).toEqual([
      `.from("kind_instance").insert(`,
      `.from("kind_instance").update(`,
      `.rpc("archive_kind_instances")`,
    ]);
    const sql = "UPDATE content_ir.kind_instance SET x = 1;\nupdate content_ir.kind_instance_tag set x = 1;";
    expect(sitesIn("a.sql", sql)).toHaveLength(1);
  });

  it("the judge fails on a new writer, a new site and a stale allowance", () => {
    const site = { file: "a.ts", line: 1, what: "x" };
    expect(judge({ "a.ts": [site] }, {})[0]).toMatch(/NEW WRITER/);
    expect(judge({ "a.ts": [site, site] }, { "a.ts": 1 })[0]).toMatch(/NEW WRITE in/);
    expect(judge({}, { "a.ts": 1 })[0]).toMatch(/STALE ALLOWANCE/);
    expect(judge({ "a.ts": [site] }, { "a.ts": 1 })).toEqual([]);
  });
});

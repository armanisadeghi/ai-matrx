#!/usr/bin/env npx tsx
/**
 * check:id-cast — AN ID IS COMPARED AS AN ID (lane ID-CAST-CLASS, 2026-10-08).
 *
 * `t.id::text = <text>` (or `t.table_id::text in (...)`) cannot use the key on `t.id`: Postgres
 * casts every id of the organization to text and compares. Lane TEMPLATE-INSTALL-SLOW found it in
 * custom.field_cycle (every Field write read all 26k records of the largest organization); the same
 * shape sat in 21 more functions. The fix is `t.id = platform.uuid_or_null(<text>)`.
 *
 * This guard reads the live body of every function and procedure in `custom`, `platform` and `iam`
 * and FAILS on a text-cast id comparison that is not in EXEMPT below. A new function with the
 * pattern is a finding the day it is created; an exemption needs its reason written here.
 *
 *   pnpm check:id-cast               # exit 1 on a finding; 2 when the database cannot be read
 *   pnpm check:id-cast --self-test   # RED on the pre-fix bodies, GREEN on the fixed ones (text only: no DDL on live)
 *
 * No credentials -> exit 0 with a SKIP line (like every live-DB check in this repo).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadDbEnv } from "./lib/direct-db";
import { connectDirect } from "./lib/direct-db";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMAS = ["custom", "platform", "iam"] as const;

/** Postgres ARE (\y = word boundary). Matches `id::text =`, `table_id::text in`, `(x.id)::text =`, `cast(x.id as text) =`. */
export const PATTERN =
  "(id\\s*\\)?\\s*::\\s*text\\s*(=|<>|!=|in\\y)|cast\\s*\\([^()]*id\\s+as\\s+text\\s*\\)\\s*(=|<>|!=|in\\y))";

/** schema.name -> why a text comparison is correct here. */
export const EXEMPT: Readonly<Record<string, string>> = {
  "iam._person_row_is_permanent": "compares the OLD row's id to a setting list; no table to index",
  "custom.data_home_tables": "one hashed set lookup per row of a list already read (PERF-FIX-3)",
  "custom.delete_rule": "position() substring test against a setting string, not an equality on a key",
  "platform.relation_set": "compares two local variables (v_id, v_rec_ids)",
  "platform.list_dimension_ids": "EXPLAIN: the same index plan either way (idx_assoc_target_live)",
  "platform._drill_person_words": "already narrowed to the caller's peers by id; the text test only filters",
  "platform._cutover_carry_back": "reads a retired workbench table that no longer exists",
  "platform.cutover_older_removal_rows": "reads a retired workbench table that no longer exists",
};

const FIND = `
select n.nspname || '.' || p.proname as fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.prokind in ('f', 'p')
   and (n.nspname = any ($1::text[]) or n.oid = pg_my_temp_schema())
   and p.prosrc ~* $2
 order by 1`;

async function findings(c: { query: (q: string, v: unknown[]) => Promise<{ rows: { fn: string }[] }> }): Promise<string[]> {
  const r = await c.query(FIND, [[...SCHEMAS], PATTERN]);
  return r.rows.map((x) => x.fn).filter((f) => process.argv.includes("--no-exempt") || !(f in EXEMPT));
}

async function main(): Promise<number> {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.log("[SKIP] check:id-cast — no database credentials in this environment (UNMEASURED, not a pass).");
    return 0;
  }
  const c = await connectDirect(env, "check-id-cast");
  try {
    await c.query("begin read only");
    if (process.argv.includes("--self-test")) {
      // No DDL on live (the production guard refuses it): the DETECTOR is proven on text, in the
      // database's own regex engine. RED = the inverse file (the 21 bodies as they were before the
      // fix) plus a planted line; GREEN = the fix file with comments removed.
      const strip = (s: string) => s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
      const old = strip(readFileSync(resolve(ROOT, "migrations/inverse/idcast_a_ids_are_compared_as_ids_down.sql"), "utf8"));
      const fixed = strip(readFileSync(resolve(ROOT, "migrations/campaign/idcast_a_ids_are_compared_as_ids.sql"), "utf8"));
      const planted = "select 1 from custom.record t where t.id::text = p_x";
      const hit = async (s: string) => (await c.query("select $1::text ~* $2::text as m", [s, PATTERN])).rows[0]!.m as boolean;
      const [rOld, rPlanted, gFixed, gOk] = [
        await hit(old),
        await hit(planted),
        await hit(fixed),
        await hit("select 1 from custom.record t where t.id = platform.uuid_or_null(p_x) and t.data ->> 'id' = 'x'"),
      ];
      await c.query("rollback");
      const ok = rOld && rPlanted && !gFixed && !gOk;
      console.log(`[${ok ? "OK" : "FAIL"}] self-test: pre-fix bodies flagged=${rOld} (want true), planted line flagged=${rPlanted} (want true), fixed bodies flagged=${gFixed} (want false), uuid comparison flagged=${gOk} (want false).`);
      return ok ? 0 : 1;
    }
    const f = await findings(c);
    await c.query("rollback");
    if (f.length === 0) {
      console.log(`[OK] no function in ${SCHEMAS.join(", ")} compares an id through ::text (${Object.keys(EXEMPT).length} exempt, each with a reason in the script).`);
      return 0;
    }
    for (const fn of f) console.log(`[FAIL] ${fn} compares an id as text (id::text = ...) and cannot use the key; write \`id = platform.uuid_or_null(<text>)\`.`);
    return 1;
  } finally {
    await c.end();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`[FAIL] check:id-cast: ${String(err)}`);
    process.exit(2);
  },
);

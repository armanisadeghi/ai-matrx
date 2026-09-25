#!/usr/bin/env npx tsx
/**
 * `pnpm check:trash-doors` — THE TRASH LISTING LINT (lane TRASH-2, 2026-09-25).
 *
 * Every function in the live catalogue whose name says it lists Trash (`trash`, not a restore,
 * gate, keep or purge) must filter by the PERSON before it reads a row: no `iam.has_access` per
 * row, no walk over `iam.my_orgs()`, no organization-wide grant, and an Organization Trash door
 * must pass `public._org_trash_gate` first. The judgement is `judgeTrashDoorBody` in
 * scripts/lib/trash-doors.ts (jest: scripts/lib/__tests__/trash-doors.test.ts proves it RED on the
 * pre-TRASH-2 body and GREEN on the current one). Exit 1 on any finding; exit 2 when the
 * catalogue cannot be read (UNMEASURED is never a pass).
 */
import process from "node:process";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { isTrashListingDoorName, judgeTrashDoorBody } from "./lib/trash-doors";

async function main(): Promise<number> {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(`UNMEASURED: no database connection (${env.missing.join(", ")} missing; looked in ${env.looked.join(", ")})`);
    return 2;
  }
  const db = await connectDirect(env, "check:trash-doors");
  try {
    const { rows } = await db.query<{ door: string; body: string }>(
      `select n.nspname || '.' || p.proname as door, pg_get_functiondef(p.oid) as body
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where p.proname ~ '(^|_)trash(_|$)' and p.prokind = 'f'
          and n.nspname not in ('pg_catalog', 'information_schema')
        order by 1`,
    );
    const doors = rows.filter((r) => isTrashListingDoorName(r.door));
    const findings = doors.flatMap(judgeTrashDoorBody);
    for (const d of doors) {
      const mine = findings.filter((f) => f.door === d.door);
      console.log(`${mine.length ? "FAIL" : " ok "}  ${d.door}`);
      for (const f of mine) console.log(`        ${f.problem}`);
    }
    console.log(`\n${doors.length} Trash listing door(s), ${findings.length} finding(s).`);
    return findings.length ? 1 : 0;
  } finally {
    await db.end();
  }
}

main().then((c) => process.exit(c), (e) => {
  console.error(e);
  process.exit(2);
});

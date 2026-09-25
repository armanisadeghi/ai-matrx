#!/usr/bin/env npx tsx
/**
 * `pnpm check:trash-answers-fast` — THE STORE-LEVEL TRASH TIMING SUITE (lane TRASH-2, 2026-09-25).
 *
 * As admin@admin.com (the seat with the largest organizations) and test@test.com, inside a
 * transaction that is ROLLED BACK, with `role authenticated` and the person's JWT claims:
 *   - `public.trash_list(array[kind], 50, 0)` for EVERY registered kind   — ceiling 300 ms each
 *   - `public.trash_counts()`                                              — ceiling 2 s
 *   - for the organization admin@admin.com administers with the most archived rows:
 *     `public.org_trash_list(org, array[kind], null, 50, 0)` per kind       — 300 ms each
 *     `public.org_trash_list(org, null, null, 50, 0)` (the merged page)    — 300 ms
 *     `public.org_trash_counts(org, null)`                                 — 2 s
 * Server-side EXPLAIN ANALYZE Execution Time, statement_timeout 5 s so a runaway kind fails fast.
 * Judgement: judgeTrashTimings (scripts/lib/trash-doors.ts). Exit 1 over a ceiling, 2 UNMEASURED.
 * Reads only; writes nothing (every transaction rolls back).
 *
 * This is the guard that would have caught the pre-TRASH-2 /trash: `file` ran >200 s for admin.
 */
import process from "node:process";
import type pg from "pg";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { judgeTrashTimings, type TrashTiming } from "./lib/trash-doors";

const SEATS = ["admin@admin.com", "test@test.com"];

async function timed(
  db: pg.Client,
  uid: string,
  sql: string,
  params: unknown[],
): Promise<{ ms: number | null; error?: string }> {
  await db.query("begin");
  try {
    await db.query("set local statement_timeout = '5s'");
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    const { rows } = await db.query<{ "QUERY PLAN": Array<{ "Execution Time": number }> }>(
      `explain (analyze, timing off, summary on, format json) ${sql}`,
      params,
    );
    return { ms: rows[0]!["QUERY PLAN"][0]!["Execution Time"] };
  } catch (e) {
    return { ms: null, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await db.query("rollback");
  }
}

async function main(): Promise<number> {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(`UNMEASURED: no database connection (${env.missing.join(", ")} missing)`);
    return 2;
  }
  const db = await connectDirect(env, "check:trash-answers-fast");
  const rows: TrashTiming[] = [];
  try {
    const { rows: kinds } = await db.query<{ kind: string }>(
      `select user_artifact_kind as kind from platform.entity_types
        where user_artifact_kind is not null and is_active order by 1`,
    );
    const { rows: seats } = await db.query<{ id: string; email: string }>(
      `select id::text, email::text from auth.users where email = any($1)`,
      [SEATS],
    );
    if (seats.length !== SEATS.length) {
      console.error(`UNMEASURED: expected seats ${SEATS.join(", ")}; found ${seats.map((s) => s.email).join(", ")}`);
      return 2;
    }
    for (const seat of seats) {
      for (const { kind } of kinds) {
        const t = await timed(db, seat.id, "select * from public.trash_list(array[$1]::text[], 50, 0)", [kind]);
        rows.push({ label: `trash_list ${kind} (${seat.email})`, class: "kind", ...t });
      }
      const c = await timed(db, seat.id, "select * from public.trash_counts()", []);
      rows.push({ label: `trash_counts (${seat.email})`, class: "counts", ...c });
    }

    const admin = seats.find((s) => s.email === "admin@admin.com")!;
    const orgFn = await db.query(`select to_regprocedure('public.org_trash_list(uuid, text[], uuid, integer, integer)') is not null as ok`);
    if (!orgFn.rows[0]?.ok) {
      rows.push({ label: "org_trash_list (absent)", class: "kind", ms: null, error: "public.org_trash_list does not exist" });
    } else {
      const { rows: org } = await db.query<{ id: string; name: string }>(
        `select om.organization_id::text as id, o.name
           from iam.organization_member om join iam.organizations o on o.id = om.organization_id
          where om.user_id = $1 and om.role in ('owner', 'admin')
          order by (select count(*) from files.files f
                     where f.organization_id = om.organization_id and f.deleted_at is not null) desc
          limit 1`,
        [admin.id],
      );
      const o = org[0]!;
      for (const { kind } of kinds) {
        const t = await timed(db, admin.id,
          "select * from public.org_trash_list($1::uuid, array[$2]::text[], null, 50, 0)", [o.id, kind]);
        rows.push({ label: `org_trash_list ${kind} (${o.name})`, class: "kind", ...t });
      }
      const m = await timed(db, admin.id, "select * from public.org_trash_list($1::uuid, null, null, 50, 0)", [o.id]);
      rows.push({ label: `org_trash_list merged page (${o.name})`, class: "kind", ...m });
      const c = await timed(db, admin.id, "select * from public.org_trash_counts($1::uuid, null)", [o.id]);
      rows.push({ label: `org_trash_counts (${o.name})`, class: "counts", ...c });
    }
  } finally {
    await db.end();
  }
  const findings = judgeTrashTimings(rows);
  const worst = [...rows].sort((a, b) => (b.ms ?? Infinity) - (a.ms ?? Infinity)).slice(0, 8);
  console.log("slowest:");
  for (const r of worst) console.log(`  ${r.ms === null ? "  --  " : r.ms.toFixed(1).padStart(8)} ms  ${r.label}`);
  for (const f of findings) console.log(`FAIL  ${f.door}: ${f.problem}`);
  console.log(`\n${rows.length} measurement(s), ${findings.length} over a ceiling.`);
  return findings.length ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => {
  console.error(e);
  process.exit(2);
});

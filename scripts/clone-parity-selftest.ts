/**
 * `pnpm check:clone-parity:self-test` — the parity gate, shown RED then GREEN, on live databases.
 *
 * 🚨 WHAT IT PROVES, and why it has to plant something. The gate that makes the chair's ruling
 * real is the one at the end of `pnpm db:rehearse --target clone`: after rule 27's third leg,
 * every function body the pair touched must hash to production's, or the rehearsal exits
 * non-zero naming the drift. A gate nobody has seen fail is a decoration, so this MOVES a body
 * on the clone, watches the gate name it, puts the body back, and watches the gate go quiet.
 *
 * It is safe on the clone and only on the clone: the probe function is created by this script in
 * its own name (`public.clone_parity_selftest_probe`), the "moved" body is one comment line inside
 * that same probe, and the probe is dropped on the way out. It never touches a real function, and
 * production is only ever READ — through the read-only transaction the reader proves the server
 * enforces before it hands back a client.
 *
 * RED-1  a body that exists on production and is DIFFERENT on the clone is named.
 * RED-2  a body that exists on production and is ABSENT from the clone is named.
 * GREEN  the same comparison with the body put back is silent.
 * RED-3  the OLD gate (production's current body) fails a file that is merely not on production yet.
 * GREEN-3 the based-on gate passes that file — production still holds its `-- based-on:` body.
 * RED-4  a file whose `-- based-on:` hash production no longer holds is named as drifted.
 *
 * Production has no probe function, of course — so the two databases swap roles for the probe:
 * the CLONE stands in as "production" (it is a physical copy of it, which is the whole premise)
 * and a second connection to the clone stands in as "the clone". The predicate under test is
 * `parityDrift`, byte for byte the one the rehearsal's exit gate calls.
 */

import process from "node:process";
import { connectDirect } from "./lib/direct-db";
import { loadCloneDbEnv, loadCloneRef, cloneRefOverride } from "./lib/migration-target";
import { openProductionReadOnly, parityCompare, parityDrift } from "./lib/clone-parity";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ESC = String.fromCharCode(27);
const OK = `${ESC}[32m  ok  ${ESC}[0m`;
const BAD = `${ESC}[31m FAIL ${ESC}[0m`;

const SCHEMA = "public";
const NAME = "clone_parity_selftest_probe";
const LOGICAL = `${SCHEMA}.${NAME}`;

function body(schema: string, note: string): string {
  return `create or replace function ${schema}.${NAME}() returns text language sql immutable as $fn$
    -- ${note}
    select 'clone-parity self-test'::text
  $fn$`;
}

/** The live catalogue. */
function live(client: Awaited<ReturnType<typeof connectDirect>>) {
  return async (sql: string, params?: unknown[]) =>
    (await client.query(sql, params as never)).rows as Record<string, unknown>[];
}

/** A catalogue answer this script READ a moment ago, replayed as the production side. */
function recorded(rows: Record<string, unknown>[]) {
  return async () => rows;
}

async function main(): Promise<number> {
  const cloneRef = loadCloneRef(ROOT, cloneRefOverride(process.argv.slice(2)));
  const env = loadCloneDbEnv(ROOT, cloneRef);
  const b = await connectDirect({ ...env }, "clone-parity self-test (the clone)");
  const qb = live(b);
  let fails = 0;
  const check = (label: string, ok: boolean, detail = "") => {
    console.log(`${ok ? OK : BAD} ${label}${ok || !detail ? "" : `\n        ${detail}`}`);
    if (!ok) fails++;
  };

  try {
    // The real read-only production connection is proven here too: a parity assertion that
    // cannot read production must refuse, never pass unmeasured.
    const prod = await openProductionReadOnly(cloneRef.parentRef);
    check("the production reader opens and the server proves it refuses a write", true);
    await prod.client.end().catch(() => undefined);

    await b.query(body(SCHEMA, "the body production has"));
    // The production side: what this catalogue really answered, read through the same query.
    const qa = recorded(
      (await qb(
        `select p.oid::int as oid,
                n.nspname || '.' || p.proname || '(' || coalesce(
                  (select string_agg(format_type(t, null), ', ' order by ord)
                     from unnest(p.proargtypes) with ordinality as u(t, ord)), '') || ')' as signature,
                encode(sha256(convert_to(pg_get_functiondef(p.oid), 'utf8')), 'hex') as hash
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = $1 and p.proname = $2 and p.prokind in ('f','p')`,
        [SCHEMA, NAME],
      )),
    );
    let drift = await parityDrift(qb, qa, [LOGICAL]);
    check("GREEN the same body on both sides is silent", drift.length === 0, JSON.stringify(drift));

    await b.query(body(SCHEMA, "A REHEARSAL MOVED THIS AND WALKED AWAY"));
    drift = await parityDrift(qb, qa, [LOGICAL]);
    check(
      "RED-1 a body moved on the clone is named",
      drift.length === 1 && drift[0]!.why === "the body on the clone is not the body on production",
      JSON.stringify(drift),
    );

    await b.query(`drop function if exists ${SCHEMA}.${NAME}()`);
    drift = await parityDrift(qb, qa, [LOGICAL]);
    check(
      "RED-2 a body production has and the clone does not is named",
      drift.length === 1 && drift[0]!.onClone === null,
      JSON.stringify(drift),
    );

    await b.query(body(SCHEMA, "the body production has"));
    drift = await parityDrift(qb, qa, [LOGICAL]);
    check("GREEN-2 putting the body back makes the gate quiet", drift.length === 0, JSON.stringify(drift));

    // ── the based-on half (lane DB-TOOLS-NO-BRANCH, 2026-09-25) ─────────────────────────
    // A file that replaces this body and is NOT on production yet: after rule 27's last leg the
    // clone holds the file's NEW body and production still holds the OLD one — the body the
    // file's `-- based-on:` line declares.
    const oldHash = String(((await qa()) as Array<{ hash: string }>)[0]!.hash);
    const fileSql = `-- based-on: ${LOGICAL}() ${oldHash}\n${body(SCHEMA, "THE FILE'S NEW BODY")};\n`;
    await b.query(body(SCHEMA, "THE FILE'S NEW BODY"));
    drift = await parityDrift(qb, qa, [LOGICAL]);
    check(
      "RED-3 the OLD gate (production's current body) fails a file that is simply not on production yet",
      drift.length === 1,
      JSON.stringify(drift),
    );
    let cmp = await parityCompare(qb, qa, [LOGICAL], fileSql);
    check(
      "GREEN-3 the based-on gate passes it: production still holds the file's based-on body (pending)",
      cmp.drift.length === 0 && cmp.pending.length === 1,
      JSON.stringify(cmp),
    );
    const staleSql = `-- based-on: ${LOGICAL}() ${"0".repeat(64)}\n${body(SCHEMA, "THE FILE'S NEW BODY")};\n`;
    cmp = await parityCompare(qb, qa, [LOGICAL], staleSql);
    check(
      "RED-4 a file whose based-on no longer matches production is named as drifted",
      cmp.drift.length === 1 && /based-on DRIFTED/.test(cmp.drift[0]!.why),
      JSON.stringify(cmp),
    );
    await b.query(body(SCHEMA, "the body production has"));
  } finally {
    await b.query(`drop function if exists ${SCHEMA}.${NAME}()`).catch(() => undefined);
    await b.end().catch(() => undefined);
  }

  console.log(fails === 0 ? "\nclone-parity self-test: PASS" : `\nclone-parity self-test: ${fails} FAILED`);
  return fails === 0 ? 0 : 1;
}

main().then(
  (c) => process.exit(c),
  (e) => {
    console.error("clone-parity self-test — unexpected error:", e);
    process.exit(2);
  },
);

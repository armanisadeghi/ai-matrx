#!/usr/bin/env npx tsx
/**
 * `npx tsx scripts/gate-corpus/run.ts` — seed the switch-gate corpus on a
 * throwaway Supabase branch, assert its coverage, and diff the live access
 * functions against the manifest.
 *
 * WHY A RUNNER AND NOT psql. The report is the point, not the rows: the gate
 * asks three questions (is every arm covered, is every ladder rung covered,
 * does any live answer disagree with the manifest) and a human reading a psql
 * dump has to work them out. This prints them.
 *
 * WHERE IT MAY RUN. The rehearsal branch, never production — and it proves that
 * the way the two migration runners do, rather than by guessing from a hostname.
 *
 *   1. BEFORE ANY CONNECTION: the configured DSN is compared to
 *      `plan/BRANCH-REF` (`assertConfiguredHostMatchesTarget`).
 *   2. ON THE OPEN CONNECTION: `pg_control_system().system_identifier` is compared
 *      to BRANCH-REF's (`assertServerMatchesTarget`) — read from the SERVER, never
 *      from the caller's arguments.
 *
 * 🚨 WHY THE OLD HOSTNAME BLOCKLIST HAD TO GO (measured 2026-09-16). It refused
 * any DSN containing `aws-0-us-east-1.pooler.supabase.com` as "the production
 * database" — which is THE REHEARSAL BRANCH'S OWN POOLER HOST. `W0-CORPUS`'s
 * named command could not run at all against the branch BUILD-BOOK sends it to:
 *   REFUSED: aws-0-us-east-1.pooler.supabase.com is the production database.
 * Production is `aws-1-...` behind the same kind of name, so a substring over a
 * shared Supavisor hostname can never tell the two apart. The control-file
 * identity can, and does; this is a strictly stronger refusal, not a lifted one.
 *
 * THE CONNECTION. `SUPABASE_BRANCH_DATABASE_URL` — the one variable BRANCH-REF
 * names, the same one `--target branch` reads. `GATE_CORPUS_DATABASE_URL` is still
 * honoured when it is set, and its use is ANNOUNCED; it is checked against
 * BRANCH-REF exactly like the other.
 *
 *   npx tsx scripts/gate-corpus/run.ts
 *
 * Exit code 0 only when coverage is complete AND every pair agrees AND
 * platform.reachability_drift() is empty AND the corpus's own POPULATION is on
 * the branch (not merely its manifest) AND the restored graph survived the run.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import {
  assertConfiguredHostMatchesTarget,
  assertServerMatchesTarget,
  branchRefOverride,
  loadBranchDbEnv,
  loadBranchRef,
  type BranchRef,
} from "../lib/migration-target";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

/**
 * The branch DSN, and the pre-connection half of the refusal. No socket is opened
 * here: the configured identity is compared to `plan/BRANCH-REF` first.
 */
function branchConnection(ref: BranchRef): { dsn: string; from: string } {
  const override = process.env.GATE_CORPUS_DATABASE_URL;
  if (override) {
    let u: URL;
    try {
      u = new URL(override);
    } catch {
      throw new Error(
        "GATE_CORPUS_DATABASE_URL is set but is not a DSN " +
          "(postgresql://<user>:<password>@<host>:<port>/<database>).",
      );
    }
    console.log(
      `[ OK ] GATE_CORPUS_DATABASE_URL is set and is being used instead of ` +
        `${ref.passwordEnvVar}; it is checked against ${ref.path} exactly the same way.`,
    );
    assertConfiguredHostMatchesTarget(
      {
        user: decodeURIComponent(u.username),
        host: u.hostname,
        port: Number(u.port || 5432),
        database: u.pathname.replace(/^\//, "") || ref.database,
        from: "GATE_CORPUS_DATABASE_URL",
      },
      "branch",
      ref,
    );
    return { dsn: override, from: "GATE_CORPUS_DATABASE_URL" };
  }
  const env = loadBranchDbEnv(ROOT, ref);
  assertConfiguredHostMatchesTarget(
    { user: env.user, host: env.host, port: env.port, database: env.database, from: env.from },
    "branch",
    ref,
  );
  const dsn =
    `postgresql://${encodeURIComponent(env.user)}:${encodeURIComponent(env.password)}` +
    `@${env.host}:${env.port}/${env.database}`;
  return { dsn, from: env.from };
}

type Row = Record<string, unknown>;

function table(rows: Row[]): string {
  if (rows.length === 0) return "  (none)";
  const cols = Object.keys(rows[0]);
  const w = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)),
  );
  const line = (cells: string[]) =>
    "  " + cells.map((s, i) => s.padEnd(w[i])).join("  ");
  return [
    line(cols),
    "  " + w.map((n) => "-".repeat(n)).join("  "),
    ...rows.map((r) => line(cols.map((c) => String(r[c] ?? "")))),
  ].join("\n");
}

/** The restored graph's own rows — everything the corpus does not own. */
const RESTORED_GRAPH_SQL = `
  select
    (select count(*) from platform.reachability
      where container_type not like 'corpus%' and item_type not like 'corpus%')::int as reachability,
    (select count(*) from platform.associations where id::text not like 'd0000000-%')::int as associations,
    (select count(*) from platform.entity_types
      where token not like 'corpus%' and id::text not like 'c5000000-%')::int as entity_types,
    (select count(*) from platform.shareable_resource_registry
      where resource_type not like 'corpus%'
        and coalesce(metadata->>'gate_corpus','') <> 'true')::int as registry,
    (select count(*) from iam.organizations where id::text not like 'c0000000-%')::int as organizations,
    (select count(*) from iam.permissions where id::text not like 'f0000000-%')::int as permissions`;

async function main(): Promise<void> {
  const ref = loadBranchRef(ROOT, branchRefOverride(process.argv.slice(2)));
  const { dsn, from } = branchConnection(ref);
  console.log(`[ OK ] connection from ${from}; ${ref.path} says the branch is ${ref.branchRef}.`);

  const client = new Client({ connectionString: dsn, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const sysid = await assertServerMatchesTarget(
      (sql) => client.query(sql),
      "branch",
      ref,
      "gate-corpus/run.ts",
    );
    console.log(`[ OK ] the connected server's own system_identifier is ${sysid} — the branch.`);

    const bootstrap = readFileSync(join(HERE, "bootstrap.sql"), "utf8");
    const seed = readFileSync(join(HERE, "seed.sql"), "utf8");
    const verify = readFileSync(join(HERE, "verify.sql"), "utf8");

    // THE RESTORED GRAPH, BEFORE. `W0-CORPUS` runs on top of `W0-DATA`'s copy and
    // must leave it exactly as it found it; the seed's teardown used to delete by
    // TYPE and took 183 restored reachability rows with it.
    const before = (await client.query(RESTORED_GRAPH_SQL)).rows[0] as Record<string, number>;
    console.log("\n== THE RESTORED GRAPH, BEFORE THE CORPUS RUNS ==");
    console.log(table([before as unknown as Row]));

    await client.query(bootstrap);

    const t0 = Date.now();
    await client.query(seed);
    const seedMs = Date.now() - t0;
    console.log(`\nSeeded in ${(seedMs / 1000).toFixed(2)} s.`);

    const t1 = Date.now();
    await client.query(verify);
    const verifyMs = Date.now() - t1;

    const byArm = await client.query(`
      select arm, max(arm_name) as arm_name, count(*)::int as pairs,
             count(*) filter (where expected)::int as expect_true,
             count(*) filter (where not expected)::int as expect_false
      from corpus.corpus_manifest group by arm order by arm`);
    console.log("\n== COVERAGE BY ARM (0 = the principal shared on none) ==");
    console.log(table(byArm.rows));

    const byRung = await client.query(`
      select required::text as rung, count(*)::int as pairs,
             count(*) filter (where expected)::int as expect_true
      from corpus.corpus_manifest group by required order by required`);
    console.log("\n== COVERAGE BY LADDER RUNG ==");
    console.log(table(byRung.rows));

    const byShape = await client.query(`
      select shape, count(*)::int as pairs from corpus.corpus_manifest group by shape order by shape`);
    console.log("\n== COVERAGE BY SHAPE ==");
    console.log(table(byShape.rows));

    const diffs = await client.query(`
      select arm, arm_name, principal_name, record_type, required::text as required,
             include_public, expected, actual, err_code, left(err_message, 60) as err_message, why
      from corpus.corpus_result where not agrees order by arm, principal_name, record_type`);
    console.log("\n== DISAGREEMENTS (manifest vs the live functions) ==");
    console.log(table(diffs.rows));

    const totals = await client.query(`
      select count(*)::int as pairs, count(*) filter (where agrees)::int as agree,
             count(*) filter (where not agrees)::int as disagree,
             count(*) filter (where err_code is not null)::int as raised from corpus.corpus_result`);
    console.log("\n== TOTALS ==");
    console.log(table(totals.rows));

    const drift = await client.query(`select count(*)::int as drift_rows from platform.reachability_drift()`);
    console.log("\n== INSTRUMENT A — platform.reachability_drift() ==");
    console.log(table(drift.rows));

    const cache = await client.query(`
      select container_type, item_type, depth, max_level::text as max_level, count(*)::int as pairs
      from platform.reachability group by 1,2,3,4 order by 1,2,3`);
    console.log("\n== THE PAIR CACHE THE CORPUS BUILT ==");
    console.log(table(cache.rows));

    // ── THE ANTI-VACUITY CHECK, OVER THE POPULATION RATHER THAN THE MANIFEST ──
    // The manifest is 49 rows of intent and stays 49 whatever happens to the
    // graph: on 2026-09-16 a restore emptied `platform.associations` and
    // `platform.reachability` of every corpus row and the old exit — a count of
    // `corpus.corpus_manifest` — still read 17 arms / 49 pairs over a corpus that
    // no longer existed. What follows counts the LIVE rows each arm stands on.
    const population = await client.query(`
      select m.arm, max(m.arm_name) as arm_name,
             count(distinct m.record_type || ':' || m.record_id::text)::int as records,
             (select count(*) from platform.associations a
               where a.id::text like 'd0000000-%'
                 and ((a.source_type, a.source_id) in (select m2.record_type, m2.record_id
                         from corpus.corpus_manifest m2 where m2.arm = m.arm)
                   or (a.target_type, a.target_id) in (select m2.record_type, m2.record_id
                         from corpus.corpus_manifest m2 where m2.arm = m.arm)))::int as associations,
             (select count(*) from platform.reachability r
               where (r.container_type like 'corpus%' or r.item_type like 'corpus%')
                 and (r.item_type, r.item_id) in (select m2.record_type, m2.record_id
                         from corpus.corpus_manifest m2 where m2.arm = m.arm))::int as reachability
      from corpus.corpus_manifest m group by m.arm order by m.arm`);
    console.log("\n== THE CORPUS'S LIVE POPULATION, ARM BY ARM ==");
    console.log(table(population.rows));

    const corpusEdges = (
      await client.query(`
        select (select count(*) from platform.associations where id::text like 'd0000000-%')::int as associations,
               (select count(*) from platform.reachability
                 where container_type like 'corpus%' or item_type like 'corpus%')::int as reachability,
               (select count(*) from corpus.corpus_principal)::int as principals`)
    ).rows[0] as Record<string, number>;
    console.log("\n== THE CORPUS'S OWN EDGES ==");
    console.log(table([corpusEdges as unknown as Row]));

    const after = (await client.query(RESTORED_GRAPH_SQL)).rows[0] as Record<string, number>;
    console.log("\n== THE RESTORED GRAPH, AFTER THE CORPUS RUNS ==");
    console.log(table([after as unknown as Row]));

    const harmed = Object.keys(before).filter((k) => Number(before[k]) !== Number(after[k]));
    const emptyArms = (population.rows as Row[]).filter((r) => Number(r.records) === 0);
    const noEdges = corpusEdges.associations === 0 || corpusEdges.reachability === 0;

    const disagree = Number((totals.rows[0] as Row).disagree);
    const driftRows = Number((drift.rows[0] as Row).drift_rows);
    console.log(
      `\nSeed ${(seedMs / 1000).toFixed(2)} s, verify ${(verifyMs / 1000).toFixed(2)} s, ` +
        `${disagree} disagreement(s), ${driftRows} drift row(s).`,
    );
    let red = false;
    if (disagree > 0 || driftRows > 0) {
      console.error(
        "\nGATE RED — a disagreement is either a corpus bug or a finding. Say which, in GATE-CORPUS.md.",
      );
      red = true;
    }
    if (noEdges) {
      console.error(
        `\nGATE RED — the corpus has a manifest but NO POPULATION: ` +
          `${corpusEdges.associations} d0000000- association(s), ` +
          `${corpusEdges.reachability} corpus reachability row(s). Every arm would answer what an ` +
          `empty set answers. REMEDY: re-run this command after W0-DATA's restore — the restore ` +
          `replaces platform.associations and platform.reachability wholesale and takes the ` +
          `corpus's edges with it, so the order is DATA, then CORPUS, then verify.`,
      );
      red = true;
    }
    if (emptyArms.length > 0) {
      console.error(
        `\nGATE RED — arm(s) with no live record behind them: ` +
          `${emptyArms.map((r) => `${r.arm} (${r.arm_name})`).join(", ")}.`,
      );
      red = true;
    }
    if (harmed.length > 0) {
      console.error(
        `\nGATE RED — the corpus run MOVED the restored graph: ` +
          harmed.map((k) => `${k} ${before[k]} -> ${after[k]}`).join(", ") +
          `. W0-CORPUS owns schema corpus and its own ids and nothing else; the diff W0-DATA's ` +
          `exit proved is now wrong and the copy must be re-restored.`,
      );
      red = true;
    }
    if (red) {
      process.exitCode = 1;
    } else {
      console.log(
        `\nGATE GREEN — every arm covered, every rung covered, every answer agreed; ` +
          `${corpusEdges.associations} corpus associations and ${corpusEdges.reachability} corpus ` +
          `reachability rows are live; the restored graph is untouched ` +
          `(${after.reachability} reachability, ${after.associations} associations, ` +
          `${after.registry} registry rows before and after).`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.stack ?? err.message : err));
  process.exit(1);
});

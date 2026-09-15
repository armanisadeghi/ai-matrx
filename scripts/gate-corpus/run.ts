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
 * WHERE IT MAY RUN. A branch, never production. The connection string comes
 * from GATE_CORPUS_DATABASE_URL and the script REFUSES the production host and
 * the production project ref outright — the parent project is SELECT-only for
 * this work and nothing here is allowed to forget that.
 *
 *   export GATE_CORPUS_DATABASE_URL='postgresql://postgres:<pass>@db.<branch-ref>.supabase.co:5432/postgres'
 *   npx tsx scripts/gate-corpus/run.ts
 *
 * Exit code 0 only when coverage is complete AND every pair agrees AND
 * platform.reachability_drift() is empty.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The production project. Nothing in this script may write to it. */
const FORBIDDEN_HOSTS = [
  "brsgrqvjdzwihsvnfqkf",
  "aws-1-us-east-1.pooler.supabase.com",
  "aws-0-us-east-1.pooler.supabase.com",
  "db.matrxserver.com",
];

function refuseProduction(url: string): void {
  const host = new URL(url).hostname.toLowerCase();
  const user = decodeURIComponent(new URL(url).username).toLowerCase();
  for (const bad of FORBIDDEN_HOSTS) {
    if (host.includes(bad) || user.includes(bad)) {
      throw new Error(
        `REFUSED: ${host} is the production database (matched "${bad}"). ` +
          `The gate corpus seeds a throwaway branch only.`,
      );
    }
  }
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

async function main(): Promise<void> {
  const url = process.env.GATE_CORPUS_DATABASE_URL;
  if (!url) {
    throw new Error(
      "GATE_CORPUS_DATABASE_URL is not set. It must point at the throwaway branch, " +
        "never at production.",
    );
  }
  refuseProduction(url);

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const bootstrap = readFileSync(join(HERE, "bootstrap.sql"), "utf8");
    const seed = readFileSync(join(HERE, "seed.sql"), "utf8");
    const verify = readFileSync(join(HERE, "verify.sql"), "utf8");

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

    const disagree = Number((totals.rows[0] as Row).disagree);
    const driftRows = Number((drift.rows[0] as Row).drift_rows);
    console.log(
      `\nSeed ${(seedMs / 1000).toFixed(2)} s, verify ${(verifyMs / 1000).toFixed(2)} s, ` +
        `${disagree} disagreement(s), ${driftRows} drift row(s).`,
    );
    if (disagree > 0 || driftRows > 0) {
      console.error(
        "\nGATE RED — a disagreement is either a corpus bug or a finding. Say which, in GATE-CORPUS.md.",
      );
      process.exitCode = 1;
    } else {
      console.log("\nGATE GREEN — every arm covered, every rung covered, every answer agreed.");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.stack ?? err.message : err));
  process.exit(1);
});

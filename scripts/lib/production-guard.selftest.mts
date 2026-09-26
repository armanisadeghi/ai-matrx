// scripts/lib/production-guard.selftest.mts — `pnpm check:production-guard:self-test`
//
// The production guard against REAL servers (incident 2026-09-26). The jest half
// (scripts/__tests__/production-guard.test.ts) proves the rules on a recorder; this proves:
//   · `connectDirect` guards production, and a refused statement never reaches the server;
//   · one bounded read on live shows every limit set BY THE STAMP (pg_settings.source = 'session');
//   · the migration runner's connection (`{ migrationRunner: true }`) and the clone are NOT guarded;
//   · the guard, forced onto a CLONE client, stamps a BEGIN block and a bare statement.
// Nothing here writes, and nothing heavy touches production.
import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import pg from "pg";
import { connectDirect, loadDbEnv } from "./direct-db";
import { cloneRefOverride, loadCloneDbEnv, loadCloneRef } from "./migration-target";
import { ProductionGuardRefusal, governProduction } from "./production-guard";

const SETTINGS =
  "select current_setting('transaction_timeout') as txn, current_setting('idle_in_transaction_session_timeout') as idle," +
  " current_setting('statement_timeout') as stmt, current_setting('lock_timeout') as lock," +
  " (select bool_and(source = 'session') from pg_settings where name in" +
  " ('transaction_timeout','idle_in_transaction_session_timeout','statement_timeout','lock_timeout')) as set_by_us";
const EXPECTED = { txn: "10min", idle: "1min", stmt: "30s", lock: "5s", set_by_us: true };

type Guarded = pg.Client & { productionGuarded?: boolean };

function prodEnv() {
  const env = loadDbEnv();
  if ("missing" in env) throw new Error(`production env missing: ${env.missing.join(", ")}`);
  assert.match(env.user, /\.brsgrqvjdzwihsvnfqkf$/, "SUPABASE_MATRIX_* must name production for this proof");
  return env;
}

function cloneEnv() {
  const root = process.cwd();
  return loadCloneDbEnv(root, loadCloneRef(root, cloneRefOverride(process.argv.slice(2))));
}

test("production through connectDirect is guarded: refused statements are never sent, every transaction is stamped", async () => {
  const c = (await connectDirect(prodEnv(), "production-guard self-test")) as Guarded;
  try {
    assert.equal(c.productionGuarded, true);
    await assert.rejects(c.query("set local statement_timeout = '900s'"), ProductionGuardRefusal);
    await assert.rejects(c.query("begin isolation level repeatable read"), ProductionGuardRefusal);
    const { rows } = await c.query(SETTINGS);
    assert.deepEqual(rows[0], EXPECTED);
  } finally {
    await c.end();
  }
});

test("the migration runner's production connection is the one sanctioned exception", async () => {
  const c = (await connectDirect(prodEnv(), "production-guard self-test (runner)", undefined, {
    migrationRunner: true,
  })) as Guarded;
  try {
    assert.equal(c.productionGuarded, undefined);
  } finally {
    await c.end();
  }
});

test("the clone is not guarded, and the guard forced onto a clone client stamps every shape", async () => {
  const env = cloneEnv();
  const plain = (await connectDirect(env, "production-guard self-test (clone)")) as Guarded;
  await plain.end();
  assert.equal(plain.productionGuarded, undefined);

  const raw = new pg.Client({ ...env, ssl: { rejectUnauthorized: false } });
  await raw.connect();
  const c = governProduction(raw as unknown as { query: (...a: unknown[]) => Promise<unknown>; end: () => Promise<void> }, "forced") as unknown as pg.Client;
  try {
    const bare = await c.query(SETTINGS);
    assert.deepEqual(bare.rows[0], EXPECTED);
    await c.query("begin read only");
    const block = await c.query(SETTINGS);
    await c.query("rollback");
    assert.deepEqual(block.rows[0], EXPECTED);
    await assert.rejects(c.query("set local lock_timeout = '30s'"), ProductionGuardRefusal);
  } finally {
    await c.end();
  }
});

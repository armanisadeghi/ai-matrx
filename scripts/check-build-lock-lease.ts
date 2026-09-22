/**
 * `pnpm check:build-lock-lease:self-test` — THE LEASE, PROVEN RED THEN GREEN, ON THE CLONE.
 * =========================================================================================
 *
 * WHAT IT IS GUARDING. Lane LOCK-HYGIENE (2026-09-22) made a `campaign_watch.build_lock` row a
 * LEASE: `expires_at`, fifteen minutes, pushed forward by every renew, and a row whose lease has
 * lapsed is EXPIRED — the next `campaign_watch.lock_take()` evicts it and names its former
 * holder. Three rows leaked the day it was written (FIX-10A held `custom` 20 minutes after DONE,
 * STORE-TXN-3 held `platform` after its final report, TAILS held `custom` for 18 hours), and each
 * cost the next lane an hour of waiting on a lock nobody was using.
 *
 * The three things that must stay true, and the three ways they break:
 *   1. AN EXPIRED ROW BLOCKS NOBODY. Break it and the leak is back.
 *   2. A LIVE ROW STILL BLOCKS. Break it and two lanes land on one object at once — which is a
 *      far worse defect than the one being fixed, so it is tested first and hardest.
 *   3. A LANE THAT DIES MID-APPLY LEAVES A ROW THAT EXPIRES ON ITS OWN. Nothing has to run: no
 *      trap, no sweep, no chair. That is the whole difference from every earlier attempt.
 *
 * RED IS NOT A METAPHOR HERE. The RED arm runs the exact SQL every caller used BEFORE this lane —
 * a bare `insert … on conflict (lock_name) do nothing` — against a row whose lease has lapsed,
 * and requires it to return ZERO ROWS: the old path really does still block on a dead holder, so
 * the GREEN arm is measuring a change and not a tautology.
 *
 * WHERE IT RUNS: the nightly dev clone, and nowhere else, by name. It INSERTS rows into
 * `campaign_watch.build_lock`, so it uses lock names in its own `zz_lockhyg_selftest:` namespace
 * that no lane and no file ever takes, and deletes exactly those names in a `finally` on every
 * exit path — including the one where an assertion throws.
 */
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { cloneRefOverride, loadCloneDbEnv, loadCloneRef } from "./lib/migration-target";
import {
  takeBuildLock,
  renewBuildLock,
  releaseBuildLock,
  listBuildLocks,
  type LockQuery,
} from "./lib/build-lock";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ESC = String.fromCharCode(27);
const C = { reset: `${ESC}[0m`, bold: `${ESC}[1m`, dim: `${ESC}[2m`, red: `${ESC}[31m`, green: `${ESC}[32m` };
const OK = `${C.green}[ OK ]${C.reset} `;
const FAIL = `${C.red}[FAIL]${C.reset} `;

/** A namespace no lane, no file and no night job ever takes. */
const NS = `zz_lockhyg_selftest:${process.pid}`;
const LOCK_A = `${NS}:a`;
const LOCK_B = `${NS}:b`;

class Failed extends Error {}
function must(condition: boolean, what: string): void {
  if (!condition) throw new Failed(what);
  console.log(`${OK}${what}`);
}

async function main(): Promise<number> {
  if (!process.argv.includes("--self-test")) {
    console.error(`${C.bold}pnpm check:build-lock-lease:self-test${C.reset} — the only mode.`);
    return 2;
  }
  const ref = loadCloneRef(ROOT, cloneRefOverride(process.argv));
  const env = loadCloneDbEnv(ROOT, ref);
  const client = new pg.Client({
    host: env.host,
    port: env.port,
    user: env.user,
    password: env.password,
    database: env.database,
    ssl: { rejectUnauthorized: false },
    application_name: "check:build-lock-lease (self-test)",
  });
  await client.connect();
  const q: LockQuery = async (sql, params) => (await client.query(sql, params as never)).rows;
  const where = `the dev clone ${ref.cloneRef}`;

  try {
    console.log(`${C.bold}build_lock LEASE — self-test on ${where}${C.reset}`);
    console.log(`${C.dim}lock namespace: ${NS} (deleted on every exit path)${C.reset}\n`);

    // ── GREEN-1: a free name is taken ────────────────────────────────────────────────────
    const t1 = await takeBuildLock(q, LOCK_A, "LANE-ONE", "self-test: a plain take", where);
    must(t1.outcome === "taken" && t1.held, `GREEN-1 a free lock is taken (outcome ${t1.outcome})`);

    // ── RED-2 / GREEN-2: A LIVE ROW STILL BLOCKS. The refusal is not weakened. ───────────
    const t2 = await takeBuildLock(q, LOCK_A, "LANE-TWO", "self-test: a peer tries", where);
    must(
      t2.outcome === "held" && !t2.held && t2.heldBy === "LANE-ONE",
      `GREEN-2 a LIVE row still blocks a second lane (outcome ${t2.outcome}, holder ${t2.heldBy})`,
    );
    must(
      /LIVE for another/.test(t2.message) && t2.message.includes("LANE-ONE"),
      `GREEN-2b the refusal names the live holder and the lease left`,
    );

    // ── GREEN-3: the holder renewing is never blocked by itself ─────────────────────────
    const t3 = await takeBuildLock(q, LOCK_A, "LANE-ONE", "self-test: same lane again", where);
    must(
      t3.outcome === "renewed" && t3.held,
      `GREEN-3 the holder taking its own lock RENEWS instead of blocking (outcome ${t3.outcome})`,
    );
    must(await renewBuildLock(q, LOCK_A, "LANE-ONE", where), `GREEN-3b an explicit renew answers true`);
    must(
      !(await renewBuildLock(q, LOCK_A, "LANE-TWO", where)),
      `GREEN-3c a renew by somebody who is NOT the holder answers false`,
    );

    // ── A LANE THAT DIES. Its row is left exactly as a SIGKILL leaves one: no release, no
    //    heartbeat, and the lease simply runs out. Nothing runs to make this happen.
    await client.query(
      `update campaign_watch.build_lock
          set expires_at = now() - interval '90 seconds',
              heartbeat_at = now() - interval '17 minutes',
              taken_at = now() - interval '17 minutes'
        where lock_name = $1`,
      [LOCK_A],
    );
    const status = await listBuildLocks(q, where);
    const mine = status.find((r) => r.lock_name === LOCK_A);
    must(
      mine?.state === "expired",
      `GREEN-4 a lane that died leaves a row that goes EXPIRED on its own (state ${mine?.state})`,
    );

    // ── RED-1: THE OLD PATH STILL BLOCKS ON THAT DEAD ROW. ──────────────────────────────
    // This is the exact statement every caller carried before this lane. If it returned a row,
    // the GREEN arm below would be proving nothing.
    const old = await client.query(
      `insert into campaign_watch.build_lock (lock_name, held_by, note)
       values ($1, $2, $3) on conflict (lock_name) do nothing returning held_by`,
      [LOCK_A, "LANE-TWO", "self-test: the pre-lease take"],
    );
    must(
      old.rows.length === 0,
      `RED-1 the OLD take (bare \`on conflict do nothing\`) still returns ZERO rows against the ` +
        `dead holder — the defect is real and reproducible`,
    );

    // ── GREEN-5: the NEW take evicts it, and says whose it was and how old. ─────────────
    const t5 = await takeBuildLock(q, LOCK_A, "LANE-TWO", "self-test: the lease-aware take", where);
    must(
      t5.outcome === "evicted" && t5.held,
      `GREEN-5 an EXPIRED row blocks nobody — the take evicts it (outcome ${t5.outcome})`,
    );
    must(
      t5.evictedHolder === "LANE-ONE" && !!t5.evictedAge,
      `GREEN-5b the eviction names the former holder (${t5.evictedHolder}) and its age (${t5.evictedAge})`,
    );
    must(
      t5.message.includes("LANE-ONE") && /EXPIRED/.test(t5.message),
      `GREEN-5c the sentence the caller prints says the row was EXPIRED and whose it was`,
    );

    // ── GREEN-6: release is holder-scoped, as it always was. ────────────────────────────
    must(
      !(await releaseBuildLock(q, LOCK_A, "LANE-ONE", where)),
      `GREEN-6 a release by the EVICTED lane frees nothing (it is not the holder any more)`,
    );
    must(
      await releaseBuildLock(q, LOCK_A, "LANE-TWO", where),
      `GREEN-6b a release by the real holder frees the row`,
    );

    // ── GREEN-7: a fresh take on a never-used name carries a lease in the future. ───────
    const t7 = await takeBuildLock(q, LOCK_B, "LANE-THREE", "self-test: lease window", where);
    const leaseMs = new Date(t7.expiresAt!).getTime() - Date.now();
    must(
      leaseMs > 13 * 60_000 && leaseMs <= 15.5 * 60_000,
      `GREEN-7 a take sets a bounded lease ~15 minutes out (${Math.round(leaseMs / 1000)}s)`,
    );

    console.log(`\n${OK}${C.bold}the build_lock lease is proven RED then GREEN on ${where}.${C.reset}`);
    return 0;
  } catch (err) {
    if (err instanceof Failed) {
      console.error(`${FAIL}${err.message}`);
      return 1;
    }
    console.error(`${FAIL}${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    // EVERY exit path, assertion failures included. These two names are this process's alone.
    await client
      .query(`delete from campaign_watch.build_lock where lock_name in ($1, $2)`, [LOCK_A, LOCK_B])
      .catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

void main().then((code) => {
  process.exitCode = code;
});

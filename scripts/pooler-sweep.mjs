#!/usr/bin/env node
/**
 * pooler-sweep.mjs — find and repair what one client left on a SHARED pooled backend.
 *
 * Supavisor's transaction pooler (:6543) never resets a backend between clients, so a session-level
 * SET (default_transaction_read_only, statement_timeout, lock_timeout, role, search_path, …) left by
 * any script is handed to the aidream server's next query. Incident 2026-10-01 08:31–10:14Z.
 * Proof and rule: common-docs/systems/data/custom-data/STATE.md.
 *
 * Visits the transaction pool in parallel (short transactions, a few workers — never enough to starve
 * the server), and on every backend it lands on reads the GUCs whose source is `session`. A leaked one
 * is RESET inside that transaction and committed (a RESET in a committed transaction is session-wide).
 * Also lists pooled backends idle in a transaction for over 30 s (reported, never touched).
 * Writes nothing but RESET. Exit 1 when anything was found (repaired or not), 0 when clean, 2 on error.
 *
 *   pnpm pooler:sweep --target production            # find + reset
 *   pnpm pooler:sweep --target production --report   # find only
 *   pnpm pooler:sweep --target clone --plant         # plant one leak on the clone first (the proof)
 */
import { transactionPoolDsnForSweeper, dsnFor, pgClient } from "./lib/pooled-db.mjs";
import { formatDurationMs } from "@ai-matrx/kit/format";

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : dflt; };
const TARGET = opt("target", "");
const REPORT_ONLY = argv.includes("--report");
const PLANT = argv.includes("--plant");
const WORKERS = Number(opt("workers", "6"));
const MAX_VISITS = Number(opt("visits", "400"));
const QUIET_AFTER = Number(opt("quiet-after", "80")); // stop once this many visits in a row found no new backend
if (!["production", "clone"].includes(TARGET)) { console.error("usage: pooler-sweep --target production|clone [--report] [--plant]"); process.exit(2); }
if (PLANT && TARGET !== "clone") { console.error("refused: --plant runs on the clone only"); process.exit(2); }

// Session-sourced settings that are not a leak: connection identity, the ORM's own jit=off, and the
// transaction_* views — a `SET transaction_read_only` outside a transaction leaves source=session
// residue but every later transaction still takes its mode from default_transaction_* (proven on the
// clone 2026-10-01: residue 'on' planted, next transactions wrote). default_transaction_* is checked.
const BENIGN = ["application_name", "client_encoding", "DateStyle", "TimeZone", "IntervalStyle", "extra_float_digits", "jit",
  "transaction_read_only", "transaction_isolation", "transaction_deferrable"];
const PROBE = `select pg_backend_pid() as pid, current_user = session_user as own_role,
  coalesce((select json_agg(json_build_object('name', name, 'setting', setting) order by name)
              from pg_settings where source = 'session' and name <> all($1::text[])), '[]'::json) as leaked`;

const pg = (await import("pg")).default;
const TX_DSN = transactionPoolDsnForSweeper(TARGET);
const quote = (n) => `"${n.replace(/"/g, '""')}"`;

if (PLANT) {
  const c = pgClient(pg, TX_DSN);
  await c.connect();
  // The incident's exact shape, on the clone only: a bare session SET through the transaction pooler.
  const r = await c.query("select pg_backend_pid() pid; set lock_timeout = '1234ms'"); // pooler-session-set:allow the sweeper's clone-only plant
  await c.end();
  console.log(`planted: lock_timeout=1234ms at session level on clone backend ${r[0].rows[0].pid}`);
}

const seen = new Map(); // pid -> { leaked, reset, own_role }
let visits = 0, sinceNew = 0, errors = 0;
const failures = [];

async function worker() {
  const c = pgClient(pg, TX_DSN);
  c.on("error", () => undefined);
  await c.connect();
  try {
    while (visits < MAX_VISITS && sinceNew < QUIET_AFTER) {
      visits += 1;
      try {
        await c.query("begin"); // the probe is the transaction's first statement: nothing of ours is in pg_settings yet
        const { rows: [row] } = await c.query(PROBE, [BENIGN]);
        const fresh = !seen.has(row.pid);
        sinceNew = fresh ? 0 : sinceNew + 1;
        const dirty = row.leaked.length > 0 || !row.own_role;
        const prior = seen.get(row.pid);
        if (fresh || (dirty && !prior?.reset)) {
          let reset = prior?.reset ?? false;
          if (dirty && !REPORT_ONLY) {
            const names = new Set(row.leaked.map((g) => g.name));
            if (!row.own_role) names.add("role");
            reset = true;
            for (const n of names) {
              await c.query("savepoint sweep");
              try { await c.query(`reset ${quote(n)}`); await c.query("release savepoint sweep"); }
              catch (e) { await c.query("rollback to savepoint sweep"); reset = false; failures.push(`${row.pid}: reset ${n} failed — ${e.message}`); }
            }
          }
          seen.set(row.pid, { leaked: prior?.leaked?.length ? prior.leaked : row.leaked, own_role: prior ? prior.own_role && row.own_role : row.own_role, reset });
        }
        await c.query("commit");
      } catch (e) {
        errors += 1;
        failures.push(`visit failed — ${e.message}`);
        await c.query("rollback").catch(() => undefined);
        if (errors > 20) break;
      }
    }
  } finally { await c.end().catch(() => undefined); }
}

const t0 = Date.now();
await Promise.all(Array.from({ length: WORKERS }, worker));

// Open transactions on pooled backends (read on the session pooler; reported, never touched).
const s = pgClient(pg, dsnFor(TARGET, { app: "pooler-sweep" }));
await s.connect();
const { rows: open } = await s.query(`select pid, usename, state, now() - xact_start as open_for, left(query, 80) as last_query
  from pg_stat_activity where application_name = 'Supavisor' and state like 'idle in transaction%' and now() - state_change > interval '30 seconds'`);
const { rows: [{ n: poolSize }] } = await s.query(`select count(*)::int n from pg_stat_activity where application_name = 'Supavisor' and usename = current_user`);
await s.end();

const leakedBackends = [...seen].filter(([, v]) => v.leaked.length || !v.own_role);
console.log(`pooler:sweep ${TARGET} — ${visits} visits, ${seen.size} distinct transaction-pool backends (≈${poolSize} pooled backends for this login), ${formatDurationMs(Date.now() - t0, { style: "compact" })}, ${errors} errors`);
for (const [pid, v] of leakedBackends) {
  console.log(`  LEAK backend ${pid}: ${v.leaked.map((g) => `${g.name}=${g.setting}`).join(", ")}${v.own_role ? "" : " role≠session_user"} — ${v.reset ? "RESET" : "not reset (--report)"}`);
}
for (const o of open) console.log(`  OPEN TRANSACTION backend ${o.pid} (${o.usename}) ${o.state} for ${o.open_for?.minutes ?? 0}m${o.open_for?.seconds ?? 0}s — last: ${o.last_query}`);
for (const f of [...new Set(failures)]) console.log(`  ERROR ${f}`);
if (!leakedBackends.length && !open.length && !failures.length) console.log("  clean");
process.exit(leakedBackends.length || open.length || failures.length ? 1 : 0);

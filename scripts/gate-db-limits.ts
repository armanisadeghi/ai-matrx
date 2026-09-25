/**
 * Print the gate database limits as one SQL statement, for a SHELL gate that talks to the live
 * database through psql. The text comes from `scripts/lib/gate-db.ts` — the one definition — so a
 * psql gate and a TypeScript gate can never drift apart.
 *
 *   psql -X -v ON_ERROR_STOP=1 -v gate_limits="$(pnpm exec tsx scripts/gate-db-limits.ts check:my-gate)" -f my.sql
 *
 * The SQL file opens ONE transaction and runs `:gate_limits;` first inside it, so `set_config(...,
 * true)` governs every statement after it through Supavisor's transaction pooler (PGOPTIONS is
 * dropped there). Not `psql -1`: a file that \i's a preamble committing its own transaction ends
 * psql's early and runs the rest ungoverned (measured on the clone, 2026-09-25).
 * An optional second argument raises the statement ceiling (ms) and a third names why — the
 * same rule `openGateDb` enforces.
 */
import { GATE_DB_LIMITS, GateDbRefusal, limitsSql } from "./lib/gate-db";

const [gate, ceilingArg, reason] = process.argv.slice(2);
if (!gate) {
  console.error("usage: tsx scripts/gate-db-limits.ts <gate-name> [statement-timeout-ms reason]");
  process.exit(2);
}
const ceiling = ceilingArg ? Number(ceilingArg) : GATE_DB_LIMITS.statementTimeoutMs;
if (!(ceiling > 0) || (ceiling > GATE_DB_LIMITS.statementTimeoutMs && !reason?.trim())) {
  console.error(
    new GateDbRefusal(`${gate}: a statement ceiling of ${ceilingArg} ms needs a positive number and, above ${GATE_DB_LIMITS.statementTimeoutMs} ms, a reason.`).message,
  );
  process.exit(2);
}
process.stdout.write(limitsSql(ceiling, gate));

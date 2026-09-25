/**
 * Print the gate database limits as one SQL statement, for a SHELL gate that talks to the live
 * database through psql. The text comes from `scripts/lib/gate-db.ts` — the one definition — so a
 * psql gate and a TypeScript gate can never drift apart.
 *
 *   psql -X -1 -v ON_ERROR_STOP=1 -c "$(pnpm exec tsx scripts/gate-db-limits.ts check:my-gate)" -f my.sql
 *
 * `-1` makes psql run every -c/-f in ONE transaction, which is what lets `set_config(..., true)`
 * govern the whole file through Supavisor's transaction pooler (PGOPTIONS is dropped there).
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

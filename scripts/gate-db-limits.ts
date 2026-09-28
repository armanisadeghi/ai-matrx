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
 * same rule `openGateDb` enforces, including the 30 s live ceiling when PGUSER/PGHOST name production.
 */
import { isLiveConnection } from "./lib/direct-db-env";
import { GateDbRefusal, limitsSql, resolveCeiling } from "./lib/gate-db";

const [gate, ceilingArg, reason] = process.argv.slice(2);
if (!gate) {
  console.error("usage: tsx scripts/gate-db-limits.ts <gate-name> [statement-timeout-ms reason]");
  process.exit(2);
}
// THE LIVE CEILING HOLDS FOR PSQL TOO (2026-09-28). psql connects with the PG* variables the shell
// gate exported before calling this, so they name the connection: on production the default is the
// live 30 s ceiling and more is refused, exactly as `openGateDb` does. Before this, a shell gate
// on live quietly got the 60 s default the TypeScript gates lost on 2026-09-27.
const live = isLiveConnection(process.env.PGUSER ?? "", process.env.PGHOST ?? "");
let ceiling: number;
try {
  ceiling = resolveCeiling(
    {
      gate,
      ...(ceilingArg ? { statementTimeoutMs: Number(ceilingArg), statementTimeoutReason: reason } : {}),
    },
    live,
  );
} catch (err) {
  console.error(err instanceof GateDbRefusal ? err.message : String(err));
  process.exit(2);
}
process.stdout.write(limitsSql(ceiling, gate));

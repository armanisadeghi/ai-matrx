/**
 * THE GUARD EVERY PRODUCTION CONNECTION `connectDirect` HANDS OUT CARRIES.
 *
 * WHY (2026-09-26, common-docs/projects/database-workload-safety/incidents/2026-09-26-long-transaction.md):
 * an agent script opened live through a shared helper, ran a heavy view-equivalence check inside ONE
 * `REPEATABLE READ` transaction, raised its own `statement_timeout` to 900 s with `set local`, and
 * held 273 locks (16 on `auth.*`) for 49 minutes. Migration 1171's role-level `transaction_timeout`
 * is a floor, not the fix: any `postgres` client can `SET` it off, and pooled backends that predate
 * the role change are uncapped.
 *
 * On a connection whose target is production (`isLiveConnection` — the ref read from the
 * CONNECTION, because the clone answers with production's own system identifier):
 *
 *   1. every transaction carries `transaction_timeout` 10 min, `idle_in_transaction_session_timeout`
 *      60 s, `statement_timeout` 30 s (the role's own) and `lock_timeout` 5 s, set with
 *      `set_config(..., true)` — transaction-local, for the Supavisor reasons `gate-db.ts` measured;
 *      a bare statement runs in its own stamped transaction (gate-db's `governTransactions`);
 *   2. a statement that tries to loosen them — `SET`/`SET LOCAL`/`SET SESSION`/`set_config`/
 *      `ALTER … SET` above the limit, `0`, `DEFAULT`, `RESET <guc>`, `RESET ALL` — or to take
 *      `REPEATABLE READ`/`SERIALIZABLE` is refused before it is sent, naming the clone.
 *
 * The migration runners (`pnpm db:apply`, `pnpm db:rehearse`) set their own per-file ceilings and
 * are the one sanctioned exception: they open with `connectDirect(..., { migrationRunner: true })`.
 * Mirror of aidream `db/production_guard.py`.
 */
import { isLiveConnection } from "./direct-db-env";
import { governTransactions, stripSqlComments, toMs, type QueryFn } from "./gate-db";

export const PRODUCTION_LIMITS_MS = {
  statement_timeout: 30_000,
  lock_timeout: 5_000,
  idle_in_transaction_session_timeout: 60_000,
  transaction_timeout: 600_000,
} as const;

type Guc = keyof typeof PRODUCTION_LIMITS_MS;
const GUCS = Object.keys(PRODUCTION_LIMITS_MS) as Guc[];

export const CLONE_REMEDY =
  "Heavy comparisons, equivalence checks and benchmarks run on the CLONE, never on live: point the " +
  "script at the clone (`--target clone`, loadCloneDbEnv(); ref, host and password file in " +
  "common-docs/operations/clone/CURRENT.md). On production run single, bounded statements only.";

/** A statement would have loosened production's limits. It was not sent. Move the work to the clone. */
export class ProductionGuardRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionGuardRefusal";
  }
}

export function isProductionTarget(env: { user: string; host: string }): boolean {
  return isLiveConnection(env.user, env.host);
}

const VAL = String.raw`('[^']*'|"[^"]*"|[\w.]+)`;
const GUC_ALT = GUCS.join("|");
const SET_GUC = new RegExp(String.raw`\bset\s+(?:session\s+|local\s+)?(${GUC_ALT})\s*(?:=|\bto\b)\s*${VAL}`, "gi");
const SET_CONFIG_GUC = new RegExp(String.raw`set_config\s*\(\s*'(${GUC_ALT})'\s*,\s*'([^']*)'`, "gi");
const RESET = new RegExp(String.raw`\breset\s+(${GUC_ALT}|all)\b`, "gi");
const STRONG_ISOLATION = /\bisolation\s+level\s+(repeatable\s+read|serializable)\b/gi;
const ISO_GUC = String.raw`(?:default_)?transaction_isolation`;
const SET_ISO = new RegExp(String.raw`\bset\s+(?:session\s+|local\s+)?(${ISO_GUC})\s*(?:=|\bto\b)\s*${VAL}`, "gi");
const SET_CONFIG_ISO = new RegExp(String.raw`set_config\s*\(\s*'(${ISO_GUC})'\s*,\s*'([^']*)'`, "gi");
const DURATION = /^\s*(-?\d+(?:\.\d+)?)\s*(ms|s|min|h)?\s*$/i;

function loosens(guc: Guc, value: string): string | null {
  const raw = value.trim().replace(/^['"]|['"]$/g, "");
  if (raw.toLowerCase() === "default") return `${guc} = DEFAULT (a pooled backend's default can be uncapped)`;
  const m = DURATION.exec(raw);
  if (!m) return null;
  const ms = toMs(m[1]!, m[2]);
  if (ms === 0) return `${guc} = 0 (no limit)`;
  if (ms > PRODUCTION_LIMITS_MS[guc]) return `${guc} = ${raw} (production limit ${PRODUCTION_LIMITS_MS[guc]} ms)`;
  return null;
}

function strongIso(value: string): boolean {
  const v = value.trim().replace(/^['"]|['"]$/g, "").toLowerCase().replace(/_/g, " ");
  return v === "repeatable read" || v === "serializable";
}

/** Why this statement may not be sent to production, or null when it may. Exported for the test. */
export function productionRefusalFor(sql: string): string | null {
  const text = stripSqlComments(sql);
  const found: string[] = [];
  for (const re of [SET_GUC, SET_CONFIG_GUC]) {
    for (const m of text.matchAll(re)) {
      const why = loosens(m[1]!.toLowerCase() as Guc, m[2]!);
      if (why) found.push(why);
    }
  }
  for (const m of text.matchAll(RESET)) found.push(`RESET ${m[1]!.toLowerCase()}`);
  for (const m of text.matchAll(STRONG_ISOLATION)) found.push(`ISOLATION LEVEL ${m[1]!.toUpperCase().replace(/\s+/g, " ")}`);
  for (const re of [SET_ISO, SET_CONFIG_ISO]) {
    for (const m of text.matchAll(re)) if (strongIso(m[2]!)) found.push(`${m[1]!.toLowerCase()} = ${m[2]}`);
  }
  if (!found.length) return null;
  return (
    `PRODUCTION GUARD REFUSED (not sent): ${found.join("; ")}. On live every transaction is capped at ` +
    "transaction_timeout 10min, idle_in_transaction 60s, statement_timeout 30s, lock_timeout 5s, READ " +
    `COMMITTED — and nothing may loosen that. ${CLONE_REMEDY}`
  );
}

/** The one statement that stamps production's limits on the transaction it runs in. */
export function productionLimitsSql(applicationName: string): string {
  const rows = GUCS.map((g) => `('${g}', '${PRODUCTION_LIMITS_MS[g]}ms')`).join(", ");
  const app = applicationName.replace(/'/g, "''").slice(0, 63);
  // Joined to pg_settings so a server without transaction_timeout (< 17) is never an error.
  return (
    `select set_config(v.name, v.value, true) from (values ${rows}, ('application_name', '${app}')) ` +
    "as v(name, value) join pg_catalog.pg_settings s on s.name = v.name"
  );
}

/** Wrap a pg.Client opened on production so it carries the guard. */
export function governProduction<T extends { query: QueryFn; end: () => Promise<void> }>(
  client: T,
  applicationName: string,
): T {
  const governed = governTransactions(client, {
    limitsSql: productionLimitsSql(applicationName),
    refusal: productionRefusalFor,
    refuse: (why) => new ProductionGuardRefusal(`${applicationName}: ${why}`),
  });
  (governed as { productionGuarded?: boolean }).productionGuarded = true;
  return governed;
}

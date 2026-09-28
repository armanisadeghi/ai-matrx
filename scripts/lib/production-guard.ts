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
 *      `REPEATABLE READ`/`SERIALIZABLE` is refused before it is sent, naming the clone;
 *   3. any GRANT / REVOKE / CREATE (a temp table, dynamic `execute '…'` in a DO block included) is
 *      refused before it is sent — it fires the DDL event triggers that lock auth/storage/realtime until
 *      the transaction ends, rollback or not (incident 2026-09-27; `ddlRefusalFor`). Proofs run on the clone.
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

// Rule 3 — no DDL on live (incident 2026-09-27 22:26–22:46 PT). Any GRANT / REVOKE / CREATE — a temp
// table included, whole migration files replayed "in a transaction that rolls back" included — fires
// the DDL event triggers (Supabase's policy_grants; our ddl_guard / entity_types sync /
// provision_shape_guard, which write platform.entity_types even for a bare CREATE TEMP TABLE — measured
// on the clone 2026-09-28), holding locks on auth/storage/realtime/platform relations until the
// transaction ends. A rolled-back agent proof held them 15–27 s four times; Realtime waited 7–14 s and
// files.files reads hit lock timeouts. Schema changes are migrations (the runners are exempt); proofs
// run on the clone. Mirror of aidream `db/production_guard.py` `ddl_refusal_for`.
const DDL_VERB = String.raw`(create|grant|revoke)\b`;
const DDL_AT_STATEMENT = new RegExp(
  String.raw`(?:^|;|\$[a-z_]*\$|\bbegin\b|\bthen\b|\belse\b|\bloop\b)\s*${DDL_VERB}`,
  "gi",
);
const DDL_DYNAMIC = new RegExp(String.raw`\bexecute\s+(?:format\s*\(\s*)?(?:e)?'\s*${DDL_VERB}`, "gi");

export const DDL_REMEDY =
  "Run the proof on the CLONE (ref, host and password file in common-docs/operations/clone/CURRENT.md); " +
  "a schema change is a migration applied by its runner. On production run single, bounded DML/reads only.";

/** Why this (comment-stripped) text may not reach live because it carries GRANT / REVOKE / CREATE. */
export function ddlRefusalFor(text: string): string | null {
  const unquoted = text.replace(/'(?:[^']|'')*'/g, "''"); // a word inside a string literal is not a statement
  const verbs = new Set<string>();
  for (const m of unquoted.matchAll(DDL_AT_STATEMENT)) verbs.add(m[1]!.toUpperCase());
  for (const m of text.matchAll(DDL_DYNAMIC)) verbs.add(m[1]!.toUpperCase());
  if (!verbs.size) return null;
  return (
    `PRODUCTION GUARD REFUSED (not sent): ${[...verbs].sort().join(" / ")} on live. Every GRANT, REVOKE and ` +
    "CREATE on this database — a temp table included, inside a transaction that rolls back included — fires " +
    "the DDL event triggers (Supabase's policy_grants, our ddl_guard / entity_types sync / provision_shape_guard), " +
    "which lock — ACCESS EXCLUSIVE on auth, storage and realtime relations — and write platform tables until the " +
    "transaction ends (incident 2026-09-27: Realtime stalled 7–14 s, files.files reads hit lock timeouts). " +
    DDL_REMEDY
  );
}

/** Why this statement may not be sent to production, or null when it may. Exported for the test. */
export function productionRefusalFor(sql: string): string | null {
  const text = stripSqlComments(sql);
  const ddl = ddlRefusalFor(text);
  if (ddl) return ddl;
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

/**
 * For a script that builds its own `pg.Client` (a raw client reads whatever it was handed): if the
 * client's connection is production's (`isLiveConnection` on its user/host), it gets the guard; a
 * clone or branch client is returned untouched. Call it right after `new pg.Client(...)`, before
 * `connect()`. `pnpm check:heavy-checks-target-the-clone` names every raw client that reaches live
 * without it (2026-09-27, incident 2026-09-27-per-connection-memory).
 */
export function guardIfProduction<T extends object>(client: T, applicationName: string): T {
  const c = client as unknown as { user?: unknown; host?: unknown };
  if (isProductionTarget({ user: String(c.user ?? ""), host: String(c.host ?? "") })) {
    governProduction(client as unknown as { query: QueryFn; end: () => Promise<void> }, applicationName);
  }
  return client;
}

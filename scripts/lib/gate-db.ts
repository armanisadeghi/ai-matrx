/**
 * THE ONE WAY A GATE TALKS TO A DATABASE.
 *
 * WHY THIS EXISTS (2026-09-25). At 14:30-14:38 UTC the whole live database machine (16 GB RAM,
 * ~9,700 relations, 8,170 functions, 23,176 triggers) froze and Supabase force-rebooted it. The
 * likeliest cause was memory exhaustion from stacked load, and the heaviest recurring load was our
 * OWN gates: the door-rows lanes fanning ~900 function calls over six sessions each, hourly, and
 * `custom.shared_only_disagreements()` running 255-338 s at a time, several at once. Every server
 * connection that touches many catalog objects builds private caches that live as long as the
 * connection does. So every gate now takes its database through here, and this file owns the
 * limits, in one place:
 *
 *   - at most GATE_DB_LIMITS.maxSessions (2) sessions open per gate process — a third is REFUSED,
 *     loudly, never queued (a queue that waits for a slot the caller itself holds is a deadlock);
 *   - every transaction carries `statement_timeout` (60 s unless the gate names a reason for more),
 *     `lock_timeout` (3 s) and `idle_in_transaction_session_timeout` (60 s);
 *   - the transaction is stamped `application_name = gate:<name>`, so `pg_stat_activity` says
 *     which gate is holding a backend instead of "Supavisor";
 *   - a gate closes its sessions when it is done (`withGateDb` does it for you).
 *
 * 🚨 WHY THE LIMITS ARE TRANSACTION-LOCAL AND NEVER A SESSION SET. The live database is reached
 * through Supavisor in TRANSACTION mode (port 6543). Measured on the clone 2026-09-25:
 *   1. startup parameters (`statement_timeout` in the pg config, `options=-c ...`, PGOPTIONS) are
 *      DROPPED on both 6543 and 5432 — the server reports the role default every time;
 *   2. a bare `SET statement_timeout` sticks to whichever POOLED backend ran it and is inherited by
 *      the next, unrelated client (a fresh connection read back a stranger's `90s`);
 *   3. two consecutive client connections landed on the SAME backend pid — closing a client does
 *      NOT end the server process, so its catalog caches survive the gate either way.
 * So this helper sets every limit with `set_config(..., true)` inside the transaction it governs,
 * and REFUSES a session-level SET of a timeout outright. Point 3 means "short-lived connections"
 * bound how many backends a gate holds at once, not how long a fat backend lives; that part is the
 * pooler's (see the owner's report of 2026-09-25).
 */
import pg from "pg";
import type { DbEnv } from "./direct-db";

export const GATE_DB_LIMITS = {
  /** Sessions one gate process may hold open at the same moment. */
  maxSessions: 2,
  /** The default per-statement ceiling. A gate that needs more names why (`statementTimeoutReason`). */
  statementTimeoutMs: 60_000,
  lockTimeoutMs: 3_000,
  idleInTransactionMs: 60_000,
} as const;

export interface GateDbOptions {
  /** The gate's name, as `pnpm` knows it (`check:door-rows`). Stamped on every transaction. */
  readonly gate: string;
  /**
   * Raise the statement ceiling above 60 s. Refused without `statementTimeoutReason`: the reason
   * is the comment the next reader needs, so the helper will not take the number without it.
   */
  readonly statementTimeoutMs?: number;
  readonly statementTimeoutReason?: string;
}

/** A gate asked for something this helper will not do. Never caught and ignored — it is a defect. */
export class GateDbRefusal extends Error {
  constructor(message: string) {
    super(`GATE DB REFUSED: ${message}`);
    this.name = "GateDbRefusal";
  }
}

let openSessions = 0;

/** How many gate sessions this process holds right now (for tests and the guard's self-test). */
export function openGateSessions(): number {
  return openSessions;
}

/**
 * Cap a gate's requested worker count at the session ceiling, and say so when it bites, so a
 * `--pool=6` that quietly ran with 2 is never a mystery.
 */
export function gateSessionCap(requested: number, gate: string): number {
  const cap = GATE_DB_LIMITS.maxSessions;
  const n = Math.max(1, Math.floor(requested) || 1);
  if (n > cap) {
    console.log(
      `[INFO] ${gate}: ${n} database sessions requested; gates are capped at ${cap} ` +
        "(scripts/lib/gate-db.ts — the 2026-09-25 live database freeze). Running with " +
        `${cap}.`,
    );
    return cap;
  }
  return n;
}

// ─── parsing what the gate sends ─────────────────────────────────────────────

const TIMEOUT_GUCS = "statement_timeout|lock_timeout|idle_in_transaction_session_timeout";
const BEGIN_RE = /^\s*(begin|start\s+transaction)\b/i;
const END_RE = /^\s*(commit|end|abort|rollback)(\s+(work|transaction))?\s*(and\s+(no\s+)?chain\s*)?;?\s*$/i;
const SESSION_SET_RE = new RegExp(
  `(^|;)\\s*set\\s+(session\\s+)?(${TIMEOUT_GUCS})\\b`,
  "i",
);
const SESSION_SET_CONFIG_RE = new RegExp(`set_config\\s*\\(\\s*'(${TIMEOUT_GUCS})'\\s*,[^)]*,\\s*false\\s*\\)`, "i");
const VALUE = String.raw`'?\s*(\d+(?:\.\d+)?)\s*(ms|s|min|h)?\s*'?`;
function localSetRe(guc: string): RegExp {
  return new RegExp(String.raw`set\s+local\s+${guc}\s*(?:=|to)\s*${VALUE}`, "gi");
}
function setConfigRe(guc: string): RegExp {
  return new RegExp(String.raw`set_config\s*\(\s*'${guc}'\s*,\s*${VALUE}\s*,\s*true\s*\)`, "gi");
}

export function toMs(n: string, unit: string | undefined): number {
  const v = Number(n);
  switch ((unit ?? "ms").toLowerCase()) {
    case "s":
      return v * 1_000;
    case "min":
      return v * 60_000;
    case "h":
      return v * 3_600_000;
    default:
      return v;
  }
}

/** Strip `--` line comments and `/* *\/` blocks so a comment never trips (or hides) a rule. */
export function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** True when the text holds more than one statement (a simple-protocol batch). */
function isMultiStatement(sql: string): boolean {
  // Dollar-quoted bodies (DO blocks, function bodies) hold semicolons that are not separators.
  const flat = stripSqlComments(sql).replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''");
  const noStrings = flat.replace(/'(?:[^']|'')*'/g, "''");
  return /;\s*\S/.test(noStrings);
}

/**
 * The rules a statement must pass before it reaches the server. Exported for the unit test.
 * Returns the refusal sentence, or null when the statement may run.
 */
export function refusalFor(sql: string, ceilingMs: number): string | null {
  const text = stripSqlComments(sql);
  if (SESSION_SET_RE.test(text) || SESSION_SET_CONFIG_RE.test(text)) {
    return (
      "a session-level SET of a timeout. Through Supavisor's transaction pooler it sticks to a " +
      "pooled backend and is inherited by the next, unrelated client. Use `set local` inside a " +
      "transaction, or pass statementTimeoutMs (with a reason) to openGateDb."
    );
  }
  const ceilings: Array<[string, number, string]> = [
    ["statement_timeout", ceilingMs,
      "Raise the ceiling at openGateDb with statementTimeoutMs and a statementTimeoutReason naming why this gate needs it."],
    ["lock_timeout", GATE_DB_LIMITS.lockTimeoutMs,
      "A gate waiting on a lock sits in the lock queue in front of every production writer behind it; " +
        "retry on 55P03 instead (scripts/lib/census-with-patience.ts)."],
    ["idle_in_transaction_session_timeout", GATE_DB_LIMITS.idleInTransactionMs,
      "An open transaction pins its snapshot and its locks; finish the work, then open the next one."],
  ];
  for (const [guc, ceiling, remedy] of ceilings) {
    for (const re of [localSetRe(guc), setConfigRe(guc)]) {
      for (const m of text.matchAll(re)) {
        const ms = toMs(m[1]!, m[2]);
        if (ms === 0 || ms > ceiling) {
          return `${guc} ${ms === 0 ? "0 (no limit)" : `${ms} ms`} is above this gate's ceiling of ${ceiling} ms. ${remedy}`;
        }
      }
    }
  }
  return null;
}

/**
 * The one statement that carries a gate's limits into the transaction it runs in. Exported so a
 * shell gate (psql) takes the SAME text through `scripts/gate-db-limits.ts` instead of a copy.
 */
export function limitsSql(ceilingMs: number, gate: string): string {
  const app = `gate:${gate}`.replace(/'/g, "''").slice(0, 63);
  return (
    `select set_config('statement_timeout', '${ceilingMs}ms', true), ` +
    `set_config('lock_timeout', '${GATE_DB_LIMITS.lockTimeoutMs}ms', true), ` +
    `set_config('idle_in_transaction_session_timeout', '${GATE_DB_LIMITS.idleInTransactionMs}ms', true), ` +
    `set_config('application_name', '${app}', true)`
  );
}

// ─── the client ──────────────────────────────────────────────────────────────

export type QueryFn = (...args: unknown[]) => Promise<unknown>;

/**
 * Wrap a (connected or not) pg.Client so every statement runs under the gate's limits. Exported
 * so the unit test can drive it with a fake client; gates call `openGateDb`.
 */
export function governClient<T extends { query: QueryFn; end: () => Promise<void> }>(
  client: T,
  opts: GateDbOptions,
): T {
  const ceilingMs = resolveCeiling(opts);
  return governTransactions(client, {
    limitsSql: limitsSql(ceilingMs, opts.gate),
    refusal: (text) => refusalFor(text, ceilingMs),
    refuse: (why) => new GateDbRefusal(`${opts.gate}: ${why}`),
    onEnd: () => {
      openSessions = Math.max(0, openSessions - 1);
    },
  });
}

/**
 * What one governed client enforces: the statement that stamps the limits on a transaction, the
 * rule that refuses a statement before it is sent, and the error it throws. The gate profile is
 * `governClient`; the production profile is `scripts/lib/production-guard.ts` — one control flow.
 */
export interface TransactionPolicy {
  readonly limitsSql: string;
  readonly refusal: (text: string) => string | null;
  readonly refuse: (why: string) => Error;
  readonly onEnd?: () => void;
}

/**
 * Wrap a pg.Client so every transaction it opens carries `policy.limitsSql` (transaction-local),
 * every bare statement runs in its own stamped transaction, and a refused statement never leaves
 * the process.
 */
export function governTransactions<T extends { query: QueryFn; end: () => Promise<void> }>(
  client: T,
  policy: TransactionPolicy,
): T {
  const limits = policy.limitsSql;
  const raw = client.query.bind(client) as QueryFn;
  const rawEnd = client.end.bind(client);
  let inTx = false;
  let ended = false;

  const governed: QueryFn = async (...args: unknown[]) => {
    const first = args[0];
    const text =
      typeof first === "string"
        ? first
        : first && typeof first === "object" && typeof (first as { text?: unknown }).text === "string"
          ? (first as { text: string }).text
          : null;
    // A Submittable (a cursor) or anything without text: pass through untouched, inside
    // whatever transaction the gate opened. Nothing in the gates uses one today.
    if (text === null) return raw(...args);

    const refusal = policy.refusal(text);
    if (refusal) throw policy.refuse(refusal);

    const hasValues = Array.isArray(args[1]) && (args[1] as unknown[]).length > 0;

    if (BEGIN_RE.test(text) && !isMultiStatement(text)) {
      const out = await raw(...args);
      inTx = true;
      await raw(limits);
      return out;
    }
    if (END_RE.test(text)) {
      inTx = false;
      return raw(...args);
    }
    if (inTx) return raw(...args);

    if (!hasValues && isMultiStatement(text)) {
      // A simple-protocol batch runs as ONE implicit transaction; `set_config(..., true)` at its
      // head governs every statement after it (and survives a BEGIN inside the batch). The
      // extra leading result is removed so the caller sees exactly what it asked for.
      const res = (await raw(`${limits};\n${text}`, ...args.slice(1))) as unknown[];
      const rest = res.slice(1);
      return rest.length === 1 ? rest[0] : rest;
    }

    // A bare statement: its own short transaction, so the limits hold for it and die with it.
    await raw("begin");
    try {
      await raw(limits);
      const out = await raw(...args);
      await raw("commit");
      return out;
    } catch (err) {
      await raw("rollback").catch(() => undefined);
      throw err;
    }
  };

  (client as { query: QueryFn }).query = governed;
  (client as { end: () => Promise<void> }).end = async () => {
    if (ended) return;
    ended = true;
    policy.onEnd?.();
    await rawEnd();
  };
  return client;
}

function resolveCeiling(opts: GateDbOptions): number {
  const ms = opts.statementTimeoutMs ?? GATE_DB_LIMITS.statementTimeoutMs;
  if (!(ms > 0)) throw new GateDbRefusal(`${opts.gate}: statementTimeoutMs must be positive.`);
  if (ms > GATE_DB_LIMITS.statementTimeoutMs && !opts.statementTimeoutReason?.trim()) {
    throw new GateDbRefusal(
      `${opts.gate}: statementTimeoutMs ${ms} is above the ${GATE_DB_LIMITS.statementTimeoutMs} ms ` +
        "default and names no statementTimeoutReason.",
    );
  }
  return ms;
}

/** Reserve a session slot or refuse. Exported for the unit test. */
export function reserveGateSession(gate: string): void {
  if (openSessions >= GATE_DB_LIMITS.maxSessions) {
    throw new GateDbRefusal(
      `${gate}: a ${openSessions + 1}th database session. Gates hold at most ` +
        `${GATE_DB_LIMITS.maxSessions} at once — cap the worker count with gateSessionCap().`,
    );
  }
  openSessions++;
}

/**
 * Open one governed session. The caller MUST `end()` it — `withGateDb` does that for you.
 * `env` is the same five-variable bag `loadDbEnv()` / `loadCloneDbEnv()` return.
 */
export async function openGateDb(
  env: Pick<DbEnv, "host" | "port" | "user" | "password" | "database">,
  opts: GateDbOptions,
): Promise<pg.Client> {
  resolveCeiling(opts); // refuse a bad ceiling before a socket opens
  reserveGateSession(opts.gate);
  const client = new pg.Client({
    host: env.host,
    port: env.port,
    user: env.user,
    password: env.password,
    database: env.database,
    ssl: { rejectUnauthorized: false },
    application_name: `gate:${opts.gate}`.slice(0, 63),
    connectionTimeoutMillis: 15_000,
  });
  // Count the slot back if the connection never opens.
  const governed = governClient(client as unknown as { query: QueryFn; end: () => Promise<void> }, opts);
  try {
    await client.connect();
  } catch (err) {
    await governed.end().catch(() => undefined);
    throw err;
  }
  return client;
}

/** Open, run, and always close. */
export async function withGateDb<T>(
  env: Pick<DbEnv, "host" | "port" | "user" | "password" | "database">,
  opts: GateDbOptions,
  fn: (db: pg.Client) => Promise<T>,
): Promise<T> {
  const db = await openGateDb(env, opts);
  try {
    return await fn(db);
  } finally {
    await db.end().catch(() => undefined);
  }
}

/**
 * ONE RUN AT A TIME, ACROSS EVERY MACHINE. Call inside a transaction the gate already opened; it
 * takes a transaction-scoped advisory lock on `key` (released by the commit/rollback, so it is safe
 * through the transaction pooler — a SESSION advisory lock would stick to a pooled backend). False
 * means another run holds it right now: the caller skips, and says so loudly.
 */
export async function tryGateLock(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> },
  key: string,
): Promise<boolean> {
  const { rows } = await client.query(
    "select pg_try_advisory_xact_lock(hashtextextended($1, 0)) as got",
    [`matrx-gate:${key}`],
  );
  return (rows[0] as { got?: boolean } | undefined)?.got === true;
}

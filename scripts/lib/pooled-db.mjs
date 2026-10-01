/**
 * pooled-db.mjs — THE ONE WAY A SCRIPT REACHES A SUPABASE DATABASE THROUGH THE POOLER.
 *
 * Incident 2026-10-01 08:31–10:14Z: the aidream server's writes failed "cannot execute UPDATE in a
 * read-only transaction". Proven on the clone (common-docs v5/PROGRESS-POOLER-LEAK-GUARD.md):
 *   · a SESSION-level SET sent through the TRANSACTION pooler (:6543) stays on that backend and the
 *     pooler hands it to the next client — the server. Any GUC: default_transaction_read_only,
 *     statement_timeout, lock_timeout, role, search_path.
 *   · the SESSION pooler (:5432, same host) resets a backend between clients — a leaked SET dies with
 *     the client — and its pool is separate from the server's.
 *   · a `begin read only; …; rollback` whose rollback never ran (error, timeout, killed psql) is
 *     cleaned by the pooler at disconnect; it is hygiene, not this incident's cause.
 *
 * So: production is reached on the SESSION pooler only (6543 is refused by name); read-only work is
 * one `begin read only` with `set local` limits and a rollback that always runs; nothing is ever
 * `set` at session level. Guard: `pnpm check:no-session-read-only`. Sweeper: `pnpm pooler:sweep`.
 *
 *   import { dsnFor, psqlRead, withReadOnly } from "./lib/pooled-db.mjs";
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FRONTEND = resolve(HERE, "..", "..");
export const CODE = resolve(FRONTEND, "..");
export const PRODUCTION_REF = "brsgrqvjdzwihsvnfqkf";
export const TRANSACTION_POOLER_PORT = "6543";
export const SESSION_POOLER_PORT = "5432";
export const PSQL = process.env.PSQL || "/opt/homebrew/opt/libpq/bin/psql";

function envFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}

/** The environment, then aidream/.env, then matrx-frontend/.env.local (first that has the key). */
function lookup(key) {
  return process.env[key] ?? envFile(join(CODE, "aidream/.env"))[key] ?? envFile(join(FRONTEND, ".env.local"))[key];
}

export function currentCloneRef() {
  const text = readFileSync(join(CODE, "common-docs/operations/clone/CLONE-REF"), "utf8");
  return (text.match(/^clone_ref\s*=\s*(\S+)/m) ?? [])[1] ?? null;
}

/** True when a DSN names the production project (pooler user `postgres.<ref>` or its direct hosts). */
export function isProductionDsn(dsn) {
  try {
    const u = new URL(dsn);
    const user = decodeURIComponent(u.username);
    return user.endsWith(`.${PRODUCTION_REF}`) || u.hostname === "db.matrxserver.com" || u.hostname.includes(PRODUCTION_REF);
  } catch {
    return dsn.includes(PRODUCTION_REF);
  }
}

export class PoolerRefusal extends Error {}

/** Refuse production through the transaction pooler. Returns the DSN unchanged when it is safe. */
export function refuseTransactionPoolerForProduction(dsn) {
  let port = null;
  try { port = new URL(dsn).port || SESSION_POOLER_PORT; } catch { port = (dsn.match(/:(\d{4,5})\//) ?? [])[1] ?? null; }
  if (isProductionDsn(dsn) && port === TRANSACTION_POOLER_PORT) {
    throw new PoolerRefusal(
      "refused: production through the TRANSACTION pooler (:6543) — a session-level SET there is handed to the " +
        "aidream server's next query. Use dsnFor('production') (session pooler :5432).",
    );
  }
  return dsn;
}

function withApp(dsn, app) {
  const u = new URL(dsn);
  if (app) u.searchParams.set("application_name", app.slice(0, 63));
  return u.toString();
}

/**
 * The DSN for a target, always on the SESSION pooler (:5432 of the same pooler host).
 *   production — SUPABASE_MATRIX_* (aidream/.env); the clone — CLONE_DATABASE_URL, proven to name CLONE-REF.
 */
export function dsnFor(target, { app = "matrx-script" } = {}) {
  if (target === "production") {
    const [user, password, host, db] = ["USER", "PASSWORD", "HOST", "DATABASE_NAME"].map((k) => lookup(`SUPABASE_MATRIX_${k}`));
    if (!user || !password || !host) throw new PoolerRefusal("SUPABASE_MATRIX_USER/PASSWORD/HOST not found (env, aidream/.env, .env.local)");
    const dsn = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${SESSION_POOLER_PORT}/${db || "postgres"}`;
    return refuseTransactionPoolerForProduction(withApp(dsn, app));
  }
  if (target === "clone") {
    const url = lookup("CLONE_DATABASE_URL");
    const ref = currentCloneRef();
    if (!url || !ref || !url.includes(`postgres.${ref}`)) {
      throw new PoolerRefusal(`CLONE_DATABASE_URL does not name the current clone (${ref}); aidream: uv run python scripts/clone/refresh_clone.py --publish-current`);
    }
    const u = new URL(url);
    u.port = SESSION_POOLER_PORT;
    return withApp(u.toString(), app);
  }
  throw new PoolerRefusal(`unknown target ${target} (production | clone)`);
}

/**
 * The TRANSACTION-pooler DSN — for the sweeper only, whose job is to visit that pool.
 * Never hand this to work: work goes through dsnFor().
 */
export function transactionPoolDsnForSweeper(target, app = "pooler-sweep") {
  const d = new URL(dsnFor(target, { app }));
  d.port = TRANSACTION_POOLER_PORT;
  return d.toString();
}

/** The read-only wrapper: transaction-scoped limits, and a rollback psql always reaches (ON_ERROR_STOP=0). */
export function readOnlyBody(sql, { statementTimeout = "60s", idleTimeout = "90s" } = {}) {
  return (
    "begin read only;\n" +
    `set local statement_timeout = '${statementTimeout}';\n` +
    `set local idle_in_transaction_session_timeout = '${idleTimeout}';\n` +
    `${sql.trim().replace(/;?\s*$/, ";")}\n` +
    "rollback;\n"
  );
}

/**
 * Run read-only SQL through psql. The body goes on stdin (-f -), never one `-c` string; any ERROR fails.
 * Returns { ok, stdout, stderr }.
 */
export function psqlRead(target, sql, { app, statementTimeout, timeoutMs = 120_000, args = ["-X", "-qAt"] } = {}) {
  const dsn = dsnFor(target, { app });
  const r = spawnSync(PSQL, [dsn, "-v", "ON_ERROR_STOP=0", ...args, "-f", "-"], {
    input: readOnlyBody(sql, { statementTimeout }),
    encoding: "utf8",
    timeout: timeoutMs,
  });
  const stderr = r.stderr ?? "";
  const ok = r.status === 0 && !/^(psql:.*)?ERROR:/m.test(stderr) && !/ERROR:/.test(stderr);
  return { ok, stdout: (r.stdout ?? "").replace(/\n?$/, ""), stderr };
}

/** A node-postgres client for a DSN (Supabase's chain is not in Node's store; libpq-style require). */
export function pgClient(pg, dsn) {
  const u = new URL(dsn);
  u.searchParams.delete("sslmode");
  return new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false }, query_timeout: 120_000 });
}

/**
 * node-postgres read-only unit: begin read only + set local limits, fn(client), ROLLBACK in finally.
 */
export async function withReadOnly(target, fn, { app, statementTimeout = "60s" } = {}) {
  const pg = (await import("pg")).default;
  const client = pgClient(pg, dsnFor(target, { app }));
  await client.connect();
  try {
    await client.query("begin read only");
    await client.query(`set local statement_timeout = '${statementTimeout}'`);
    await client.query("set local idle_in_transaction_session_timeout = '90s'");
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

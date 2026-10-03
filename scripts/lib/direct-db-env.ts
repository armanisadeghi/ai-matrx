/**
 * WHERE the direct Postgres connection's five variables come from — the one
 * resolution `scripts/lib/direct-db.ts` (`pnpm db:apply`, `pnpm db:based-on`,
 * `pnpm check:migrations`) and the live-DB jest suites share.
 *
 * Split out of `direct-db.ts` because that module locates the repo root through
 * `import.meta.url`, which ts-jest (CommonJS) cannot compile — so a jest suite
 * that needed the connection used to re-implement the lookup, and read a
 * different file (`../aidream/.env` only) than the applier did. This file takes
 * the root as an argument and imports nothing that needs ESM, so both kinds of
 * caller resolve the SAME variables from the SAME places in the SAME order.
 */
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import process from "node:process";

export const DB_VARS = [
  "SUPABASE_MATRIX_USER",
  "SUPABASE_MATRIX_PASSWORD",
  "SUPABASE_MATRIX_HOST",
  "SUPABASE_MATRIX_PORT",
  "SUPABASE_MATRIX_DATABASE_NAME",
] as const;

export interface DbEnv {
  readonly user: string;
  readonly password: string;
  readonly host: string;
  readonly port: number;
  readonly database: string;
  /** Where the five variables came from, so the operator is never guessing. */
  readonly from: string;
}

export interface DbEnvMissing {
  /** The variables absent from the environment itself (the CI source). */
  readonly missing: string[];
  readonly looked: string[];
}

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]!] = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
  }
  return out;
}

/**
 * The five connection variables, resolved against `root` (the matrx-frontend
 * checkout). The environment first; then this repo's env files; then the
 * aidream checkout's `.env` — and the answer always SAYS which one it used.
 */
export function loadDbEnvFrom(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): DbEnv | DbEnvMissing {
  const looked: string[] = [];
  const tryBag = (bag: Record<string, string | undefined>, from: string): DbEnv | null => {
    if (DB_VARS.some((k) => !bag[k])) return null;
    return {
      user: bag.SUPABASE_MATRIX_USER!,
      password: bag.SUPABASE_MATRIX_PASSWORD!,
      host: bag.SUPABASE_MATRIX_HOST!,
      port: Number(bag.SUPABASE_MATRIX_PORT!),
      database: bag.SUPABASE_MATRIX_DATABASE_NAME!,
      from,
    };
  };

  const fromProcess = tryBag(env, "the environment");
  if (fromProcess) return fromProcess;

  const candidates = [
    resolve(root, ".env.local"),
    resolve(root, ".env.production.local"),
    resolve(root, ".env.production"),
    resolve(root, ".env"),
    resolve(env.AIDREAM_DIR ?? resolve(root, "..", "aidream"), ".env"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    looked.push(relative(root, path));
    const hit = tryBag(parseEnvFile(path), relative(root, path));
    if (hit) return hit;
  }
  return { missing: DB_VARS.filter((k) => !env[k]), looked };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE DOOR EVERY LIVE TEST SUITE TAKES.
//
// Owner ruling (Arman, 2026-10-03): tests run on the LIVE database (db.matrxserver.com) as
// admin@admin.com. The nightly clone is ONLY for rehearsing destructive migrations and jobs that
// lock for 10+ minutes. So a test suite takes the same five variables the operator tools take —
// the live connection — and nothing repoints it. A suite whose body does DDL (a planted function,
// a mutant body) asks `rehearsalDbEnvFrom` for that part and skips it, by name, when no rehearsal
// target was given for the run.
// ─────────────────────────────────────────────────────────────────────────────

/** The ONE live database, by the identities a connection can carry. */
export const LIVE_PROJECT_REFS = ["brsgrqvjdzwihsvnfqkf"] as const;
export const LIVE_HOSTS = ["db.matrxserver.com", "db.brsgrqvjdzwihsvnfqkf.supabase.co"] as const;

export function isLiveConnection(user: string, host: string): boolean {
  const ref = user.includes(".") ? user.slice(user.indexOf(".") + 1) : "";
  return (
    (LIVE_PROJECT_REFS as readonly string[]).includes(ref) ||
    (LIVE_HOSTS as readonly string[]).includes(host.trim().toLowerCase())
  );
}

function fromUrl(url: string, from: string): DbEnv {
  const u = new URL(url);
  return {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    host: u.hostname,
    port: Number(u.port || 5432),
    database: u.pathname.replace(/^\//, "") || "postgres",
    from,
  };
}

/** The connection a TEST uses: the live database. Throws UNMEASURED when the variables are missing. */
export function testDbEnvFrom(root: string, opts: { env?: NodeJS.ProcessEnv } = {}): DbEnv {
  const base = loadDbEnvFrom(root, opts.env ?? process.env);
  if (!("user" in base)) {
    throw new Error(
      `UNMEASURED: direct DB variables missing: ${base.missing.join(", ")} (looked in ${base.looked.join(", ") || "the environment"}).`,
    );
  }
  return base;
}

/** The per-run variable naming a rehearsal database (the nightly clone) for a suite's DDL part. */
export const REHEARSAL_URL_VAR = "CLONE_DATABASE_URL";

/**
 * A rehearsal target for the DDL part of a suite, or null — then that part is skipped, by name.
 * Read from the PROCESS environment only (an explicit choice for this run, e.g.
 * `CLONE_DATABASE_URL=… npx jest <suite>`), never from the env files, and refused if it names live.
 */
export function rehearsalDbEnvFrom(opts: { env?: NodeJS.ProcessEnv } = {}): DbEnv | null {
  const url = (opts.env ?? process.env)[REHEARSAL_URL_VAR];
  if (!url) return null;
  const target = fromUrl(url, `${REHEARSAL_URL_VAR} (the environment)`);
  if (isLiveConnection(target.user, target.host)) {
    throw new Error(`REFUSED: ${REHEARSAL_URL_VAR} names the LIVE database; it cannot be a rehearsal target.`);
  }
  return target;
}

/** The rehearsal target for a script whose whole job is DDL (installing a body); thrown when absent. */
export function requireRehearsalDbEnv(why: string, opts: { env?: NodeJS.ProcessEnv } = {}): DbEnv {
  const target = rehearsalDbEnvFrom(opts);
  if (!target) {
    throw new Error(`REHEARSAL ONLY: ${why} is DDL and never runs on live. Set ${REHEARSAL_URL_VAR} for this run. Nothing was run.`);
  }
  return target;
}

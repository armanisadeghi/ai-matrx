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
// THE DOOR EVERY LIVE TEST SUITE TAKES (lane INTEG-SERVER, 2026-09-24).
//
// `loadDbEnvFrom` answers whatever the env files name — for a developer that is the LIVE
// database, because the server runs on it. That is right for the operator tools (`pnpm
// db:apply`) and wrong for a test: two live jest suites ran a migration inside a transaction
// and scanned `chat.conversation` on production whenever they ran. A test suite asks HERE:
//
//   · a connection that is not the live database (a local Postgres, the branch, the clone) is
//     returned as it is;
//   · a live one is REPOINTED to `MATRX_TEST_DATABASE_URL` (any declared non-live target — the dev
//     clone), else `SUPABASE_BRANCH_DATABASE_URL` (the rehearsal branch), read from the
//     environment and then the same env files;
//   · with neither, it is REFUSED — thrown, so the suite fails; unmeasured is never a pass;
//   · live on purpose: `MATRX_LIVE_DB=1` + `MATRX_LIVE_DB_REASON` inside 1–4 AM Pacific.
//
// The same rule, the same identities and the same window as aidream's pytest guard
// (`matrx_orm.pytest_live_db_guard`).
// ─────────────────────────────────────────────────────────────────────────────

/** The ONE live database, by the identities a connection can carry. */
export const LIVE_PROJECT_REFS = ["brsgrqvjdzwihsvnfqkf"] as const;
export const LIVE_HOSTS = ["db.matrxserver.com", "db.brsgrqvjdzwihsvnfqkf.supabase.co"] as const;
export const TEST_TARGET_URL_VARS = ["MATRX_TEST_DATABASE_URL", "SUPABASE_BRANCH_DATABASE_URL"] as const;

export function isLiveConnection(user: string, host: string): boolean {
  const ref = user.includes(".") ? user.slice(user.indexOf(".") + 1) : "";
  return (
    (LIVE_PROJECT_REFS as readonly string[]).includes(ref) ||
    (LIVE_HOSTS as readonly string[]).includes(host.trim().toLowerCase())
  );
}

function pacificHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false })
      .format(now)
      .replace(/\D/g, ""),
  ) % 24;
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

function lookUp(root: string, env: NodeJS.ProcessEnv, key: string): string | undefined {
  if (env[key]) return env[key];
  for (const path of [
    resolve(root, ".env.local"),
    resolve(root, ".env"),
    resolve(env.AIDREAM_DIR ?? resolve(root, "..", "aidream"), ".env"),
  ]) {
    if (!existsSync(path)) continue;
    const hit = parseEnvFile(path)[key];
    if (hit) return hit;
  }
  return undefined;
}

/** The connection a TEST may use. Throws with the reason when there is none. */
export function testDbEnvFrom(
  root: string,
  opts: { env?: NodeJS.ProcessEnv; now?: Date } = {},
): DbEnv {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const base = loadDbEnvFrom(root, env);
  if (!("user" in base)) {
    throw new Error(
      `UNMEASURED: direct DB variables missing: ${base.missing.join(", ")} (looked in ${base.looked.join(", ") || "the environment"}).`,
    );
  }
  if (!isLiveConnection(base.user, base.host)) return base;
  if (env.MATRX_LIVE_DB === "1") {
    const reason = (env.MATRX_LIVE_DB_REASON ?? "").trim();
    if (!reason) {
      throw new Error("REFUSED: MATRX_LIVE_DB=1 needs MATRX_LIVE_DB_REASON — nothing else records why a test touched the live database.");
    }
    const hour = pacificHour(now);
    if (hour < 1 || hour >= 4) {
      throw new Error(`REFUSED: it is ${hour}:xx Pacific; the live database is open to tests only 01:00–04:00 Pacific.`);
    }
    return { ...base, from: `${base.from} · LIVE on purpose: ${reason}` };
  }
  for (const key of TEST_TARGET_URL_VARS) {
    const url = lookUp(root, env, key);
    if (!url) continue;
    const target = fromUrl(url, `${key} (the live database was configured; this test uses ${key} instead)`);
    if (isLiveConnection(target.user, target.host)) {
      throw new Error(`REFUSED: ${key} names the LIVE database; it cannot be a test target.`);
    }
    return target;
  }
  throw new Error(
    "REFUSED: the env files name the LIVE database and no test target is set. Set MATRX_TEST_DATABASE_URL " +
      "(e.g. the dev clone) or SUPABASE_BRANCH_DATABASE_URL; live on purpose is MATRX_LIVE_DB=1 + " +
      "MATRX_LIVE_DB_REASON inside 1–4 AM Pacific. Nothing was run.",
  );
}

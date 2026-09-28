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

// ── THE TEST TARGET FOLLOWS CLONE-REF (list-shell fix D, 2026-09-28) ─────────────────────────
//
// The dev clone is re-made every night under a NEW project ref, and CLONE-REF
// (`common-docs/operations/clone/CLONE-REF`) is re-written to name it. A `MATRX_TEST_DATABASE_URL`
// saved in `.env.local` names ONE night's clone and is dead the next morning: the access-gate live
// suites failed "tenant/user postgres.hykobnqyuxspbcijrodb not found" against a clone deleted
// days earlier. So, the same identity `pnpm db:apply --target clone` uses
// (`scripts/lib/migration-target.ts` loadCloneRef + loadCloneDbEnv), in this order:
//   1. an EXPLICIT per-run override — MATRX_TEST_DATABASE_URL / SUPABASE_BRANCH_DATABASE_URL set
//      in the process environment — wins (refused if it names the live database);
//   2. else tonight's clone from CLONE-REF: its DSN variable (`password_env_var`, verified to name
//      the clone's own pooler user/host) or its identities + `password_file`;
//   3. else a target saved in the env FILES — but one naming a different Supabase clone than
//      CLONE-REF's is stale and is skipped with that said, never silently connected to.
// Re-implemented here (not imported) because migration-target.ts is ESM and exits the process,
// and this module must stay loadable by ts-jest and must THROW.

interface TestCloneRef {
  readonly cloneRef: string;
  readonly cloneName: string;
  readonly poolerHost: string;
  readonly poolerPort: number;
  readonly poolerUser: string;
  readonly database: string;
  readonly passwordEnvVar: string;
  readonly passwordFile: string;
  readonly promoted: string;
  readonly path: string;
}

export function cloneRefPathFor(root: string, env: NodeJS.ProcessEnv = process.env): string {
  return env.MATRX_CLONE_REF
    ? resolve(env.MATRX_CLONE_REF)
    : resolve(root, "..", "common-docs", "operations", "clone", "CLONE-REF");
}

function readCloneRef(path: string): TestCloneRef | null {
  if (!existsSync(path)) return null;
  const bag: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([a-z_]+)\s*=\s*(.+?)\s*$/);
    if (m) bag[m[1]!] = m[2]!;
  }
  const need = ["clone_ref", "pooler_host", "pooler_port", "pooler_user", "database", "password_env_var"];
  if (need.some((k) => !bag[k])) {
    throw new Error(`REFUSED: CLONE-REF at ${path} is missing ${need.filter((k) => !bag[k]).join(", ")}.`);
  }
  return {
    cloneRef: bag.clone_ref!,
    cloneName: bag.clone_name ?? bag.clone_ref!,
    poolerHost: bag.pooler_host!,
    poolerPort: Number(bag.pooler_port!),
    poolerUser: bag.pooler_user!,
    database: bag.database!,
    passwordEnvVar: bag.password_env_var!,
    passwordFile: bag.password_file ?? "",
    promoted: bag.promoted ?? "",
    path,
  };
}

/** Tonight's clone as a test target, or null when CLONE-REF or its password is not on this machine. */
function cloneTargetFrom(root: string, env: NodeJS.ProcessEnv, ref: TestCloneRef): DbEnv | null {
  const label = `CLONE-REF ${ref.cloneName} (${ref.cloneRef}${ref.promoted ? `, promoted ${ref.promoted}` : ""})`;
  const dsn = lookUp(root, env, ref.passwordEnvVar);
  if (dsn) {
    const target = fromUrl(dsn, `${label} via ${ref.passwordEnvVar}`);
    // A DSN variable left from an older night names a dead clone: fall through to the password file.
    if (target.user === ref.poolerUser && target.host === ref.poolerHost) return target;
  }
  if (!ref.passwordFile || !existsSync(ref.passwordFile)) return null;
  const password = readFileSync(ref.passwordFile, "utf8").trim();
  if (!password) return null;
  return {
    user: ref.poolerUser,
    password,
    host: ref.poolerHost,
    port: ref.poolerPort,
    database: ref.database,
    from: `${label} + its password file`,
  };
}

function supabaseRefOf(user: string, host: string): string {
  const dot = user.indexOf(".");
  if (dot > 0) return user.slice(dot + 1);
  return /^(?:db\.)?([a-z0-9]+)\.supabase\.(?:co|com)$/i.exec(host)?.[1] ?? "";
}

/** The connection a TEST may use. Throws with the reason when there is none. */
export function testDbEnvFrom(
  root: string,
  opts: { env?: NodeJS.ProcessEnv; now?: Date; cloneRefPath?: string } = {},
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
  const asTarget = (key: string, url: string, where: string): DbEnv => {
    const target = fromUrl(url, `${key} ${where} (the live database was configured; this test uses ${key} instead)`);
    if (isLiveConnection(target.user, target.host)) {
      throw new Error(`REFUSED: ${key} names the LIVE database; it cannot be a test target.`);
    }
    return target;
  };
  // 1. An explicit per-run override wins.
  for (const key of TEST_TARGET_URL_VARS) {
    if (env[key]) return asTarget(key, env[key]!, "(the environment)");
  }
  // 2. Tonight's clone, from CLONE-REF.
  const ref = readCloneRef(opts.cloneRefPath ?? cloneRefPathFor(root, env));
  const clone = ref ? cloneTargetFrom(root, env, ref) : null;
  if (clone) {
    if (isLiveConnection(clone.user, clone.host)) {
      throw new Error(`REFUSED: CLONE-REF (${ref!.path}) resolves to the LIVE database; it cannot be a test target.`);
    }
    return clone;
  }
  // 3. A target saved in the env files — unless it names a different Supabase clone than CLONE-REF's.
  const stale: string[] = [];
  for (const key of TEST_TARGET_URL_VARS) {
    const url = lookUp(root, env, key);
    if (!url) continue;
    const target = asTarget(key, url, "(env files)");
    const savedRef = supabaseRefOf(target.user, target.host);
    if (ref && savedRef && savedRef !== ref.cloneRef) {
      stale.push(`${key} names ${savedRef}, but tonight's clone is ${ref.cloneRef}`);
      continue;
    }
    return target;
  }
  if (stale.length) {
    throw new Error(
      `REFUSED: the saved test target is stale (${stale.join("; ")}) and tonight's clone password is not on this ` +
        `machine (${ref!.passwordEnvVar} or ${ref!.passwordFile || "the password_file CLONE-REF names"}). Nothing was run.`,
    );
  }
  throw new Error(
    "REFUSED: the env files name the LIVE database and no test target is set. Set MATRX_TEST_DATABASE_URL " +
      "(e.g. the dev clone) or SUPABASE_BRANCH_DATABASE_URL; live on purpose is MATRX_LIVE_DB=1 + " +
      "MATRX_LIVE_DB_REASON inside 1–4 AM Pacific. Nothing was run.",
  );
}

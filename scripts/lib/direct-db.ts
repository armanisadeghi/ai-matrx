/**
 * The DIRECT Postgres connection this repo's database tooling uses.
 *
 * Extracted from `scripts/apply-migration.ts` (DD-149) when a second tool —
 * `pnpm db:based-on`, and the DD-220 arm of `pnpm check:migrations` — needed the
 * same five variables and the same "say where they came from" behaviour. One
 * definition, so a second copy can never drift into reading a different env file
 * or quietly downgrading to a weaker transport.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { NoticeMessage } from "pg-protocol/dist/messages.js";
import type { QueryFn } from "./gate-db";
import { governProduction, isProductionTarget } from "./production-guard";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

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
 * The five connection variables. This repo's env files first; the aidream
 * checkout's `.env` second — the same fallback `scripts/hr/*.py` already use,
 * except that this one SAYS SO on every run instead of reaching across silently.
 */
export function loadDbEnv(): DbEnv | DbEnvMissing {
  const looked: string[] = [];
  const tryBag = (bag: Record<string, string | undefined>, from: string): DbEnv | null => {
    const missing = DB_VARS.filter((k) => !bag[k]);
    if (missing.length) return null;
    return {
      user: bag.SUPABASE_MATRIX_USER!,
      password: bag.SUPABASE_MATRIX_PASSWORD!,
      host: bag.SUPABASE_MATRIX_HOST!,
      port: Number(bag.SUPABASE_MATRIX_PORT!),
      database: bag.SUPABASE_MATRIX_DATABASE_NAME!,
      from,
    };
  };

  const fromProcess = tryBag(process.env, "the environment");
  if (fromProcess) return fromProcess;

  const candidates = [
    resolve(ROOT, ".env.local"),
    resolve(ROOT, ".env.production.local"),
    resolve(ROOT, ".env.production"),
    resolve(ROOT, ".env"),
    resolve(process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream"), ".env"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    looked.push(relative(ROOT, path));
    const hit = tryBag(parseEnvFile(path), relative(ROOT, path));
    if (hit) return hit;
  }
  return { missing: [...DB_VARS], looked };
}

export interface ConnectDirectOptions {
  /**
   * The migration runners (`pnpm db:apply`, `pnpm db:rehearse`) set their own per-file ceilings and
   * are the ONE sanctioned exception to the production guard. Nothing else passes this.
   */
  readonly migrationRunner?: boolean;
}

/**
 * Open the connection. Callers that run DDL must still pin + verify the role.
 *
 * On PRODUCTION the client carries the production guard (`./production-guard.ts`, incident
 * 2026-09-26): every transaction is capped (10 min / 60 s idle / 30 s statement / 5 s lock) and a
 * statement that loosens a cap or takes REPEATABLE READ/SERIALIZABLE is refused before it is sent.
 * Heavy comparisons and benchmarks go to the clone (`loadCloneDbEnv`).
 */
export async function connectDirect(
  env: DbEnv,
  applicationName: string,
  onNotice?: (n: NoticeMessage) => void,
  options: ConnectDirectOptions = {},
): Promise<pg.Client> {
  const client = new pg.Client({
    host: env.host,
    port: env.port,
    user: env.user,
    password: env.password,
    database: env.database,
    ssl: { rejectUnauthorized: false },
    application_name: applicationName,
    connectionTimeoutMillis: 15_000,
  });
  if (onNotice) client.on("notice", onNotice);
  await client.connect();
  if (!options.migrationRunner && isProductionTarget(env)) {
    governProduction(client as unknown as { query: QueryFn; end: () => Promise<void> }, applicationName);
  }
  return client;
}

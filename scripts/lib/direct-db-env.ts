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
export function loadDbEnvFrom(root: string): DbEnv | DbEnvMissing {
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

  const fromProcess = tryBag(process.env, "the environment");
  if (fromProcess) return fromProcess;

  const candidates = [
    resolve(root, ".env.local"),
    resolve(root, ".env.production.local"),
    resolve(root, ".env.production"),
    resolve(root, ".env"),
    resolve(process.env.AIDREAM_DIR ?? resolve(root, "..", "aidream"), ".env"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    looked.push(relative(root, path));
    const hit = tryBag(parseEnvFile(path), relative(root, path));
    if (hit) return hit;
  }
  return { missing: DB_VARS.filter((k) => !process.env[k]), looked };
}

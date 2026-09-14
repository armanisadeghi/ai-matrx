/**
 * THE ONE credential loader and catalog reader behind every guard that reads
 * `knob_resolve` call sites out of the live database.
 *
 * It exists because there are now two of them — `check:knob-resolve-callers`
 * (DD-198: is the argument an array?) and `check:knob-database-consumers`
 * (DD-211: which RUNGS does it name?) — and two copies of "where do the
 * credentials come from" would drift the moment one learned about a new env
 * file. Both import from here.
 *
 * No fallback ladder and no silent skip: a guard that cannot reach the database
 * measured NOTHING, and unmeasured is a failure, never a pass.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pg: any = require_("pg");

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const DB_VARS = [
  "SUPABASE_MATRIX_USER",
  "SUPABASE_MATRIX_PASSWORD",
  "SUPABASE_MATRIX_HOST",
  "SUPABASE_MATRIX_PORT",
  "SUPABASE_MATRIX_DATABASE_NAME",
] as const;

export interface DbEnv {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
  from: string;
}

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, eq).trim()] = v;
  }
  return out;
}

export function loadDbEnv(): DbEnv | { missing: readonly string[]; looked: string[] } {
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
  for (const path of [
    resolve(ROOT, ".env.local"),
    resolve(ROOT, ".env.production.local"),
    resolve(ROOT, ".env.production"),
    resolve(ROOT, ".env"),
    resolve(process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream"), ".env"),
  ]) {
    if (!existsSync(path)) continue;
    looked.push(relative(ROOT, path));
    const hit = tryBag(parseEnvFile(path), relative(ROOT, path));
    if (hit) return hit;
  }
  return { missing: DB_VARS, looked };
}

/** Every function body in the live catalog that mentions `knob_resolve`, except knob_resolve itself. */
export const CATALOG_SQL = `
  select n.nspname || '.' || p.proname as fn, p.prosrc as body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where strpos(lower(p.prosrc), 'knob_resolve') > 0
     and not (n.nspname = 'platform' and p.proname = 'knob_resolve')
   order by 1`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function client(env: DbEnv, applicationName: string): any {
  return new pg.Client({
    host: env.host,
    port: env.port,
    user: env.user,
    password: env.password,
    database: env.database,
    ssl: { rejectUnauthorized: false },
    application_name: applicationName,
    connectionTimeoutMillis: 20_000,
  });
}

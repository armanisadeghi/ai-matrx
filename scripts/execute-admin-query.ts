#!/usr/bin/env npx tsx
/**
 * Execute one SQL file through the existing service-role-only
 * `public.execute_admin_query` operator door.
 *
 * SQL stays in a caller-owned file outside the repository, so scheduled workers
 * do not create per-run helper scripts that an integration sweep can commit.
 * The query and credentials are never printed; only the RPC result is emitted.
 *
 * Usage: pnpm admin-query --file /tmp/query.sql
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;

function loadEnv(): Record<(typeof ENV_KEYS)[number], string> {
  const env: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};
  for (const key of ENV_KEYS) {
    if (process.env[key]) env[key] = process.env[key];
  }
  for (const filename of [
    ".env.local",
    ".env.production.local",
    ".env.production",
    ".env",
  ]) {
    const path = resolve(ROOT, filename);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (!match) continue;
      const [_, rawKey, rawValue] = match;
      const key = ENV_KEYS.find((candidate) => candidate === rawKey);
      if (key && !env[key]) env[key] = rawValue?.replace(/^['"]|['"]$/g, "");
    }
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error("Supabase operator credentials are unavailable");
  }
  return env as Record<(typeof ENV_KEYS)[number], string>;
}

function argValue(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1])
    return process.argv[index + 1] ?? null;
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : null;
}

async function main(): Promise<void> {
  const input = argValue("file");
  if (!input)
    throw new Error("Pass one SQL file with --file /absolute/query.sql");
  const sqlPath = isAbsolute(input) ? input : resolve(process.cwd(), input);
  if (!existsSync(sqlPath))
    throw new Error(`SQL file does not exist: ${sqlPath}`);

  const env = loadEnv();
  if (new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname !== "db.matrxserver.com") {
    throw new Error("Refusing to use a non-canonical database");
  }

  const query = readFileSync(sqlPath, "utf8").trim();
  if (!query) throw new Error("SQL file is empty");
  const client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.rpc("execute_admin_query", { query });
  if (error) throw new Error(error.message);
  console.log(JSON.stringify(data, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

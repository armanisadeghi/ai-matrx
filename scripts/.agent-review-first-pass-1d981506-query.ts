#!/usr/bin/env npx tsx
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env: Record<string, string> = {};
for (const filename of [".env.local", ".env.production.local", ".env.production", ".env"]) {
  const path = resolve(root, filename);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"].includes(key!) && !env[key!]) {
      env[key!] = raw!.replace(/^['"]|['"]$/g, "");
    }
  }
}

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
  throw new Error("Supabase credentials unavailable");
}
if (new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname !== "db.matrxserver.com") {
  throw new Error("Refusing non-canonical database");
}

const sqlPath = process.argv[2];
if (!sqlPath) throw new Error("SQL path is required");
async function main(): Promise<void> {
  const sql = readFileSync(resolve(root, sqlPath), "utf8");
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc("execute_admin_query", { query: sql });
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
}

void main().catch((error: unknown) => {
  console.error(JSON.stringify(error, null, 2));
  process.exitCode = 1;
});

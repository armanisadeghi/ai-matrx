import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = resolve(import.meta.dirname, "..");
const values: Record<string, string> = {};
for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"]) {
  if (process.env[name]) values[name] = process.env[name] as string;
}
for (const filename of [".env.local", ".env.production.local", ".env.production", ".env"]) {
  const path = resolve(root, filename);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (key && raw && !values[key]) values[key] = raw.replace(/^['"]|['"]$/g, "");
  }
}

const url = values.NEXT_PUBLIC_SUPABASE_URL;
const secret = values.SUPABASE_SECRET_KEY;
const queryPath = process.argv[2];
if (!url || !secret || !queryPath) throw new Error("Missing admin-query input");
if (new URL(url).hostname !== "db.matrxserver.com") throw new Error("Refusing non-canonical database URL");

const query = readFileSync(resolve(root, queryPath), "utf8");
async function main(): Promise<void> {
  const client = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client
    .schema("public")
    .rpc("execute_admin_query", { query });
  if (error) throw error;
  console.log(JSON.stringify(data));
}

void main();

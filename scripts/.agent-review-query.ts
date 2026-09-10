import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string> = {};
for (const file of [".env.local", ".env.production.local", ".env.production", ".env"]) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (key && raw && !env[key]) env[key] = raw.replace(/^['"]|['"]$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SECRET_KEY;
const queryPath = process.argv[2];

if (!url || !key || !queryPath) throw new Error("Missing database configuration or query path");
if (new URL(url).hostname !== "db.matrxserver.com") throw new Error("Refusing non-canonical database URL");

async function main(): Promise<void> {
  const query = readFileSync(resolve(process.cwd(), queryPath as string), "utf8");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  });
  const { data, error } = await client.rpc("execute_admin_query", { query });
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
}

void main();

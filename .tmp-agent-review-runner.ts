import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = resolve(import.meta.dirname);
const envText = readFileSync(resolve(root, ".env.local"), "utf8");
const readEnv = (name: string) => {
  const line = envText.split("\n").find((candidate) => candidate.startsWith(`${name}=`));
  return line?.slice(name.length + 1).replace(/^['"]|['"]$/g, "") ?? "";
};
const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const key = readEnv("SUPABASE_SECRET_KEY");
if (url !== "https://db.matrxserver.com" || !key) throw new Error("Live admin DB configuration unavailable");
async function main() {
  const query = readFileSync(resolve(root, ".tmp-agent-review-query.sql"), "utf8");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc("execute_admin_query", { query });
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
}

void main().catch((error) => {
  console.error(JSON.stringify(error, null, 2));
  process.exitCode = 1;
});

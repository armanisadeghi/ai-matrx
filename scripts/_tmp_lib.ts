import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
const ROOT = process.cwd();
function parseEnvFile(p: string) { const out: Record<string,string> = {}; for (const line of readFileSync(p,"utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) out[m[1]] = (m[2]??"").replace(/^['"]|['"]$/g,""); } return out; }
const VARS = ["SUPABASE_MATRIX_USER","SUPABASE_MATRIX_PASSWORD","SUPABASE_MATRIX_HOST","SUPABASE_MATRIX_PORT","SUPABASE_MATRIX_DATABASE_NAME"];
export function client() {
  let bag: Record<string,string> = {};
  for (const f of [".env.local",".env.production.local",".env.production",".env", resolve(ROOT,"..","aidream",".env")]) {
    const p = f.startsWith("/") ? f : resolve(ROOT,f); if (!existsSync(p)) continue;
    const b = parseEnvFile(p); if (VARS.every(v=>b[v])) { bag = b; break; }
  }
  return new pg.Client({ user: bag.SUPABASE_MATRIX_USER, password: bag.SUPABASE_MATRIX_PASSWORD, host: bag.SUPABASE_MATRIX_HOST, port: Number(bag.SUPABASE_MATRIX_PORT), database: bag.SUPABASE_MATRIX_DATABASE_NAME, ssl: { rejectUnauthorized: false } });
}

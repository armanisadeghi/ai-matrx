// Read-only SQL over the same direct connection the runner uses.
import { readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";
const ROOT = "/Users/armanisadeghi/code/matrx-frontend";
function parseEnvFile(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
    }
  } catch {}
  return out;
}
const bag = { ...parseEnvFile(ROOT + "/.env"), ...parseEnvFile("/Users/armanisadeghi/code/aidream/.env"), ...parseEnvFile(ROOT + "/.env.local") };
const cfg = {
  user: bag.SUPABASE_MATRIX_USER, password: bag.SUPABASE_MATRIX_PASSWORD,
  host: bag.SUPABASE_MATRIX_HOST, port: Number(bag.SUPABASE_MATRIX_PORT),
  database: bag.SUPABASE_MATRIX_DATABASE_NAME, ssl: { rejectUnauthorized: false },
  statement_timeout: 600000,
};
if (!cfg.user) { console.error("NO CREDS"); process.exit(2); }
const sql = process.argv[2] === "-f" ? readFileSync(process.argv[3], "utf8") : process.argv.slice(2).join(" ");
const c = new pg.Client(cfg);
await c.connect();
try {
  const r = await c.query(sql);
  const rows = Array.isArray(r) ? r : [r];
  for (const res of rows) {
    if (res.command === "SELECT" || res.rows?.length) {
      if (process.env.RAW === "1") { for (const row of res.rows) console.log(Object.values(row).join("\n")); }
      else console.log(JSON.stringify(res.rows, null, 1));
    } else console.log(res.command, res.rowCount ?? "");
  }
} catch (e) { console.error("SQLSTATE", e.code, e.message, e.where ?? ""); process.exitCode = 1; }
await c.end();

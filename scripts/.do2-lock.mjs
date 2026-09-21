import pg from "pg";
import { readFileSync } from "node:fs";
let dsn = null;
for (const f of ["/Users/armanisadeghi/code/matrx-frontend/.env.local", "/Users/armanisadeghi/code/aidream/.env"]) {
  try { for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*SUPABASE_BRANCH_DATABASE_URL\s*=\s*(.*?)\s*$/);
    if (m) dsn = m[1].replace(/^['"]|['"]$/g, "");
  } } catch {}
}
if (!dsn) { console.error("no SUPABASE_BRANCH_DATABASE_URL"); process.exit(1); }
const c = new pg.Client({ connectionString: dsn, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(process.argv[2]);
console.log(JSON.stringify(r.rows ?? [], null, 1), "rowCount", r.rowCount);
await c.end();

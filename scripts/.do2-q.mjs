import { readFileSync } from "node:fs";
import pg from "pg";
const bag = {};
for (const line of readFileSync("/Users/armanisadeghi/code/aidream/.env", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) bag[m[1]] = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
}
const c = new pg.Client({
  user: bag.SUPABASE_MATRIX_USER, password: bag.SUPABASE_MATRIX_PASSWORD,
  host: bag.SUPABASE_MATRIX_HOST, port: +bag.SUPABASE_MATRIX_PORT,
  database: bag.SUPABASE_MATRIX_DATABASE_NAME, ssl: { rejectUnauthorized: false },
});
c.on("notice", (n) => console.log("NOTICE:", n.message));
await c.connect();
const sql = process.argv[2] === "-f" ? readFileSync(process.argv[3], "utf8") : process.argv[2];
try {
  const r = await c.query(sql);
  for (const x of (Array.isArray(r) ? r : [r])) {
    if (x.rows && x.rows.length) console.log(JSON.stringify(x.rows, null, 1));
    else console.log(`-- ${x.command ?? ""} ${x.rowCount ?? ""}`);
  }
} catch (e) { console.log("ERR", e.code, e.message); process.exitCode = 1; }
await c.end();

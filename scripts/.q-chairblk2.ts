import { loadDbEnv, connectDirect } from "./lib/direct-db";
const sql = require("fs").readFileSync(process.argv[2], "utf8");
(async () => {
  const env = loadDbEnv(); if (!("host" in env)) throw new Error("no env");
  const c = await connectDirect(env as any, "CHAIR-ENTITY-BLOCKS-2-q");
  try { const r: any = await c.query(sql); const rs = Array.isArray(r) ? r : [r];
    for (const x of rs) if (x.rows?.length) console.log(JSON.stringify(x.rows, null, 1)); }
  catch (e: any) { console.log("ERR", e.code, e.message); } finally { await c.end(); }
})();

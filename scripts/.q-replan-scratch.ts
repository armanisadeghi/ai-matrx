import { readFileSync } from "node:fs";
import { connectCheckDirect } from "./lib/check-target";
(async () => {
  const sql = readFileSync(process.argv[2], "utf8");
  const { client } = await connectCheckDirect({ gate: "doors-decide-replan-probe", defaultTarget: "clone", argv: process.argv.slice(3) });
  try {
    const r: any = await client.query(sql);
    const results = Array.isArray(r) ? r : [r];
    for (const x of results) if (x.rows?.length) console.log(JSON.stringify(x.rows, null, 1));
  } finally { await client.end(); }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });

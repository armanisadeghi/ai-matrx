import { readFileSync } from "node:fs";
import { connectCheckDirect } from "./lib/check-target";
(async () => {
  const { client } = await connectCheckDirect({ gate: "doors-decide-replan-bench", defaultTarget: "clone", argv: process.argv.slice(3) });
  client.on("notice", (n: any) => console.log("NOTICE", n.message));
  try { await client.query(readFileSync(process.argv[2], "utf8")); await client.query(readFileSync(process.argv[2], "utf8")); } finally { await client.end(); }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });

import { open, q } from "./_dd4_lib.mts";
import { readFileSync } from "node:fs";
const c = await open();
const sql = process.argv[2].startsWith("@") ? readFileSync(process.argv[2].slice(1), "utf8") : process.argv[2];
const r = await q(c, sql);
for (const x of r) console.log(Object.values(x).join(" | ").slice(0, 400));
await c.end();

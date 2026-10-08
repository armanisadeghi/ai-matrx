import { readFileSync } from "node:fs";
import { loadDbEnv, connectDirect } from "./lib/direct-db";
async function main() {
  const env = loadDbEnv(); if (!("host" in env)) throw new Error("no db env");
  const c = await connectDirect(env as never, "walk-fixes-2-test", (n) => console.log("NOTICE", n.message));
  const sql = readFileSync(process.argv[2], "utf8").split("\n").filter((l) => !l.startsWith("\\")).join("\n");
  try { await c.query(sql); } catch (e) { console.log("ERROR", (e as Error).message); try { await c.query("rollback"); } catch {} }
  await c.end();
}
void main();

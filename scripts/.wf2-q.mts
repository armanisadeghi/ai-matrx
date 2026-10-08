import { loadDbEnv, connectDirect } from "/Users/armanisadeghi/code/matrx-frontend/scripts/lib/direct-db";
async function main() {
const env = loadDbEnv(); if (!("host" in env)) throw new Error("no db env");
const c = await connectDirect(env as never, "walk-fixes-2-read");
const r = await c.query(process.argv[2]);
for (const row of r.rows) console.log(Object.values(row).join("\t"));
await c.end(); }
void main();

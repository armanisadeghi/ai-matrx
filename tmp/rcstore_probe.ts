import { readFileSync } from "node:fs";
import { connectDirect } from "../scripts/lib/direct-db";
import { loadCloneDbEnv, loadCloneRef, topLevelStatementsVerbatim, stripCommentsQuoteAware } from "../scripts/lib/migration-target";
const root = process.cwd();
const ref = loadCloneRef(root);
const env = loadCloneDbEnv(root, ref);
async function main(){ const c = await connectDirect({ ...env } as any, "probe");
  const sql = readFileSync("migrations/rcstore_b_document_store.sql", "utf8");
  const stmts = topLevelStatementsVerbatim(stripCommentsQuoteAware(sql));
  await c.query("begin");
  await c.query("set local application_name = 'probe'"); await c.query("set local lock_timeout = '5s'"); await c.query("set local statement_timeout = '10min'"); await c.query("set local statement_timeout = '60s'");
  for (let i = 0; i < 8; i++) { try { await c.query(stmts[i]!); } catch (e: any) { console.log("FAIL", i+1, e.message, e.detail, e.hint); const r0 = await c.query("rollback"); await c.end(); return; } }
  const r = await c.query("select platform.provision_preflight() p, current_setting('session_replication_role') srr, current_user cu");
  console.log(JSON.stringify(r.rows[0]));
  await c.query("rollback"); await c.end(); } main();

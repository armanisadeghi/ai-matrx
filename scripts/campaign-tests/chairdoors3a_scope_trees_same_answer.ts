import pg from "pg";
import { testDbEnvFrom } from "../lib/direct-db-env";
const ROOT = "/Users/armanisadeghi/code/matrx-frontend";
const SEATS = ["87a6e699-3622-4869-8843-d0867456c0dd", "4060701e-706a-4c76-b3ca-0bbc69fa5a14"];
async function main() {
  const env = testDbEnvFrom(ROOT);
  const c = new pg.Client({ user: env.user, password: env.password, host: env.host, database: env.database, port: 5432, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("begin isolation level repeatable read read only");
  await c.query("set local statement_timeout = '600s'");
  let total = 0, same = 0; const diffs: string[] = [];
  for (const uid of SEATS) {
    const orgs = (await c.query("select organization_id::text as o from iam.organization_member where user_id = $1::uuid order by 1", [uid])).rows.map((r) => r.o as string);
    const strangers = (await c.query("select o.id::text as o from iam.organizations o where o.archived_at is null and not exists (select 1 from iam.organization_member m where m.organization_id = o.id and m.user_id = $1::uuid) order by o.created_at limit 5", [uid])).rows.map((r) => r.o as string);
    const all = [...orgs, ...strangers];
    await c.query("select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)", [uid]);
    await c.query("set local role authenticated");
    const batched = new Map<string, string>();
    for (const r of (await c.query("select org_id::text as o, answer::text as a from public.get_scope_trees($1::uuid[], null)", [all])).rows) batched.set(r.o, r.a);
    for (const o of all) {
      total++;
      await c.query("savepoint s");
      let single: string;
      try { single = (await c.query("select public.get_scope_tree($1::uuid, null)::text as a", [o])).rows[0].a; await c.query("release savepoint s"); }
      catch (e) { await c.query("rollback to savepoint s"); single = `ERR ${(e as { code?: string }).code}`; }
      const b = batched.get(o) ?? "(no row)";
      const ok = single === b || (single.startsWith("ERR") && b === "(no row)");
      if (ok) same++; else diffs.push(`${uid.slice(0, 8)}@${o.slice(0, 8)}: single ${single.slice(0, 40)}… batched ${b.slice(0, 40)}…`);
    }
    await c.query("reset role");
  }
  await c.query("rollback"); await c.end();
  console.log(`get_scope_trees = get_scope_tree per organization: ${same} of ${total} (members + 5 strangers per seat; a refusal = no row)`);
  for (const d of diffs.slice(0, 10)) console.log("  differ:", d);
}
main().catch((e) => { console.error(e); process.exit(2); });

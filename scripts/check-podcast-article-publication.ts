/** D347: exercise real anonymous RLS on the quarantined dev clone, always rollback. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { takeBuildLock, releaseBuildLock, type LockQuery } from "./lib/build-lock";
import { openProductionReadOnly } from "./lib/clone-parity";
import { connectDirect } from "./lib/direct-db";
import { cloneRefOverride, loadCloneRef, loadCloneDbEnv, readQuarantineFacts } from "./lib/migration-target";

async function main() {
  const root = process.cwd();
  const ref = loadCloneRef(root, cloneRefOverride(process.argv.slice(2)));
  const env = loadCloneDbEnv(root, ref); // verifies connection ref; no production fallback
  const db = await connectDirect(env, "d347-publication-rollback-test");
  const files = ["d347_anonymous_publication_contract.sql", "d347_pc_articles_published_anon.sql"];
  const sql = files.map((f) => readFileSync(resolve(root, "migrations", f), "utf8"));
  let inTransaction = false;
  const held: string[] = [];
  const lane = `D347-VERIFY-${process.pid}`;
  const query: LockQuery = async (q, params) => (await db.query(q, params)).rows;
  try {
    await db.query("begin read only"); inTransaction = true;
    assert((await readQuarantineFacts((q) => db.query(q))).quarantined, "clone quarantine absent");
    await db.query("rollback"); inTransaction = false;
    for (const family of ["iam", "platform"]) {
      const lock = await takeBuildLock(query, family, lane, "D347 rollback-only publication test", "clone");
      assert(lock.held, lock.message);
      held.push(family);
    }
    await db.query("begin"); inTransaction = true;
    await db.query("set local lock_timeout='2s'; set local statement_timeout='45s'");
    assert((await readQuarantineFacts((q) => db.query(q))).quarantined, "clone quarantine absent");
    const basedOn = [...sql[0]!.matchAll(/^-- based-on: (\S+) ([a-f0-9]{64})$/gm)];
    const originalBodies = new Map<string, string>();
    for (const match of basedOn) {
      const result = await db.query<{ definition: string }>("select pg_get_functiondef($1::regprocedure) definition", [match[1]]);
      originalBodies.set(match[1]!, result.rows[0]!.definition);
    }
    if (process.argv.includes("--stage-production-baseline")) {
      // Other clone rehearsals may be ahead. Stage exact production bodies ONLY in this
      // private transaction; no other session can see them and the final rollback restores
      // the clone's own bodies. Production is opened with the canonical read-only helper.
      const production = await openProductionReadOnly(ref.parentRef);
      try {
        for (const match of basedOn) {
          const rows = await production.q("select pg_get_functiondef($1::regprocedure) definition", [match[1]]);
          const definition = rows[0]?.definition;
          assert.equal(typeof definition, "string");
          if (typeof definition !== "string") throw new Error("production body missing");
          assert.equal(createHash("sha256").update(definition).digest("hex"), match[2], `stale production function ${match[1]}`);
          await db.query(definition);
        }
      } finally { await production.client.end(); }
      console.log("Controlled baseline: exact checksum-verified production bodies staged inside rollback-only clone transaction.");
    }
    for (const match of basedOn) {
      const result = await db.query<{ definition: string }>("select pg_get_functiondef($1::regprocedure) definition", [match[1]]);
      assert.equal(createHash("sha256").update(result.rows[0]!.definition).digest("hex"), match[2], `stale function ${match[1]}`);
    }
    const policies = async () => (await db.query("select polname,polcmd,polpermissive,polroles::text,pg_get_expr(polqual,polrelid) qual,pg_get_expr(polwithcheck,polrelid) chk from pg_policy where polrelid='podcast.pc_articles'::regclass order by polname")).rows;
    const before = await policies();
    const authBefore = before.filter((p) => !["pub_read", "pc_articles_anon_published_only"].includes(p.polname));
    const fingerprint = async () => (await db.query("select iam.entity_read_kernel_fingerprint() actual,iam.entity_read_kernel_expected() expected")).rows;
    const fingerprintBefore = await fingerprint();
    let adminId = "";
    const counts = async (role: "anon" | "authenticated") => {
      await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims','{}',true)", [role === "anon" ? "" : adminId]);
      await db.query(`set local role ${role}`);
      try { return (await db.query<{status: string; n: number}>("select status,count(id)::int n from podcast.pc_articles group by status order by status")).rows; }
      finally { await db.query("reset role"); }
    };
    const admin = await db.query<{ id: string }>("select id from auth.users where email='admin@admin.com'");
    assert.equal(admin.rowCount, 1, "exactly one test admin required");
    adminId = admin.rows[0]!.id;
    const authRowsBefore = await counts("authenticated");
    await db.query(sql[0]!);
    // First migration is complete; a failed second migration must leave its declaration NULL.
    await db.query("savepoint second_migration");
    await assert.rejects(db.query(sql[1]! + "\nSELECT 1/0;"), /division by zero/);
    await db.query("rollback to savepoint second_migration");
    assert.equal((await db.query("select anonymous_read_status from platform.entity_types where token='pc_article'")).rows[0].anonymous_read_status, null);
    assert.deepEqual(await policies(), before, "failed application left partial policies");
    // Reproduce the original leak without the existing unrecorded clone prototype.
    await db.query("select iam.supersede_bespoke_policies('podcast','pc_articles',array['pc_articles_anon_published_only'],'D347 rollback-only regression test temporarily removes the clone prototype to reproduce the production draft exposure.') where exists(select 1 from pg_policy where polrelid='podcast.pc_articles'::regclass and polname='pc_articles_anon_published_only')");
    const red = await counts("anon");
    assert(red.some((r) => r.status === "draft" && r.n > 0), "RED witness missing: clone must contain readable drafts");
    const published = red.find((r) => r.status === "published")?.n;
    assert(published && published > 0, "published witness missing");
    await db.query(sql[1]!);
    const green = await counts("anon");
    assert.deepEqual(green, [{ status: "published", n: published }]);
    assert.deepEqual(await counts("authenticated"), authRowsBefore);
    const after = await policies();
    assert.deepEqual(after.find((p) => p.polname === "pub_read"), before.find((p) => p.polname === "pub_read"));
    assert.deepEqual(after.filter((p) => !["pub_read", "anon_status_gate"].includes(p.polname)), authBefore);
    const verify = async () => (await db.query("select * from iam.verify_canonical('podcast','pc_articles','pc_article') where status='FAIL'")).rows;
    assert.deepEqual(await verify(), [], "canonical verification failed");
    await db.query("select iam.apply_rls('podcast','pc_articles','pc_article','entity')");
    assert.deepEqual(await policies(), after, "regeneration is not idempotent");
    assert.deepEqual(await counts("anon"), green);
    await db.query("alter policy anon_status_gate on podcast.pc_articles to authenticated");
    assert((await verify()).some((r) => r.check_name === "anonymous_read_status"), "verifier missed wrong role");
    await db.query("select iam.apply_rls('podcast','pc_articles','pc_article','entity')");
    await db.query("alter policy anon_status_gate on podcast.pc_articles using (true)");
    assert((await verify()).some((r) => r.check_name === "anonymous_read_status"), "verifier missed a widened policy");
    await db.query("select iam.apply_rls('podcast','pc_articles','pc_article','entity')");
    assert.deepEqual(await verify(), []);
    assert.deepEqual(await counts("anon"), green);
    // NULL is backward-compatible and must remove the previously generated gate.
    await db.query("update platform.entity_types set anonymous_read_status=null where token='pc_article'");
    await db.query("select iam.apply_rls('podcast','pc_articles','pc_article','entity')");
    assert.deepEqual(await counts("anon"), red);
    assert.deepEqual(await verify(), []);
    await db.query("update platform.entity_types set anonymous_read_status='published' where token='pc_article'");
    await db.query("select iam.apply_rls('podcast','pc_articles','pc_article','entity')");
    assert.deepEqual(await counts("anon"), green);
    await db.query("savepoint invalid_declaration");
    await db.query("update platform.entity_types set anonymous_read_status='published' where token='pc_show'");
    await assert.rejects(db.query("select iam.apply_rls('podcast','pc_shows','pc_show','entity')"), /requires .*text status column/);
    await db.query("rollback to savepoint invalid_declaration");
    assert.deepEqual(await verify(), []);
    assert.deepEqual(await fingerprint(), fingerprintBefore, "unrelated kernel fingerprint moved");
    console.log(JSON.stringify({ result: "PASS", clone: ref.cloneRef, before: red, after: green, authenticatedUnchanged: true, canonical: "PASS", regeneration: "PASS", widenedPolicyDetected: true, nullDeclaration: "PASS", kernelUnchanged: true }));
    await db.query("rollback"); inTransaction = false;
    assert.deepEqual(await policies(), before, "rollback changed original policy state");
    for (const [signature, definition] of originalBodies) {
      assert.equal((await db.query("select pg_get_functiondef($1::regprocedure) definition", [signature])).rows[0].definition, definition, `rollback changed ${signature}`);
    }
    console.log("PASS: all database changes rolled back; original policies restored.");
  } finally {
    if (inTransaction) await db.query("rollback");
    for (const family of held.reverse()) await releaseBuildLock(query, family, lane, "clone");
    await db.end();
  }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });

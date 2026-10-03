#!/usr/bin/env node
// LANE 9 SCOPES-ON-THE-STORE, sublane C — ONE CALL FOR MANY ORGANIZATIONS ANSWERS WHAT ONE CALL EACH DID.
//
//   node scripts/campaign-tests/scopesc_the_scope_trees_answer_what_the_scope_tree_answers.mjs [--plant <name>]
//
// THE CHANGE UNDER TEST: public.get_scope_trees(uuid[], uuid)
// (migrations/campaign/scopesc_the_scope_tree_asks_who_may_see_what_once_for_every_organization.sql), which the
// server's batched scope reader (matrx_records ScopeReader.scopes) asks instead of
//   select o.org, public.get_scope_tree(o.org, null) from unnest($1) o(org) where iam.has_org_access(o.org)
//
// For admin@admin.com and test@test.com (the two test seats, never a real person), as that person under row
// security, on the nightly clone: EVERY organization the seat is in (with or without scope types — an
// organization with none must still come back as `[]`, and one the seat may not open must stay absent), plus
// one stranger organization neither seat is in. The expected answer is the old statement's, run in the same
// transaction: the same organizations, in the same order, each answer text-equal. Then, per organization, every
// scope type alone (p_type_id) against public.get_scope_tree(org, type). Run with the store-read switch as it
// is (off on production) AND switched on inside the transaction (custom/scope_readers_read_the_store), so both
// branches of the door are proven. Nothing survives: every transaction rolls back.
//
// --plant <name> breaks the door IN THE TRANSACTION ONLY (never on disk) and the run must go RED:
//   order     the organizations come back in reverse order
//   readable  every live scope is listed, not only the ones the person may read
//   access    an organization the person may not open is answered too
//   empty     an organization with no scope it may read comes back as something other than []
//   type      the scope-type filter is ignored
// EXIT 0 GREEN (no plant, no difference) · 1 RED. Clone only.
import { dsnFor, pgClient } from "../lib/pooled-db.mjs";

const args = process.argv.slice(2);
const PLANT = args.includes("--plant") ? args[args.indexOf("--plant") + 1] : null;
const SEATS = {
  "admin@admin.com": "87a6e699-3622-4869-8843-d0867456c0dd",
  "test@test.com": "4060701e-706a-4c76-b3ca-0bbc69fa5a14",
};
const FN = "public.get_scope_trees(uuid[], uuid)";
// THE FORCING ROW. Neither seat has a scope it may not read inside an organization it may open (both see every
// scope of their organizations), so the "readable" half of the door would be unexercised. Inside the
// transaction, Cedar Ridge Physical Therapy's patient scope "Dana Whitfield" (admin@admin.com made it) is made
// personal to its maker: test@test.com, a plain member there, may then open the organization but not read that
// scope. The run proves the old answer drops it before comparing anything (a forcing row that does not take is RED).
const FORCE = { seat: "test@test.com", org: "0a54df90-eab8-4d07-ab29-81a45fb41e04", scope: "f3cf712a-d07b-41cd-b6bc-5dd3fb662ae4" };

// The door's own body, read back from the catalogue, with ONE fault written into it — so a plant is the
// shipped door minus one behaviour, never a hand-written look-alike.
const PLANTS = {
  order: (src) => src.replaceAll("order by o.ord", "order by o.ord desc"),
  readable: (src) => src.replace("and s.id in (select r.id from readable r)", "and true"),
  access: (src) => src.replaceAll("where iam.has_org_access(o.org)", "where true"),
  empty: (src) => src.replace("), '[]'::jsonb)", "), '[{}]'::jsonb)"),
  type: (src) => src.replace("and (p_type_id is null or s.scope_type_id = p_type_id)", "and true").replace("public.get_scope_tree(o.org, p_type_id)", "public.get_scope_tree(o.org, null)"),
};
if (PLANT && !PLANTS[PLANT]) throw new Error(`unknown plant ${PLANT}: ${Object.keys(PLANTS).join(" | ")}`);

async function run(pg, email, uid, storeSwitch) {
  const c = pgClient(pg, dsnFor("clone", { app: "scopesc-same-answer" }));
  await c.connect();
  const diffs = [];
  try {
    await c.query("begin");
    await c.query("set local statement_timeout = '300s'");
    await c.query("set local lock_timeout = '10s'");
    if (PLANT) {
      const src = (await c.query(`select pg_get_functiondef('${FN}'::regprocedure) d`)).rows[0].d;
      const broken = PLANTS[PLANT](src);
      if (broken === src) throw new Error(`plant ${PLANT} did not change the door's body — the plant is stale`);
      await c.query(broken);
    }
    if (storeSwitch) {
      await c.query(
        `update platform.feature_knob set value = 'true'::jsonb
          where feature = 'custom' and key = 'scope_readers_read_the_store'`,
      );
    }
    const knob = (await c.query("select platform.knob_resolve('custom', 'scope_readers_read_the_store', null) #>> '{}' k")).rows[0].k;
    if (String(knob) !== String(storeSwitch)) throw new Error(`the store switch reads ${knob}, wanted ${storeSwitch}`);
    // Every organization the seat is in or created, plus one stranger organization (the first live one it is
    // not in), asked in a fixed order.
    const orgs = (
      await c.query(
        `with mine as (
           select m.organization_id id from iam.organization_member m where m.user_id = $1
           union select o.id from iam.organizations o where o.created_by = $1)
         (select id::text from mine order by id)
         union all
         (select o.id::text from iam.organizations o where o.archived_at is null and o.id not in (select id from mine)
           order by o.id limit 1)`,
        [uid],
      )
    ).rows.map((r) => r.id);
    if (email === FORCE.seat) {
      const n = (await c.query("update custom.record set visibility = 'personal' where id = $1 and organization_id = $2", [FORCE.scope, FORCE.org])).rowCount;
      if (n !== 1) diffs.push(`the forcing row did not take (${n} rows)`);
    }
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await c.query("set local role authenticated");
    const t0 = performance.now();
    const old = (
      await c.query(
        `select o.org::text org, public.get_scope_tree(o.org, null::uuid)::text answer
           from unnest($1::uuid[]) as o(org) where iam.has_org_access(o.org)`,
        [orgs],
      )
    ).rows;
    const tOld = performance.now() - t0;
    const t1 = performance.now();
    const now = (await c.query(`select org_id::text org, answer::text answer from public.get_scope_trees($1::uuid[], null::uuid)`, [orgs])).rows;
    const tNew = performance.now() - t1;
    if (old.length === 0) diffs.push("the old statement answered no organization — nothing was compared");
    if (old.length !== now.length) diffs.push(`organizations: old ${old.length}, new ${now.length}`);
    for (let i = 0; i < Math.max(old.length, now.length); i++) {
      const a = old[i], b = now[i];
      if (!a || !b || a.org !== b.org) diffs.push(`row ${i}: old org ${a?.org}, new org ${b?.org}`);
      else if (a.answer !== b.answer) diffs.push(`org ${a.org}: answers differ (old ${a.answer.length} chars, new ${b.answer.length})`);
    }
    if (email === FORCE.seat) {
      const cr = old.find((r) => r.org === FORCE.org);
      if (!cr) diffs.push("the forcing organization was not answered");
      else if (JSON.parse(cr.answer).some((x) => x.id === FORCE.scope)) diffs.push("the forcing scope is still readable — the readable half is unexercised");
    }
    const scopes = old.reduce((n, r) => n + JSON.parse(r.answer).length, 0);
    // Each scope type alone.
    const types = (
      await c.query(
        `select o.org::text org, (t ->> 'id') type_id
           from unnest($1::uuid[]) o(org), lateral jsonb_array_elements(public.list_scope_types(o.org)) t
          where iam.has_org_access(o.org)`,
        [orgs],
      )
    ).rows;
    for (const { org, type_id } of types) {
      const a = (await c.query("select public.get_scope_tree($1::uuid, $2::uuid)::text a", [org, type_id])).rows[0].a;
      const b = (await c.query("select answer::text b from public.get_scope_trees(array[$1::uuid], $2::uuid)", [org, type_id])).rows[0]?.b;
      if (a !== b) diffs.push(`org ${org} type ${type_id}: answers differ`);
    }
    return { seat: email, store_switch: storeSwitch, organizations_asked: orgs.length, organizations_answered: old.length, scopes, types: types.length, old_ms: Math.round(tOld), new_ms: Math.round(tNew), diffs };
  } catch (err) {
    diffs.push(`the run raised ${err.code ?? ""} ${String(err.message).split("\n")[0]}`);
    return { seat: email, store_switch: storeSwitch, diffs };
  } finally {
    await c.query("rollback").catch(() => undefined);
    await c.end().catch(() => undefined);
  }
}

const pg = (await import("pg")).default;
let bad = 0;
for (const [email, uid] of Object.entries(SEATS)) {
  for (const storeSwitch of [false, true]) {
    const r = await run(pg, email, uid, storeSwitch);
    bad += r.diffs.length;
    console.log(JSON.stringify({ ...r, diffs: r.diffs.slice(0, 5), diff_count: r.diffs.length }));
  }
}
console.log(bad ? `RED: ${bad} difference(s)${PLANT ? ` (plant: ${PLANT})` : ""}` : "GREEN: get_scope_trees = get_scope_tree per organization, both seats, switch off and on");
process.exit(bad ? 1 : 0);

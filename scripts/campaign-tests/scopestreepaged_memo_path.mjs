#!/usr/bin/env node
/**
 * LANE SCOPES-ON-THE-STORE — THE PAGED DOORS ON THE PATH THE WEB TAKES: STATEMENT MEMOS LIVE.
 * Section F of the same-rows proof (attack H1) and the call-count guard (attack M2), dev clone only.
 *
 * WHY THIS IS NOT IN scopestreepaged_same_rows_as_the_tree.sql. Every STORE-READ-PERF-6 memo reader in
 * custom.query_visible_ids answers from the statement memo only while pg_current_xact_id_if_assigned()
 * is null. That suite creates temp tables and functions in its transaction, which assigns an xid, so
 * it compares the fall-back path with the fall-back path and can never see the batched answer. Here:
 *
 *   ON   one REPEATABLE READ, READ ONLY transaction per seat, `authenticated`, that writes nothing
 *        (checked at its end: no xid), asking custom.context_tree and every paged door: the first
 *        paint (types without counts), types with counts, every type's scopes in pages of 200, and the
 *        search set. Each door call's custom.tables_seen_among / custom.tables_listed_among calls are
 *        read from pg_stat_xact_user_functions (track_functions = all) around it.
 *   OFF  for the same seat, a transaction in which EVERY memo reader misses: platform.memo_get,
 *        memo_s_get, memo_b_get, memo_k_get answer null and memo_all '{}' (CREATE OR REPLACE inside
 *        the transaction, ROLLED BACK — never committed; a positive control proves the readers are off
 *        before any door is asked). pg_current_xact_id() alone is not "off": the PERF-5
 *        qvi_kernel_among memo carries no xid check (attack H1).
 *
 * F (same rows) — every one must hold for every seat, or RED:
 *   F1 types(orgs, false) = context_tree(orgs).types              (ON)
 *   F2 types(orgs, true): each type = the tree's object + scope_count = the tree's scopes of that type
 *   F3 every type, pages of 200 concatenated = the tree's scopes of that type, in order; total = count
 *   F4 search(orgs, q, 500): the tree's scopes whose name holds q, same ids, same total, same objects
 *   F5 every answer above, and context_tree itself, byte for byte the same ON and OFF
 *   F6 the ON transaction wrote nothing (no xid) — or the memos were never live and F proves nothing
 *   A seat with no scope type to compare is UNMEASURED; the run is RED unless every seat that holds a
 *   scope organization measured at least one type.
 * CC (call count) — the batch is asked once, not once per organization:
 *   in every multi-organization door call (first paint, types with counts, search) whose organizations
 *   hold k >= 2 non-admin scope organizations asked, custom.tables_listed_among ran k times (the
 *   profiler ran) and custom.tables_seen_among ran exactly once. A seat with k < 2 cannot tell the
 *   batch from the walk and is UNMEASURED for CC; the run is RED unless at least one door call measured.
 *
 *   node scripts/campaign-tests/scopestreepaged_memo_path.mjs [--seats admin,test] [--plant <name>]
 * Plants (each must go RED; temp copies in pg_temp, never the live functions):
 *   memo_path_drops_one  the helper drops its last answered row only while no xid is assigned → F red
 *   batch_unnamed        the helper's two memo_k_put lines removed (answer-safe) → CC red, F green
 *   on_txn_writes        the ON transaction assigns an xid first → F6 red (and CC red)
 * Exit 0 GREEN, 1 RED, 2 could not run.
 */
import pg from "pg";
import { createHash } from "node:crypto";
import { dsnFor, pgClient } from "../lib/pooled-db.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const PLANT = opt("--plant") ?? "none";
const SEAT_FILTER = opt("--seats");
const QUERIES = ["a", "re", "clinic", "pt", "TAG", "%", "_"];
const HELPER_SIG = "custom._ctx_tree_part(uuid,uuid[],uuid[],text,uuid[],text,integer,integer)";
const DOORS = {
  types: "custom.context_tree_types(uuid[],boolean)",
  typeScopes: "custom.context_tree_type_scopes(uuid,integer,integer)",
  search: "custom.context_tree_search(uuid[],text,integer)",
};
const MEMO_OFF = [
  ["platform.memo_get(p_key text)", "text", "null"],
  ["platform.memo_s_get(p_key text)", "text", "null"],
  ["platform.memo_b_get(p_key text)", "text", "null"],
  ["platform.memo_k_get(p_key text)", "text", "null"],
  ["platform.memo_all()", "jsonb", "'{}'::jsonb"],
];
const md5 = (s) => createHash("md5").update(s).digest("hex");
const tag = (email) => (email === "admin@admin.com" || email === "test@test.com" ? email : `seat-${md5(email).slice(0, 8)}`);

const c = pgClient(pg, dsnFor("clone", { app: "scopestreepaged-memo-path" }));
await c.connect();
{
  const w = (await c.query(`select current_user u, (select count(*) from cron.job where active)::int j,
     exists (select 1 from pg_extension where extname = 'pg_net') n`)).rows[0];
  if (w.j !== 0 || w.n) { console.error(`REFUSED: ${w.u} is not the quarantined dev clone`); process.exit(2); }
  console.log(`# ${w.u}, plant ${PLANT}`);
}
for (const sig of [HELPER_SIG, ...Object.values(DOORS)]) {
  if (!(await c.query("select to_regprocedure($1) is not null ok", [sig])).rows[0].ok) {
    console.error(`UNMEASURED: ${sig} is not on the clone — rehearse the paged-doors file first`); process.exit(2);
  }
}

// ── plants: temp copies (committed in their own transaction, session-local, gone at disconnect) ──
let NS = "custom";
// The doors are asked as `authenticated`, the way PostgREST asks them. A plant's pg_temp copies cannot
// be granted to a client role (the ddl guard takes undeclared definer grants back), so a planted run
// asks as the connection's own role with the same claims — custom.query_principal() reads the claims,
// and the doors are SECURITY DEFINER either way (M3a plan: same answer, same timings, both seats).
let ROLE = "authenticated";
if (PLANT === "memo_path_drops_one" || PLANT === "batch_unnamed") {
  const def = async (sig) => (await c.query("select pg_get_functiondef(to_regprocedure($1)) d", [sig])).rows[0].d;
  let helper = (await def(HELPER_SIG)).replace("CREATE OR REPLACE FUNCTION custom._ctx_tree_part(", "CREATE FUNCTION pg_temp._ctx_tree_part(");
  const sub = (s, from, to) => { if (!s.includes(from)) throw new Error(`plant phrase not found: ${from}`); return s.split(from).join(to); };
  if (PLANT === "batch_unnamed") {
    helper = sub(helper, "perform platform.memo_k_put('custom.kernel_among_batch:' || p_me::text, v_among::text);", "");
    helper = sub(helper, "perform platform.memo_k_put('custom.qvi_pairs:' || p_me::text, v_pairs);", "null;");
  } else {
    helper = sub(helper, "return jsonb_build_object('types', v_types);",
      "if pg_catalog.pg_current_xact_id_if_assigned() is null and jsonb_array_length(v_types) > 0 then v_types := v_types - (jsonb_array_length(v_types) - 1); end if; return jsonb_build_object('types', v_types);");
    helper = sub(helper, "  return jsonb_build_object('scopes', v_scopes, 'total', v_total);",
      "  if pg_catalog.pg_current_xact_id_if_assigned() is null and jsonb_array_length(v_scopes) > 0 then v_scopes := v_scopes - (jsonb_array_length(v_scopes) - 1); end if;\n  return jsonb_build_object('scopes', v_scopes, 'total', v_total);");
  }
  await c.query("begin");
  await c.query(helper);
  for (const [k, sig] of Object.entries(DOORS)) {
    const d = sub((await def(sig)).replace(/CREATE OR REPLACE FUNCTION custom\./, "CREATE FUNCTION pg_temp."), "custom._ctx_tree_part(", "pg_temp._ctx_tree_part(");
    await c.query(d);
    void k;
  }
  await c.query("commit");
  NS = "pg_temp";
  ROLE = null;
  console.log(`# plant ${PLANT}: the doors are asked through pg_temp copies`);
}

// ── seats: everyone holding a scope organization (live membership or portal), and a seat with none ──
const seats = (await c.query(`
  with st as (select distinct t.organization_id org from custom.record t
               where t.table_id = custom.table_kernel_id() and t.deleted_at is null and t.data ->> 'kept_for' = 'context'),
  mem as (select m.user_id, m.organization_id org from iam.organization_member m
            join iam.organizations o on o.id = m.organization_id and o.archived_at is null
          union
          select pp.user_id, pp.organization_id from custom.portal_principal pp
            join iam.organizations o on o.id = pp.organization_id and o.archived_at is null
           where pp.user_id is not null and pp.is_active)
  select u.id::text id, u.email, array_agg(distinct mem.org::text order by mem.org::text) orgs
    from mem join auth.users u on u.id = mem.user_id
   group by u.id, u.email
  having exists (select 1 from st where st.org = any (array_agg(mem.org)))
   order by u.email`)).rows
  .filter((s) => !SEAT_FILTER || SEAT_FILTER.split(",").some((f) => s.email.startsWith(f)));
seats.push({ id: "00000000-0000-4000-8000-00000000f00d", email: "no-organization seat", orgs: [], none: true });
console.log(`# ${seats.length - 1} seats with a scope organization + 1 with none`);

const bad = [];
const cc = { measured: 0, unmeasured: 0, rows: [] };
let measuredSeats = 0, wantSeats = 0;

async function asSeat(uid, isolation) {
  await c.query(`begin isolation level ${isolation} read only`);
  await c.query("set local statement_timeout = '180s'");
  await c.query("set local track_functions = 'all'");
  await c.query("set local lock_timeout = '20s'");
  await c.query("select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)", [uid]);
  if (ROLE) await c.query(`set local role ${ROLE}`);
}
async function prof() {
  const r = await c.query(`select funcname f, calls::int n from pg_stat_xact_user_functions
                            where schemaname = 'custom' and funcname in ('tables_seen_among', 'tables_listed_among')`);
  const o = { tables_seen_among: 0, tables_listed_among: 0 };
  for (const x of r.rows) o[x.f] = x.n;
  return o;
}
async function q1(sql, params) { return (await c.query(`select (${sql})::text v`, params)).rows[0].v; }

/** Every answer this seat's run compares, as text, in a fixed order; plus the call counts (ON only). */
async function answers(s, profile) {
  const out = new Map(), counts = [];
  const call = async (key, sql, params) => {
    const before = profile ? await prof() : null;
    let v;
    // The clone is shared: another lane's DDL can hold a lock for seconds. A lock timeout is retried
    // (never compared); any other error is the answer, compared as text like any other.
    for (let attempt = 1; ; attempt++) {
      await c.query("savepoint door_call");
      try { v = await q1(sql, params); await c.query("release savepoint door_call"); break; }
      catch (e) {
        await c.query("rollback to savepoint door_call");
        if (e.code === "55P03" && attempt < 6) { await new Promise((r) => setTimeout(r, 2000 * attempt)); continue; }
        v = `ERROR ${e.code} ${e.message}`; break;
      }
    }
    if (profile) { const a = await prof(); counts.push({ key, seen: a.tables_seen_among - before.tables_seen_among, listed: a.tables_listed_among - before.tables_listed_among }); }
    out.set(key, v);
    return v;
  };
  const whole = await call("tree", "custom.context_tree($1::uuid[])", [s.orgs]);
  await call("types:false", `${NS}.context_tree_types($1::uuid[], false)`, [s.orgs]);
  const cnt = await call("types:true", `${NS}.context_tree_types($1::uuid[], true)`, [s.orgs]);
  let ids = [];
  try { ids = (JSON.parse(whole).types ?? []).map((t) => t.id); } catch { /* error text: compared as text */ }
  try { ids = [...new Set([...ids, ...(JSON.parse(cnt).types ?? []).map((t) => t.id)])]; } catch { /* idem */ }
  for (const id of ids) {
    let off = 0;
    for (let guard = 0; guard < 100; guard++) {
      const p = await call(`page:${id}:${off}`, `${NS}.context_tree_type_scopes($1::uuid, $2, 200)`, [id, off]);
      let next = null; try { next = JSON.parse(p).next_offset; } catch { /* error */ }
      if (next == null) break;
      off = next;
    }
  }
  for (const q of QUERIES) await call(`search:${q}`, `${NS}.context_tree_search($1::uuid[], $2, 500)`, [s.orgs, q]);
  return { out, counts };
}

function fail(seat, check, k, detail) { bad.push({ seat, check, k, detail }); }

function compare(s, A) {
  const who = tag(s.email);
  let whole; try { whole = JSON.parse(A.get("tree")); } catch { fail(who, "tree", "", A.get("tree").slice(0, 120)); return 0; }
  const types = whole.types, scopes = whole.scopes;
  const J = (key) => { try { return JSON.parse(A.get(key)); } catch { fail(who, "answer", key, String(A.get(key)).slice(0, 120)); return null; } };
  const lst = J("types:false"), cnt = J("types:true");
  if (!lst || !cnt) return 0;
  if (JSON.stringify(lst.types) !== JSON.stringify(types)) fail(who, "F1 first paint", "", `${lst.types.length} vs ${types.length} types`);
  for (const t of cnt.types) {
    const { scope_count, ...obj } = t;
    const tt = types.find((x) => x.id === t.id);
    if (JSON.stringify(obj) !== JSON.stringify(tt)) fail(who, "F2 type object", t.id, "differs");
    const n = scopes.filter((x) => x.scope_type_id === t.id).length;
    if (scope_count !== n) fail(who, "F2 scope_count", t.id, `${scope_count} vs ${n}`);
  }
  if (cnt.types.length !== types.length) fail(who, "F2 types", "", `${cnt.types.length} vs ${types.length}`);
  for (const t of types) {
    const want = scopes.filter((x) => x.scope_type_id === t.id);
    let got = [], total = null;
    for (const [k] of A) if (k.startsWith(`page:${t.id}:`)) { const p = J(k); if (!p) continue; got = got.concat(p.scopes); total = p.total; }
    if (JSON.stringify(got) !== JSON.stringify(want)) fail(who, "F3 type pages", t.id, `${got.length} vs ${want.length} scopes`);
    if (total !== want.length) fail(who, "F3 total", t.id, `${total} vs ${want.length}`);
  }
  for (const q of QUERIES) {
    const p = J(`search:${q}`);
    if (!p) continue;
    const want = scopes.filter((x) => typeof x.name === "string" && x.name.toLowerCase().includes(q.toLowerCase()));
    const gotIds = p.scopes.map((x) => x.id).sort(), wantIds = want.map((x) => x.id).sort();
    if (want.length <= 500 && JSON.stringify(gotIds) !== JSON.stringify(wantIds)) fail(who, "F4 search", q, `${gotIds.length} vs ${wantIds.length} ids`);
    if (p.total !== want.length) fail(who, "F4 search total", q, `${p.total} vs ${want.length}`);
    const byId = new Map(scopes.map((x) => [x.id, JSON.stringify(x)]));
    if (p.scopes.some((x) => byId.get(x.id) !== JSON.stringify(x))) fail(who, "F4 search object", q, "an answered scope differs from the tree's");
  }
  return types.length;
}

for (const s of seats) {
  const who = tag(s.email);
  // k: the non-admin scope organizations of this seat (no seat here is on the admin lane: no header)
  const k = s.none ? 0 : Number((await c.query(`select count(distinct t.organization_id)::int n from custom.record t
      where t.organization_id = any ($1::uuid[]) and t.table_id = custom.table_kernel_id()
        and t.deleted_at is null and t.data ->> 'kept_for' = 'context'`, [s.orgs])).rows[0].n);
  // ON
  let on;
  await asSeat(s.id, "repeatable read");
  try {
    if (PLANT === "on_txn_writes") await c.query("select pg_current_xact_id()");
    on = await answers(s, true);
    const x = (await c.query("select pg_current_xact_id_if_assigned()::text x")).rows[0].x;
    if (x !== null) fail(who, "F6 ON transaction wrote", "", `xid ${x}: the memos were never live`);
  } finally { await c.query("rollback").catch(() => {}); }
  // OFF
  let off;
  await c.query("begin isolation level repeatable read");
  try {
    await c.query("set local lock_timeout = '5s'");
    await c.query("set local statement_timeout = '180s'");
    for (const [sig, ret, val] of MEMO_OFF) {
      await c.query(`create or replace function ${sig} returns ${ret} language sql stable set search_path to '' as $$ select ${val} $$`);
    }
    await c.query("select platform.memo_k_put('memo-path-control', 'on'), platform.memo_put('memo-path-control', 'on')");
    const ctl = (await c.query("select platform.memo_k_get('memo-path-control') k, platform.memo_get('memo-path-control') g, platform.memo_all() a")).rows[0];
    if (ctl.k !== null || ctl.g !== null || JSON.stringify(ctl.a) !== "{}") { console.error("REFUSED: the memo readers did not turn off"); process.exit(2); }
    await c.query("select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)", [s.id]);
    if (ROLE) await c.query(`set local role ${ROLE}`);
    off = await answers(s, false);
  } finally { await c.query("rollback").catch(() => {}); }

  // F5: ON = OFF, key for key
  for (const [key, v] of on.out) if (off.out.get(key) !== v) fail(who, "F5 memos on vs off", key, `${md5(v).slice(0, 8)} vs ${md5(off.out.get(key) ?? "").slice(0, 8)}`);
  for (const key of off.out.keys()) if (!on.out.has(key)) fail(who, "F5 memos on vs off", key, "asked OFF only");
  const n = compare(s, on.out);
  if (!s.none) { wantSeats++; if (n > 0) measuredSeats++; else fail(who, "UNMEASURED", "", "no scope type to compare"); }
  else if (n !== 0) fail(who, "no-organization seat", "", `${n} types`);

  // CC
  for (const r of on.counts) {
    const multi = r.key === "types:false" || r.key === "types:true" || r.key.startsWith("search:");
    if (!multi) continue;
    // the search door asks only organizations whose Tables hold a stored match: its own k
    if (r.listed < 2 || k < 2) { cc.unmeasured++; continue; }
    cc.measured++;
    cc.rows.push({ who, key: r.key, k, listed: r.listed, seen: r.seen });
    if (r.seen !== 1) fail(who, "CC tables_seen_among", r.key, `${r.seen} calls for ${r.listed} organizations (want 1)`);
  }
  const fp = on.counts.find((r) => r.key === "types:false");
  console.log(`${who.padEnd(18)} k=${String(k).padStart(2)} types=${String(n).padStart(3)} answers=${on.out.size} first paint: tables_listed_among ${fp.listed}, tables_seen_among ${fp.seen}`);
}
await c.end();

if (cc.measured === 0) fail("all", "CC UNMEASURED", "", "no door call asked 2+ scope organizations — the call count cannot tell batch from walk");
for (const b of bad.slice(0, 60)) console.log(`RED   ${b.seat}  ${b.check}  ${b.k}  ${b.detail}`);
const fBad = bad.filter((b) => !b.check.startsWith("CC")).length, ccBad = bad.filter((b) => b.check.startsWith("CC")).length;
console.log(`F : ${fBad === 0 && measuredSeats === wantSeats ? "GREEN" : "RED"} — ${measuredSeats}/${wantSeats} seats measured, ${fBad} differences`);
console.log(`CC: ${ccBad === 0 ? "GREEN" : "RED"} — ${cc.measured} multi-organization door calls measured (${cc.unmeasured} unmeasured: fewer than 2 scope organizations asked), ${ccBad} over 1 call`);
const green = bad.length === 0 && measuredSeats === wantSeats;
console.log(`${green ? "GREEN" : "RED"} (plant ${PLANT})`);
process.exit(green ? 0 : 1);

#!/usr/bin/env node
/**
 * LANE SCOPES-ON-THE-STORE — THE PAGED TREE IS custom.context_tree's OWN BODY (attack H2, 2026-10-02).
 *
 * The defect class: custom._ctx_tree_part (the paged scope-tree doors' one body) is a hand copy of
 * custom.context_tree's body. The copy was taken at STORE-READ-PERF-5 and fell behind when
 * STORE-READ-PERF-6 changed the original (the statement memos kernel_among_batch and qvi_pairs), so the
 * member's first paint walked the ladder once per organization and nothing went red. The one body was
 * not shared because custom.context_tree is also the oracle every same-rows proof compares the paged
 * doors against; folding it into the helper would make the proof compare the helper with itself.
 *
 * So this guard fails whenever the shared sections of the two bodies stop being the same text:
 *   R1 table-step   the PERF-6 Table step: the among batch named, the Table list asked, the batch dropped
 *   R2 records-step the Records step's CTEs t0, t, flds, recs, colf, fgroup, shown, cols, vis
 *   R3 pairs-memo   the (organization, Table) pairs named before the Records step and dropped after it
 *   R4 objects      the type object and the scope object, each answered key for key
 *   R5 order        the order of types and of scopes
 *   R6 wall         the doors decide every organization exactly as custom.context_tree does
 * Normalised before comparing: comments, whitespace, the variable names (v_me / p_me, v_orgs / p_orgs,
 * v_admin / p_admin), row aliases inside the objects, and the helper's ONE addition (`and (p_type_ids is
 * null or t.id = any (p_type_ids))`, counted: exactly where it belongs). A section that cannot be found
 * in either body is a FAIL (unmeasured), never a pass.
 *
 *   node scripts/campaign-tests/scopestreepaged_one_body_check.mjs [--target clone|production]
 *        [--helper-file migrations/campaign/scopestreepaged_the_tree_paints_its_types_first.sql]
 *   node scripts/campaign-tests/scopestreepaged_one_body_check.mjs --self-test [--target clone]
 *
 * --target reads the live bodies (read-only, session pooler, rolled back). --helper-file takes the
 * helper and the doors from a migration file instead (custom.context_tree always from --target), so the
 * file can be judged before it is applied. --self-test plants each rule's drift IN MEMORY (never on
 * disk), one at a time, and requires that rule — and only that rule — to go red; exit 0 only then.
 * Exit 0 = GREEN, 1 = RED, 2 = could not measure.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { dsnFor, pgClient, FRONTEND } from "../lib/pooled-db.mjs";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const TARGET = opt("--target") ?? "clone";
const HELPER_FILE = opt("--helper-file");
const SELF_TEST = args.includes("--self-test");

const RESTRICT = "and (p_type_ids is null or t.id = any (p_type_ids))";
const CTES = ["t0", "t", "flds", "recs", "colf", "fgroup", "shown", "cols", "vis"];

// ── text helpers ───────────────────────────────────────────────────────────────────────────────
/** Comments out, whitespace collapsed; string literals kept byte for byte. */
export function strip(src) {
  let out = "", i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "'") {
      let j = i + 1;
      while (j < src.length) { if (src[j] === "'") { if (src[j + 1] === "'") { j += 2; continue; } break; } j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    if (ch === "-" && src[i + 1] === "-") { while (i < src.length && src[i] !== "\n") i++; out += " "; continue; }
    out += /\s/.test(ch) ? " " : ch; i++;
  }
  return out.replace(/ +/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();
}
function names(s) {
  return s.replace(/\b[vp]_me\b/g, "ME").replace(/\b[vp]_orgs\b/g, "ORGS").replace(/\b[vp]_admin\b/g, "ADMIN");
}
/** From `open` (an index of "(") to its matching ")" inclusive, skipping string literals. */
function balanced(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'") { i++; while (i < s.length && !(s[i] === "'" && s[i + 1] !== "'")) { if (s[i] === "'") i++; i++; } continue; }
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth === 0) return s.slice(open, i + 1); }
  }
  return null;
}
function count(s, needle) { let n = 0, i = 0; while ((i = s.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
function between(s, from, to, startAt = 0) {
  const a = s.indexOf(from, startAt); if (a < 0) return null;
  const b = s.indexOf(to, a + from.length); if (b < 0) return null;
  return { text: s.slice(a, b + to.length), at: a, end: b + to.length };
}
function cte(stmt, name) {
  const m = new RegExp(`(?:with |, )${name} as materialized \\(`).exec(stmt);
  if (!m) return null;
  return balanced(stmt, m.index + m[0].length - 1);
}
/** The `with t0 as materialized (` statement that holds `flds as materialized (`. */
function recordsStatement(s) {
  const f = s.indexOf("flds as materialized (");
  if (f < 0) return null;
  const w = s.lastIndexOf("with t0 as materialized (", f);
  return w < 0 ? null : { text: s.slice(w), at: w };
}

// ── the rules ──────────────────────────────────────────────────────────────────────────────────
/** bodies: { tree, helper, types, typeScopes, search } as raw function bodies (prosrc). */
export function judge(bodies) {
  const fails = [];
  const fail = (rule, msg) => fails.push({ rule, msg });
  const CT = names(strip(bodies.tree));
  const H0 = names(strip(bodies.helper));

  // R1 — the Table step
  {
    const from = "select coalesce(jsonb_object_agg(o.org, o.ids), '{}'::jsonb) into v_among";
    const to = "perform platform.memo_k_drop('custom.kernel_among_batch:' || ME::text);";
    const a = between(CT, from, to), b = between(H0, from, to);
    if (!a) fail("R1 table-step", "custom.context_tree has no PERF-6 Table step (the among batch named … dropped) to compare with — UNMEASURED");
    else if (!b) fail("R1 table-step", "custom._ctx_tree_part does not name custom.kernel_among_batch around its Table step the way custom.context_tree does");
    else {
      const n = count(b.text, RESTRICT);
      if (n !== 2) fail("R1 table-step", `the helper's Table step carries its type restriction ${n} times, expected 2 (the batch and the Table list)`);
      if (b.text.split(" " + RESTRICT).join("") !== a.text) {
        fail("R1 table-step", "the helper's Table step differs from custom.context_tree's beyond the type restriction");
      }
      if (count(CT, from) !== 1 || count(H0, from) !== 1) fail("R1 table-step", "the Table step is not found exactly once in each body");
    }
  }

  // R2 — the Records step
  const ra = recordsStatement(CT), rb = recordsStatement(H0);
  if (!ra || !rb) fail("R2 records-step", `${!ra ? "custom.context_tree" : "custom._ctx_tree_part"} has no Records step (with t0 … flds …) — UNMEASURED`);
  else {
    for (const name of CTES) {
      const x = cte(ra.text, name), y0 = cte(rb.text, name);
      if (!x || !y0) { fail("R2 records-step", `CTE ${name} missing from ${!x ? "custom.context_tree" : "custom._ctx_tree_part"}'s Records step`); continue; }
      const n = count(y0, RESTRICT);
      const want = name === "t0" ? 1 : 0;
      if (n !== want) fail("R2 records-step", `CTE ${name}: the type restriction appears ${n} times in the helper, expected ${want}`);
      const y = y0.split(" " + RESTRICT).join("");
      if (x !== y) fail("R2 records-step", `CTE ${name} differs: custom.context_tree «${x.slice(0, 160)}…» vs helper «${y.slice(0, 160)}…»`);
    }
  }

  // R3 — the pairs memo around the Records step
  {
    const put = between(CT, "if v_pairs is not null then perform platform.memo_k_put('custom.qvi_pairs:'", "end if;");
    const drop = "perform platform.memo_k_drop('custom.qvi_pairs:' || ME::text);";
    if (!put || count(CT, drop) !== 1 || !ra) fail("R3 pairs-memo", "custom.context_tree names no qvi_pairs around its Records step — UNMEASURED");
    else if (!rb) fail("R3 pairs-memo", "no Records step in the helper");
    else {
      const before = H0.slice(0, rb.at).trimEnd();
      if (!before.endsWith(put.text)) fail("R3 pairs-memo", "the helper does not name custom.qvi_pairs (as custom.context_tree does) immediately before its Records step");
      const ret = H0.indexOf("return jsonb_build_object('scopes', v_scopes, 'total', v_total);", rb.at);
      const d = H0.indexOf(drop, rb.at);
      if (ret < 0 || d < 0 || d > ret) fail("R3 pairs-memo", "the helper does not drop custom.qvi_pairs after its Records step, before it answers");
      const tb = H0.indexOf("if p_mode in ('types', 'type_list') then");
      const tr = H0.indexOf("return jsonb_build_object('types', v_types);", tb);
      if (tb < 0 || tr < 0 || H0.lastIndexOf(drop, tr) < tb) fail("R3 pairs-memo", "the helper's types block does not drop custom.qvi_pairs before it answers");
    }
  }

  // R4 + R5 — the objects and their order
  {
    const typeHead = "jsonb_build_object('id', t.id, 'organization_id', t.org,";
    const ta = CT.indexOf(typeHead), tb = H0.indexOf(typeHead);
    const tx = ta >= 0 ? balanced(CT, ta + "jsonb_build_object".length) : null;
    const ty = tb >= 0 ? balanced(H0, tb + "jsonb_build_object".length) : null;
    if (!tx || !ty) fail("R4 objects", `the type object is missing from ${!tx ? "custom.context_tree" : "the helper"} — UNMEASURED`);
    else if (tx !== ty) fail("R4 objects", "the type object differs");
    const orderOf = (s, at) => { const m = /order by (.*?)\)(?:, '\[\]'::jsonb| from t\))/.exec(s.slice(at)); return m ? m[1] : null; };
    if (tx && ty) {
      const oa = orderOf(CT, ta + tx.length), ob = orderOf(H0, tb + ty.length);
      if (!oa || !ob) fail("R5 order", "the types' order is missing — UNMEASURED");
      else if (oa !== ob) fail("R5 order", `the types' order differs: «${oa}» vs «${ob}»`);
    }
    const scopeRe = /jsonb_build_object\('id', (\w)\.id, 'scope_type_id', \1\.table_id/;
    const sa = scopeRe.exec(CT), sb = scopeRe.exec(H0);
    const sx = sa ? balanced(CT, sa.index + "jsonb_build_object".length) : null;
    const sy = sb ? balanced(H0, sb.index + "jsonb_build_object".length) : null;
    if (!sx || !sy) fail("R4 objects", `the scope object is missing from ${!sx ? "custom.context_tree" : "the helper"} — UNMEASURED`);
    else {
      const ctAlias = (s) => s.replace(/\b[rc]\./g, "ROW.");
      const hAlias = (s) => s.replace(/\bo\./g, "ROW.");
      if (ctAlias(sx) !== hAlias(sy)) fail("R4 objects", "the scope object differs");
      const oa = /order by (.*?)\) from vis/.exec(CT.slice(sa.index + sx.length));
      const ob = /row_number\(\) over \(order by .*?case when p_mode = 'search' then m\.table_id end, (.*?)\) as rn/.exec(H0);
      if (!oa || !ob) fail("R5 order", "the scopes' order is missing — UNMEASURED");
      else if (ctAlias(oa[1]) !== ob[1].replace(/\bm\./g, "ROW.")) fail("R5 order", `the scopes' order differs: «${oa[1]}» vs «${ob[1]}»`);
    }
  }

  // R6 — the wall
  {
    const door = (s) => s.replace(/'custom\.context_tree\w*'/g, "'DOOR'");
    const loopOf = (b) => { const s = names(strip(b)); const x = between(s, "foreach v_org in array ORGS loop", "end loop;"); return x ? door(x.text) : null; };
    const want = loopOf(bodies.tree);
    if (!want) fail("R6 wall", "custom.context_tree has no organization loop — UNMEASURED");
    for (const [name, body] of [["custom.context_tree_types", bodies.types], ["custom.context_tree_search", bodies.search]]) {
      const got = body ? loopOf(body) : null;
      if (!got) fail("R6 wall", `${name} has no organization loop`);
      else if (want && got !== want) fail("R6 wall", `${name} decides its organizations differently from custom.context_tree`);
      if (body && !strip(body).includes(`custom.assert_client_may_reach(v_org, '${name}')`)) fail("R6 wall", `${name} does not refuse in its own name`);
    }
    const cond = want ? /if (not \(iam\.has_org_access\(v_org\) .*?) then/.exec(want) : null;
    const ts = bodies.typeScopes ? names(strip(bodies.typeScopes)) : "";
    if (!cond) fail("R6 wall", "custom.context_tree's admin-lane condition not found — UNMEASURED");
    else if (!ts.includes(`if ${cond[1]} then ADMIN := array[v_org]; else perform custom.assert_client_may_reach(v_org, 'custom.context_tree_type_scopes'); end if;`)) {
      fail("R6 wall", "custom.context_tree_type_scopes decides its organization differently from custom.context_tree");
    }
  }
  return fails;
}

// ── sources ────────────────────────────────────────────────────────────────────────────────────
const SIGS = {
  tree: "custom.context_tree(uuid[])",
  helper: "custom._ctx_tree_part(uuid,uuid[],uuid[],text,uuid[],text,integer,integer)",
  types: "custom.context_tree_types(uuid[],boolean)",
  typeScopes: "custom.context_tree_type_scopes(uuid,integer,integer)",
  search: "custom.context_tree_search(uuid[],text,integer)",
};
function fromFile(path) {
  const text = readFileSync(resolve(FRONTEND, path), "utf8");
  const one = (fn) => {
    const a = text.indexOf(`CREATE FUNCTION ${fn}(`);
    if (a < 0) return null;
    const b = text.indexOf("AS $function$", a), c = text.indexOf("$function$;", b + 13);
    return text.slice(b + "AS $function$".length, c);
  };
  return { helper: one("custom._ctx_tree_part"), types: one("custom.context_tree_types"),
           typeScopes: one("custom.context_tree_type_scopes"), search: one("custom.context_tree_search") };
}
async function fromDb(target) {
  const c = pgClient(pg, dsnFor(target, { app: "scopestreepaged-one-body" }));
  await c.connect();
  try {
    await c.query("begin read only");
    await c.query("set local statement_timeout = '30s'");
    const out = {};
    for (const [k, sig] of Object.entries(SIGS)) {
      const r = await c.query("select p.prosrc from pg_proc p where p.oid = to_regprocedure($1)", [sig]);
      out[k] = r.rows[0]?.prosrc ?? null;
    }
    return out;
  } finally { await c.query("rollback").catch(() => {}); await c.end(); }
}

function report(fails, label) {
  if (fails.length === 0) { console.log(`GREEN  ${label}: the paged tree's shared sections are custom.context_tree's (R1–R6)`); return; }
  for (const f of fails) console.log(`RED    ${f.rule}: ${f.msg}`);
  console.log(`RED    ${label}: ${fails.length} finding(s). Remedy: carry custom.context_tree's change into custom._ctx_tree_part (or the reverse) in one migration, then re-run.`);
}

async function main() {
  const live = await fromDb(TARGET);
  if (!live.tree) { console.error(`UNMEASURED: custom.context_tree is not on ${TARGET}`); process.exit(2); }
  const bodies = HELPER_FILE ? { tree: live.tree, ...fromFile(HELPER_FILE) } : live;
  if (!bodies.helper) { console.error(`UNMEASURED: custom._ctx_tree_part is not ${HELPER_FILE ? "in " + HELPER_FILE : "on " + TARGET}`); process.exit(2); }
  const label = `${TARGET}${HELPER_FILE ? " + " + HELPER_FILE : ""}`;

  if (!SELF_TEST) { const f = judge(bodies); report(f, label); process.exit(f.length ? 1 : 0); }

  // SELF-TEST: the unplanted pair must be GREEN, and each plant must turn exactly its own rule red.
  const base = judge(bodies);
  if (base.length) { report(base, label + " (unplanted)"); console.log("SELF-TEST cannot run: the unplanted bodies are not green"); process.exit(1); }
  const plant = (s, from, to) => { if (!s.includes(from)) throw new Error(`plant phrase not found: ${from}`); return s.replace(from, to); };
  const plants = [
    ["R1 table-step", "tree", "jsonb_agg(t.id order by t.id) as ids", "jsonb_agg(t.id order by t.id desc) as ids"],
    ["R1 table-step", "helper", "perform platform.memo_k_put('custom.kernel_among_batch:' || p_me::text, v_among::text);", ""],
    ["R2 records-step", "tree", "'viewer'::public.permission_level, 'read') as viewer_reads", "'editor'::public.permission_level, 'read') as viewer_reads"],
    ["R2 records-step", "helper", "and substr(f0.id::text, 15, 1) = '5'", "and substr(f0.id::text, 15, 1) in ('4', '5')"],
    ["R3 pairs-memo", "helper", "  if v_pairs is not null then\n    perform platform.memo_k_put('custom.qvi_pairs:' || p_me::text, v_pairs);\n  end if;\n  with t0", "  with t0"],
    ["R4 objects", "tree", "'parent_scope_id', r.data -> 'parent_id'", "'parent_scope_id', r.data -> 'parent'"],
    ["R4 objects", "helper", "'icon', t.data -> 'icon',", "'icon', t.data -> 'emoji',"],
    ["R5 order", "tree", "r.data ->> 'name', r.id)", "r.id, r.data ->> 'name')"],
    ["R6 wall", "search", "and public.is_platform_admin() then", "then"],
    ["R6 wall", "typeScopes", "custom.assert_client_may_reach(v_org, 'custom.context_tree_type_scopes')", "custom.assert_client_may_reach(v_org, 'custom.context_tree')"],
  ];
  let ok = true;
  for (const [rule, key, from, to] of plants) {
    const planted = { ...bodies, [key]: plant(bodies[key], from, to) };
    const f = judge(planted);
    const rules = [...new Set(f.map((x) => x.rule))];
    const right = rules.length === 1 && rules[0] === rule;
    ok &&= right;
    console.log(`${right ? "ok  " : "FAIL"}  plant ${rule} in ${key}: red on ${rules.join(", ") || "nothing"}`);
  }
  console.log(ok ? "SELF-TEST GREEN: unplanted green, every plant red on its own rule only" : "SELF-TEST RED");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });

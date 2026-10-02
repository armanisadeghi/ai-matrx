#!/usr/bin/env node
// LANE 9 SCOPES-ON-THE-STORE, sublane D1/D2 — THE VALUES READ ANSWERS THE SAME, FASTER.
//
//   node scripts/campaign-tests/scopesd1d2_same_answer.mjs [--target clone|production] [--reps 3]
//
// For admin@admin.com and test@test.com (the two test seats, never a real person): every live scope
// the seat sees (context.scopes under its own row security, live organizations it belongs to), read
// through custom.context_values in calls of 200, and every value it answered bound once through
// custom.context_resolve. Each answer is hashed (rows sorted, keys sorted) with the one key this
// change ADDS removed — `whole_value` — and, on a cell that carries it, the value too (the change
// hands the whole text or the named file there, by design). Run twice per seat:
//   memos ON  — `begin read only` (the statement memos of STORE-READ-PERF-3..6 are read only while the
//               transaction has written nothing)
//   memos OFF — a transaction that holds an xid (`pg_current_xact_id()`), so every door runs its
//               plain code; nothing is written and it is rolled back.
// Prints one JSON line per seat: hashes ON/OFF, row counts, and the median server time of one
// 200-scope call (EXPLAIN ANALYZE) against the old values read's 100-scope call
// (context.context_item_values, as scopesService reads it with the switch off).
// EXIT 1 when ON and OFF differ, or when --expect <file> names hashes this run does not reproduce.
// Read only: both transactions roll back. Production only on the session pooler (pooled-db.mjs).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dsnFor, pgClient } from "../lib/pooled-db.mjs";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const TARGET = opt("--target", "clone");
const REPS = Number(opt("--reps", "3"));
const EXPECT = opt("--expect", null);
const SEATS = {
  "admin@admin.com": "87a6e699-3622-4869-8843-d0867456c0dd",
  "test@test.com": "4060701e-706a-4c76-b3ca-0bbc69fa5a14",
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.floor(s.length / 2)] * 10) / 10 : null;
};
const chunks = (a, n) => {
  const o = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
};
const sortKeys = (x) =>
  Array.isArray(x)
    ? x.map(sortKeys)
    : x && typeof x === "object"
      ? Object.keys(x).sort().reduce((o, k) => ((o[k] = sortKeys(x[k])), o), {})
      : x;
const hashRows = (rows) =>
  createHash("sha256")
    .update(JSON.stringify(rows.map((r) => JSON.stringify(sortKeys(r))).sort()))
    .digest("hex")
    .slice(0, 16);
// The one key this change adds is `whole_value`. Where it is present the context_values row keeps
// its value (the cell's first words) unless the door answered a waiting text whole (`in_value`);
// context_resolve hands the first words plus a sentence naming the file, so its value is compared
// by those first words (what the old body handed).
const withoutAdded = (row) => {
  if (!row || typeof row !== "object" || !("whole_value" in row)) return row;
  const { whole_value: w, ...rest } = row;
  if (typeof rest.value === "string" && w && w.in_value && typeof w.shown_chars === "number") rest.value = [...rest.value].slice(0, w.shown_chars).join("");
  else if (typeof rest.value === "string" && rest.value.includes("…\n\n[")) rest.value = rest.value.slice(0, rest.value.lastIndexOf("…\n\n["));
  return rest;
};

async function seatRun(uid, memos) {
  const pg = (await import("pg")).default;
  const c = pgClient(pg, dsnFor(TARGET, { app: "scopesd1d2-same-answer" }));
  await c.connect();
  try {
    await c.query(memos ? "begin read only" : "begin");
    await c.query("set local statement_timeout = '180s'");
    await c.query("set local idle_in_transaction_session_timeout = '120s'");
    if (!memos) await c.query("select pg_current_xact_id()"); // holds an xid: every memo read is off
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await c.query("set local role authenticated");
    const ids = (
      await c.query(
        `select s.id::text id from context.scopes s
          where s.deleted_at is null
            and s.organization_id in (select m.organization_id from public.mbr_for_user('organization') m
                                       join iam.organizations o on o.id = m.organization_id and o.archived_at is null)
          order by s.id`,
      )
    ).rows.map((r) => r.id);
    const rows = [];
    const storeMs = [];
    for (const b of chunks(ids, 200)) {
      rows.push(...((await c.query("select custom.context_values($1::uuid[]) a", [b])).rows[0].a ?? []));
      for (let i = 0; i < REPS; i++) {
        const r = await c.query("explain (analyze, format json) select custom.context_values($1::uuid[])", [b]);
        storeMs.push(r.rows[0]["QUERY PLAN"][0]["Execution Time"]);
      }
    }
    const oldMs = [];
    let oldCells = 0;
    for (const b of chunks(ids, 100)) {
      oldCells += (await c.query("select 1 from context.context_item_values where scope_id = any($1::uuid[]) and is_current", [b])).rowCount;
      for (let i = 0; i < REPS; i++) {
        const r = await c.query(
          "explain (analyze, format json) select * from context.context_item_values where scope_id = any($1::uuid[]) and is_current",
          [b],
        );
        oldMs.push(r.rows[0]["QUERY PLAN"][0]["Execution Time"]);
      }
    }
    const bindings = rows.map((r) => ({ key: `${r.scope_id}:${r.key}`, scope_id: r.scope_id, field_key: r.key }));
    const resolved = [];
    for (const b of chunks(bindings, 500)) {
      const a = (await c.query("select custom.context_resolve($1::jsonb) a", [JSON.stringify(b)])).rows[0].a;
      resolved.push(...(a.bindings ?? []).map(withoutAdded));
      for (const [rec, cells] of Object.entries(a.records ?? {}))
        for (const [k, cell] of Object.entries(cells ?? {})) resolved.push({ rec, k, ...withoutAdded(cell) });
    }
    const spilled = rows.filter((r) => r.whole_value).map((r) => ({ scope_id: r.scope_id, key: r.key, chars: r.whole_value.chars, pending: !!r.whole_value.pending }));
    return {
      scopes: ids.length,
      values: rows.length,
      values_hash: hashRows(rows.map(withoutAdded)),
      resolve_hash: hashRows(resolved),
      spilled,
      store_ms_per_200: median(storeMs),
      store_ms_per_scope: ids.length ? Math.round((median(storeMs) / Math.min(200, ids.length)) * 100) / 100 : null,
      old_cells: oldCells,
      old_ms_per_100: median(oldMs),
      old_ms_per_scope: ids.length ? Math.round((median(oldMs) / Math.min(100, ids.length)) * 100) / 100 : null,
    };
  } finally {
    await c.query("rollback").catch(() => undefined);
    await c.end().catch(() => undefined);
  }
}

if (TARGET === "clone" && !dsnFor("clone").includes("postgres.")) throw new Error("no clone DSN");
const out = {};
let bad = 0;
for (const [email, uid] of Object.entries(SEATS)) {
  const on = await seatRun(uid, true);
  const off = await seatRun(uid, false);
  const same = on.values_hash === off.values_hash && on.resolve_hash === off.resolve_hash;
  if (!same) bad++;
  out[email] = { same_on_off: same, on, off: { values_hash: off.values_hash, resolve_hash: off.resolve_hash, values: off.values, store_ms_per_200: off.store_ms_per_200 } };
  console.log(JSON.stringify({ seat: email, ...out[email] }));
}
if (EXPECT) {
  const want = JSON.parse(readFileSync(EXPECT, "utf8"));
  for (const [email, w] of Object.entries(want)) {
    const got = out[email]?.on;
    if (!got || got.values_hash !== w.values_hash || got.resolve_hash !== w.resolve_hash) {
      bad++;
      console.log(`DIFFERS from ${EXPECT} for ${email}: want ${w.values_hash}/${w.resolve_hash}, got ${got?.values_hash}/${got?.resolve_hash}`);
    }
  }
}
console.log(bad ? `RED: ${bad} difference(s)` : "GREEN: memos on = memos off for both seats");
process.exit(bad ? 1 : 0);

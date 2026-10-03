#!/usr/bin/env node
// scripts/store-guards/a-date-setting-takes-a-worked-out-date.mjs — lane 10 FDT (VIEWS-AND-FIELDS)
//
// GUARD: a view's date setting (date_field / start_field / end_field) takes a Field whose VALUE is a
// date — a stored date, a formula whose answer is a date (a reference to another formula typed by
// that formula's own expression), a lookup of ONE date — and refuses everything else with its
// sentence. Champion: Airtable, whose calendar and timeline are placed by a formula or lookup that
// returns a date.
//
// Runs on the NIGHTLY CLONE only (CLONE_DATABASE_URL, checked against CLONE-REF's pooler user), on
// real physical-therapy data — Cedar Ridge Physical Therapy's "Visit Ledger — Q3 2026" ("Follow-up
// due = DATEADD({Visit date}, 14, 'days')", "Expected copay total", "Copay tier" a text IF) and its
// Patient Visits, whose "Patient phone" lookup reads through "Patient record". Each case reshapes
// its Fields inside a SAVEPOINT that is rolled back, and the whole run is ONE transaction that is
// ROLLED BACK: nothing survives.
//
//   node scripts/store-guards/a-date-setting-takes-a-worked-out-date.mjs
//   node scripts/store-guards/a-date-setting-takes-a-worked-out-date.mjs --plant <file.sql>
//
// `--plant` executes a SQL file inside the rolled-back transaction first (e.g. an older body of
// custom._view_field_key) — the guard must then go red.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// admin@admin.com's own Workspace on the clone. The two tables below are DECLARED inside the
// rolled-back transaction, through the store's own doors, so the guard depends on no clone data.
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const ADMIN_CLAIMS = '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","email":"admin@admin.com"}';
/** Filled by `provision()`: the Fields' ids, and the two tables. */
const F = {};
let LEDGER = null;
let VISITS = null;

const ref = (id) => ({ field: id });
const c = (v) => ({ const: v });
function cases() {
const dateadd = { op: "fx.dateadd", args: [ref(F.visitDate), c(14), c("days")] };
const cond = { op: "fx.eq", args: [ref(F.status), c("No-show")] };
const formula = (expr) => ({ type: "formula", config: { expr } });
const calendarRefusal = (label) => `A calendar places a record by a date, and ${label} does not hold one.`;

/** Each case: the Fields it reshapes (id → the doc keys it overwrites), what it judges, and the answer. */
return [
  { name: "the date formula Follow-up due, as date_field", table: LEDGER, path: "date_field", key: "follow_up_due", want: "follow_up_due" },
  { name: "the date formula Follow-up due, as start_field", table: LEDGER, path: "start_field", key: "follow_up_due", want: "follow_up_due" },
  { name: "the date formula Follow-up due, as end_field", table: LEDGER, path: "end_field", key: "follow_up_due", want: "follow_up_due" },
  { name: "a stored date", table: LEDGER, path: "date_field", key: "visit_date", want: "visit_date" },
  { name: "the number formula Expected copay total (date_field)", table: LEDGER, path: "date_field", key: "expected_copay_total", refused: calendarRefusal("Expected copay total") },
  { name: "the number formula (start_field)", table: LEDGER, path: "start_field", key: "expected_copay_total", refused: "A timeline places a record by a date, and Expected copay total does not hold one." },
  { name: "the number formula (end_field)", table: LEDGER, path: "end_field", key: "expected_copay_total", refused: "A record's end is a date, and Expected copay total does not hold one." },
  { name: "the text formula Copay tier", table: LEDGER, path: "date_field", key: "copay_tier", refused: calendarRefusal("Copay tier") },
  // V15 item 2 — a reference to another formula is typed by that formula.
  { name: "= {Follow-up due}", table: LEDGER, path: "date_field", key: "front_desk_line", set: { [F.scratch]: formula(ref(F.followUp)) }, want: "front_desk_line" },
  { name: "MAX({Follow-up due}, {Visit date})", table: LEDGER, path: "date_field", key: "front_desk_line", set: { [F.scratch]: formula({ op: "fx.max", args: [ref(F.followUp), ref(F.visitDate)] }) }, want: "front_desk_line" },
  { name: "IF(c, DATEADD(..), {Copay tier})", table: LEDGER, path: "date_field", key: "front_desk_line", set: { [F.scratch]: formula({ op: "fx.if", args: [cond, dateadd, ref(F.copayTier)] }) }, refused: calendarRefusal("Front desk line") },
  { name: "IF(c, {Copay tier}, DATEADD(..))", table: LEDGER, path: "date_field", key: "front_desk_line", set: { [F.scratch]: formula({ op: "fx.if", args: [cond, ref(F.copayTier), dateadd] }) }, refused: calendarRefusal("Front desk line") },
  { name: "SWITCH({Status}, \"No-show\", DATEADD(..), {Copay tier})", table: LEDGER, path: "date_field", key: "front_desk_line", set: { [F.scratch]: formula({ op: "fx.switch", args: [ref(F.status), c("No-show"), dateadd, ref(F.copayTier)] }) }, refused: calendarRefusal("Front desk line") },
  { name: "a circle (Front desk line = {Follow-up due}, Follow-up due = {Front desk line})", table: LEDGER, path: "date_field", key: "front_desk_line", set: { [F.scratch]: formula(ref(F.followUp)), [F.followUp]: formula(ref(F.scratch)) }, refused: calendarRefusal("Front desk line") },
  // V15 item 4 — lookups and rollups.
  { name: "a lookup of ONE date (Patient record → Intake date)", table: LEDGER, path: "date_field", key: "patient_phone", set: { [F.phoneLookup]: { config: { via: "patient_record", pick: "intake_date" } } }, want: "patient_phone" },
  { name: "a lookup of a far date FORMULA", table: LEDGER, path: "date_field", key: "patient_phone", set: { [F.phoneLookup]: { config: { via: "patient_record", pick: "email" } }, [F.farEmail]: formula({ op: "fx.dateadd", args: [ref(F.farIntake), c(30), c("days")] }) }, want: "patient_phone" },
  { name: "a lookup of a text column", table: LEDGER, path: "date_field", key: "patient_phone", refused: calendarRefusal("Patient phone") },
  { name: "a MANY-valued lookup of a date", table: LEDGER, path: "date_field", key: "patient_phone", set: { [F.phoneLookup]: { multi: true, config: { via: "patient_record", pick: "intake_date" } } }, refused: calendarRefusal("Patient phone") },
  { name: "a rollup (max) of a date", table: LEDGER, path: "date_field", key: "patient_phone", set: { [F.phoneLookup]: { config: { via: "patient_record", of: "intake_date", agg: "max" } } }, refused: calendarRefusal("Patient phone") },
  { name: "a chain (a lookup of a lookup of a date)", table: LEDGER, path: "date_field", key: "patient_phone", set: { [F.phoneLookup]: { config: { via: "patient_record", pick: "phone" } }, [F.farPhone]: { type: "formula", config: { via: "some_link", pick: "intake_date" } } }, refused: calendarRefusal("Patient phone") },
];
}

function cloneUrl() {
  const cref = readFileSync(resolve(ROOT, "../common-docs/operations/clone/CLONE-REF"), "utf8");
  const user = /^pooler_user\s*=\s*(\S+)/m.exec(cref)?.[1];
  const env = readFileSync(resolve(ROOT, ".env.local"), "utf8");
  const line = [...env.matchAll(/^CLONE_DATABASE_URL=(.*)$/gm)].pop()?.[1];
  if (!user || !line) throw new Error("No clone connection: CLONE-REF pooler_user or CLONE_DATABASE_URL missing.");
  const url = line.trim().replace(/^["']|["']$/g, "");
  if (decodeURIComponent(new URL(url).username) !== user) {
    throw new Error(`CLONE_DATABASE_URL is not the clone CLONE-REF names (${user}). Refusing.`);
  }
  return url.replace(/[?&]sslmode=[^&]*/, "");
}

const plantAt = process.argv.indexOf("--plant");
const plant = plantAt > 0 ? readFileSync(resolve(process.argv[plantAt + 1]), "utf8") : null;

const client = new pg.Client({ connectionString: cloneUrl(), ssl: { rejectUnauthorized: false } });
await client.connect();

/**
 * Two tables, as a clinic declares them, through the store's doors as admin@admin.com:
 * Patients (Intake date, Phone, Email) and Follow-ups (Visit, Status, Visit date, Copay, Sessions
 * authorized, Follow-up due, Expected copay total, Copay tier, Front desk line, Patient record →
 * Patients, Patient phone = lookup of Phone). Rolled back with everything else.
 */
async function provision() {
  const one = async (sql, args) => (await client.query(sql, args)).rows[0].id;
  await client.query("select set_config('request.jwt.claims', $1, true), set_config('app.actor_system', 'store-guard/a-date-setting-takes-a-worked-out-date', true)", [ADMIN_CLAIMS]);
  const home = (await client.query(
    `select r.data ->> 'parent_id' as id from custom.record r
      where r.organization_id = $1 and r.table_id = custom.table_kernel_id() and r.deleted_at is null
      group by 1 order by count(*) desc limit 1`, [ORG])).rows[0].id;
  const table = (name, slug, title) =>
    one("select custom.table_declare($1, $2::jsonb) as id", [ORG, JSON.stringify({
      name, slug, type: "entity", label_singular: name, label_plural: name, title_field: title, display: "list", weight: "light",
      ordered: true, row_order: "sorted", default_sort: [{ field: title, direction: "asc" }], parent_id: home,
      agent_writable: true, retention_days: 3650, fields: [{ name: title }] })]);
  const field = (t, spec) => one("select custom.field_declare($1, $2, $3::jsonb) as id", [ORG, t, JSON.stringify(spec)]);
  VISITS = await table("Guard patients", `guard_patients_${Date.now()}`, "full_name");
  await field(VISITS, { key: "full_name", label: "Full name", type: "text", sort: 10 });
  F.farIntake = await field(VISITS, { key: "intake_date", label: "Intake date", type: "datetime", config: { kind: "date" }, sort: 20 });
  F.farPhone = await field(VISITS, { key: "phone", label: "Phone", type: "text", sort: 30 });
  F.farEmail = await field(VISITS, { key: "email", label: "Email", type: "text", sort: 40 });
  LEDGER = await table("Guard follow-ups", `guard_follow_ups_${Date.now()}`, "visit");
  await field(LEDGER, { key: "visit", label: "Visit", type: "text", sort: 10 });
  F.status = await field(LEDGER, { key: "status", label: "Status", type: "text", sort: 20 });
  F.visitDate = await field(LEDGER, { key: "visit_date", label: "Visit date", type: "datetime", config: { kind: "date" }, sort: 30 });
  const copay = await field(LEDGER, { key: "copay", label: "Copay", type: "currency", unit: "$", sort: 40 });
  const sessions = await field(LEDGER, { key: "sessions_authorized", label: "Sessions authorized", type: "number", sort: 50 });
  F.followUp = await field(LEDGER, { key: "follow_up_due", label: "Follow-up due", type: "formula", sort: 60,
    config: { expr: { op: "fx.dateadd", args: [{ field: F.visitDate }, { const: 14 }, { const: "days" }] } } });
  await field(LEDGER, { key: "expected_copay_total", label: "Expected copay total", type: "formula", sort: 70,
    config: { expr: { op: "fx.mul", args: [{ field: copay }, { field: sessions }] } } });
  F.copayTier = await field(LEDGER, { key: "copay_tier", label: "Copay tier", type: "formula", sort: 80,
    config: { expr: { op: "fx.if", args: [{ op: "fx.gte", args: [{ field: copay }, { const: 40 }] }, { const: "High copay" }, { const: "Standard" }] } } });
  F.scratch = await field(LEDGER, { key: "front_desk_line", label: "Front desk line", type: "formula", sort: 90,
    config: { expr: { op: "fx.concatenate", args: [{ field: F.status }, { const: " — call" }] } } });
  await field(LEDGER, { key: "patient_record", label: "Patient record", type: "relation", relation_target: VISITS, sort: 100 });
  F.phoneLookup = await field(LEDGER, { key: "patient_phone", label: "Patient phone", type: "lookup", sort: 110, config: { via: "patient_record", pick: "phone" } });
}

const failures = [];
try {
  await client.query("begin");
  await client.query("set local statement_timeout = '15s'");
  // The reshaped Fields are written straight onto their rows: no field trigger may refuse a circle
  // this case EXISTS to prove is refused. Local to this rolled-back transaction.
  await client.query("set local session_replication_role = replica");
  if (plant) await client.query(plant);
  await provision();
  const CASES = cases();
  for (const k of CASES) {
    await client.query("savepoint one_case");
    let got;
    try {
      for (const [id, doc] of Object.entries(k.set ?? {})) {
        await client.query("update custom.record set data = data || $2::jsonb where id = $1", [id, JSON.stringify(doc)]);
      }
      const r = await client.query(
        "select custom._view_field_key($1, $2, $3, 'field:date', to_jsonb($4::text), '{}'::text[]) k",
        [ORG, k.table, k.path, k.key],
      );
      got = { ok: true, key: r.rows[0].k };
    } catch (e) {
      got = { ok: false, says: e.message };
    }
    await client.query("rollback to savepoint one_case");
    const right = k.want !== undefined ? got.ok && got.key === k.want : !got.ok && got.says === k.refused;
    if (!right) {
      failures.push(`${k.name}: wanted ${k.want !== undefined ? `taken (${k.want})` : `"${k.refused}"`}, got ${got.ok ? `taken (${got.key})` : `"${got.says}"`}`);
    }
  }
  // THE PICKER'S COPY OF THE NODE TABLE (records-ui `FORMULA_NODE_RESULTS`) answers as the store does.
  // `--node-table <file>` reads another copy (the plant that proves this half can go red).
  const tableAt = process.argv.indexOf("--node-table");
  const ts = readFileSync(tableAt > 0 ? resolve(process.argv[tableAt + 1]) : resolve(ROOT, "../aidream/apps/shared/records-ui/src/workedOutDate.ts"), "utf8");
  const block = /FORMULA_NODE_RESULTS[^=]*= \{([\s\S]*?)\};/.exec(ts)?.[1] ?? "";
  const mirror = Object.fromEntries([...block.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const live = Object.fromEntries((await client.query("select node, result from custom.formula_node_kinds()")).rows.map((r) => [r.node, r.result]));
  for (const node of new Set([...Object.keys(mirror), ...Object.keys(live)])) {
    if (mirror[node] !== live[node]) failures.push(`records-ui FORMULA_NODE_RESULTS["${node}"] is ${mirror[node] ?? "missing"}, the store says ${live[node] ?? "missing"}`);
  }
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}

if (failures.length) {
  console.error(`RED — a-date-setting-takes-a-worked-out-date${plant ? " (planted)" : ""}: ${failures.length} wrong\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log(`GREEN — a-date-setting-takes-a-worked-out-date${plant ? " (planted)" : ""}: every case answered as the store should.`);

#!/usr/bin/env node
// scripts/store-guards/a-date-setting-takes-a-worked-out-date.mjs — lane 10 FDT (VIEWS-AND-FIELDS)
//
// GUARD: a view's date setting (date_field / start_field / end_field) takes a formula whose answer is
// a date, and still refuses a number formula with the same sentence. Champion: Airtable, whose
// calendar and timeline are placed by a formula or lookup that returns a date.
//
// Runs on the NIGHTLY CLONE only (CLONE_DATABASE_URL, checked against CLONE-REF's pooler user), on
// real physical-therapy data — Cedar Ridge Physical Therapy's "Visit Ledger — Q3 2026", whose
// "Follow-up due = DATEADD({Visit date}, 14, 'days')" and "Expected copay total = {Copay} *
// {Sessions authorized}". Everything runs inside one transaction that is ROLLED BACK.
//
//   node scripts/store-guards/a-date-setting-takes-a-worked-out-date.mjs
//   node scripts/store-guards/a-date-setting-takes-a-worked-out-date.mjs --plant <file.sql>
//
// `--plant` executes a SQL file inside the rolled-back transaction first (e.g. the inverse, which puts
// back the body that refused every formula) — the guard must then go red.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04"; // Cedar Ridge Physical Therapy
const TABLE = "aa10f708-7b82-48d5-9683-9fa22b21f0e8"; // Visit Ledger — Q3 2026

function cloneUrl() {
  const ref = readFileSync(resolve(ROOT, "../common-docs/operations/clone/CLONE-REF"), "utf8");
  const user = /^pooler_user\s*=\s*(\S+)/m.exec(ref)?.[1];
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
const judge = async (path, key) => {
  await client.query("savepoint judge");
  try {
    const r = await client.query("select custom._view_field_key($1, $2, $3, 'field:date', to_jsonb($4::text), '{}'::text[]) k", [ORG, TABLE, path, key]);
    await client.query("release savepoint judge");
    return { ok: true, key: r.rows[0].k };
  } catch (e) {
    await client.query("rollback to savepoint judge");
    return { ok: false, says: e.message };
  }
};

const failures = [];
try {
  await client.query("begin");
  await client.query("set local statement_timeout = '15s'");
  if (plant) await client.query(plant);
  for (const path of ["date_field", "start_field", "end_field"]) {
    const date = await judge(path, "follow_up_due");
    if (!date.ok || date.key !== "follow_up_due") failures.push(`${path} refused the date formula Follow-up due: ${date.says}`);
  }
  const want = {
    date_field: "A calendar places a record by a date, and Expected copay total does not hold one.",
    start_field: "A timeline places a record by a date, and Expected copay total does not hold one.",
    end_field: "A record's end is a date, and Expected copay total does not hold one.",
  };
  for (const [path, sentence] of Object.entries(want)) {
    const number = await judge(path, "expected_copay_total");
    if (number.ok || number.says !== sentence) {
      failures.push(`${path} on the number formula Expected copay total: wanted "${sentence}", got ${number.ok ? "accepted" : `"${number.says}"`}`);
    }
  }
  const text = await judge("date_field", "copay_tier");
  if (text.ok) failures.push("date_field accepted the text formula Copay tier");
  const stored = await judge("date_field", "visit_date");
  if (!stored.ok) failures.push(`date_field refused the stored date Visit date: ${stored.says}`);
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}

if (failures.length) {
  console.error(`RED — a-date-setting-takes-a-worked-out-date${plant ? " (planted)" : ""}:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log(`GREEN — a-date-setting-takes-a-worked-out-date${plant ? " (planted)" : ""}: the date formula is taken by all three date settings; the number and text formulas are refused by name; a stored date still taken.`);

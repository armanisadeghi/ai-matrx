#!/usr/bin/env node
// scripts/campaign-tests/lane7conf_member_reads_no_confidential_fact.mjs
//
// GUARD for migrations/campaign/lane7conf_a_confidential_facts_have_their_own_readers.sql.
// Runs on the NIGHTLY CLONE only, through the CLIENT path (supabase-js, signed in with a password,
// PostgREST + row security as that person) — never a privileged role.
//
//   admin@admin.com — owner of "admin's Workspace"; created the CRM person used here; is the
//                     employee on the workspace's one HR row (so: a confidential reader on both).
//   test@test.com   — a plain MEMBER of the same workspace.
//
// RED before the file (the member reads the CRM person's tax ID / date of birth and the employee's
// legal name through three client doors); GREEN after (withheld / absent, never an error; the
// member's HR directory card still opens; the admin still reads everything).
//
//   node scripts/campaign-tests/lane7conf_member_reads_no_confidential_fact.mjs
//
// The values written are cleared again before the script exits.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { createClient } = require("@supabase/supabase-js");

const readEnv = (file) =>
  Object.fromEntries(
    fs
      .readFileSync(path.join(ROOT, file), "utf8")
      .split("\n")
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
      }),
  );
const clone = readEnv(".env.clone.local");
const local = readEnv(".env.local");
const URL_ = clone.NEXT_PUBLIC_SUPABASE_URL;
const KEY = clone.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || /db\.matrxserver\.com/.test(URL_)) throw new Error("refused: not the clone's address");

const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"; // admin's Workspace
const PERSON = "15cfec6c-978b-4e35-9057-cde522520f88"; // Lev Shevtsov, a person (created by admin@admin.com)
const COMPANY = "a02a7409-ac80-486e-82bb-0d2847c529bc"; // Apollo.io, a company (created by admin@admin.com)
const TAX = "47-3918265";
const DOB = "1986-11-04";

async function seat(email, password) {
  const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return { sb, uid: data.user.id, email: data.user.email };
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

const admin = await seat(local.AI_ADMIN_USERNAME, local.AI_ADMIN_PASSWORD);
const member = await seat(local.AI_MEMBER_USERNAME, local.AI_MEMBER_PASSWORD);
console.log(`seats: admin=${admin.email} member=${member.email}`);

// Does the split exist yet? (RED run: no door.)
const probe = await admin.sb.rpc("crm_party_confidential_read", { p_party_ids: [PERSON, COMPANY] });
const split = !probe.error;

async function seed(id, values) {
  if (split) {
    const { error } = await admin.sb.rpc("crm_party_confidential_write", { p_party_id: id, p_values: values });
    if (error) throw new Error(`seed through the door failed: ${error.message}`);
  } else {
    const { error } = await admin.sb.schema("crm").from("party").update(values).eq("id", id);
    if (error) throw new Error(`seed on the row failed: ${error.message}`);
  }
}

try {
  await seed(PERSON, { date_of_birth: DOB });
  await seed(COMPANY, { tax_id: TAX });

  // 1. CRM — the row itself, as the member.
  const rows = await member.sb.schema("crm").from("party").select("id, display_name, tax_id, date_of_birth").in("id", [PERSON, COMPANY]);
  check("member reads both CRM records without an error", !rows.error && (rows.data ?? []).length === 2, rows.error?.message);
  const leaked = (rows.data ?? []).some((r) => r.tax_id === TAX || r.date_of_birth === DOB);
  check("member does NOT read tax_id / date_of_birth on crm.party", !leaked, leaked ? JSON.stringify(rows.data.map((r) => [r.display_name, r.tax_id, r.date_of_birth])) : "blank");

  // 2. CRM — the confidential door, as the member: withheld, never an error, no value.
  const mDoor = await member.sb.rpc("crm_party_confidential_read", { p_party_ids: [PERSON, COMPANY] });
  const mEntries = Array.isArray(mDoor.data) ? mDoor.data : [];
  check(
    "member's confidential door answers withheld for both (no value, no error)",
    !mDoor.error && mEntries.length === 2 && mEntries.every((e) => e.state === "withheld" && e.tax_id === undefined && e.date_of_birth === undefined),
    mDoor.error ? mDoor.error.message : JSON.stringify(mEntries),
  );

  // 3. CRM — the reader (creator + owner) still reads both values.
  const aDoor = await admin.sb.rpc("crm_party_confidential_read", { p_party_ids: [PERSON, COMPANY] });
  const aE = Object.fromEntries((Array.isArray(aDoor.data) ? aDoor.data : []).map((e) => [e.party_id, e]));
  check(
    "admin (owner, creator) reads both values through the door",
    !aDoor.error && aE[PERSON]?.state === "shown" && aE[PERSON].date_of_birth === DOB && aE[COMPANY]?.state === "shown" && aE[COMPANY].tax_id === TAX,
    aDoor.error ? aDoor.error.message : JSON.stringify(aDoor.data),
  );

  // 4. CRM — a member cannot write them.
  const mWrite = await member.sb.rpc("crm_party_confidential_write", { p_party_id: COMPANY, p_values: { tax_id: "00-0000000" } });
  check("member's write is refused in a sentence", !!mWrite.error && mWrite.error.code === "42501", mWrite.error?.message ?? "accepted");

  // 5. HR — the employee row through the generic record door, as the member.
  const empId = "7ed6df33-48e9-4e9a-9bf3-949c96126b31"; // EMP-00001, the workspace's one employee (admin@admin.com)
  const mRec = await member.sb.schema("custom").rpc("entity_record_read", { p_organization_id: ORG, p_token: "hr_employee", p_record_id: empId });
  const legal = JSON.stringify(mRec.data ?? null).includes("legal_first_name");
  check("member does NOT read the employee row (legal names) through entity_record_read", !legal, mRec.error ? `error: ${mRec.error.message}` : legal ? "row returned" : "withheld");
  check("that read is not an error", !mRec.error, mRec.error?.message);

  // 6. HR — history of the employee row, as the member.
  const hist = await member.sb.schema("history").from("row_versions").select("id, row_data").eq("entity_type", "hr_employee").eq("row_id", empId).limit(5);
  check("member reads no hr_employee history versions", !hist.error && (hist.data ?? []).length === 0, hist.error ? hist.error.message : `${(hist.data ?? []).length} version(s)`);

  // 7. HR — the directory a member legitimately uses still opens (peer tier).
  const prof = await member.sb.rpc("hr_employee_profile", { p_employee_id: empId });
  check(
    "member's HR directory card still opens with the colleague's name and no legal name",
    !prof.error && prof.data?.granted === true && !!prof.data?.header?.display_name && prof.data?.header?.legal_name === undefined,
    prof.error ? prof.error.message : `viewer=${prof.data?.viewer} name=${prof.data?.header?.display_name}`,
  );

  // 8. HR — the employee herself (admin@admin.com) still reads her row.
  const aRec = await admin.sb.schema("custom").rpc("entity_record_read", { p_organization_id: ORG, p_token: "hr_employee", p_record_id: empId });
  check("the employee still reads her own row", !aRec.error && JSON.stringify(aRec.data).includes("legal_first_name"), aRec.error?.message);
} finally {
  await seed(PERSON, { date_of_birth: null }).catch((e) => console.log(`cleanup failed: ${e.message}`));
  await seed(COMPANY, { tax_id: null }).catch((e) => console.log(`cleanup failed: ${e.message}`));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${split ? "" : " (split not present: RED expected)"}`);
process.exit(failed.length ? 1 : 0);

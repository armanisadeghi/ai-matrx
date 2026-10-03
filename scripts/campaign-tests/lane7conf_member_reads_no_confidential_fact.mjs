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
  // A single-record door answers a row the person cannot open with its own closed-door sentence (the
  // same one as for any record they cannot reach) — never a crash, never developer text, never the row.
  const plain = !mRec.error || (/^[A-Z][^\n]{10,160}\.$/.test(mRec.error.message) && !/legal|relation|column|SQL/i.test(mRec.error.message));
  check("that read is the door's plain closed-door answer, not a crash", plain, mRec.error ? `${mRec.error.code}: ${mRec.error.message}` : "no error");

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

  // ── § c (lane7conf_c): every generic door answers the facts honestly; one write path; merge carries.
  // c1. The MCP / record door: the reader gets the value, the member gets it withheld (named).
  const aParty = await admin.sb.schema("custom").rpc("entity_record_read", { p_organization_id: ORG, p_token: "party", p_record_id: PERSON });
  check("c1 reader's record door carries the date of birth", aParty.data?.columns?.date_of_birth === DOB, aParty.error?.message ?? `got ${aParty.data?.columns?.date_of_birth}`);
  const mParty = await member.sb.schema("custom").rpc("entity_record_read", { p_organization_id: ORG, p_token: "party", p_record_id: PERSON });
  const mCols = mParty.data?.columns ?? {};
  check("c1 member's record door names date_of_birth as withheld (no value, no silent null)",
    !mParty.error && !("date_of_birth" in mCols) && (mCols._withheld ?? []).includes("date_of_birth"),
    mParty.error?.message ?? JSON.stringify({ dob: mCols.date_of_birth, withheld: mCols._withheld }));
  // c2. The Table API / drill rows door.
  const drill = async (sb) => {
    const r = await sb.rpc("drill_rows", { p_organization_id: ORG, p_source: { kind: "entity", token: "party", api: true }, p_question: { limit: 100 } });
    return { error: r.error, row: (r.data?.rows ?? []).find((x) => x.id === COMPANY) };
  };
  const aDrill = await drill(admin.sb.schema("platform"));
  check("c2 reader's Table API row carries the tax ID", aDrill.row?.tax_id === TAX, aDrill.error?.message ?? JSON.stringify(aDrill.row ?? null));
  const mDrill = await drill(member.sb.schema("platform"));
  check("c2 member's Table API row names tax_id as withheld", !!mDrill.row && !("tax_id" in mDrill.row) && (mDrill.row._withheld ?? []).includes("tax_id"),
    mDrill.error?.message ?? JSON.stringify(mDrill.row ?? null));
  // c3. A Reference's record.
  const mRef = await member.sb.schema("custom").rpc("entity_reference_rows", { p_organization_id: ORG, p_token: "party", p_ids: [PERSON] });
  const aRef = await admin.sb.schema("custom").rpc("entity_reference_rows", { p_organization_id: ORG, p_token: "party", p_ids: [PERSON] });
  check("c3 reference rows: reader sees the value, member sees it withheld",
    aRef.data?.[PERSON]?.date_of_birth === DOB && (mRef.data?.[PERSON]?._withheld ?? []).includes("date_of_birth") && !("date_of_birth" in (mRef.data?.[PERSON] ?? {})),
    JSON.stringify({ a: aRef.error?.message ?? aRef.data?.[PERSON]?.date_of_birth, m: mRef.error?.message ?? mRef.data?.[PERSON]?._withheld }));
  // c4. Clearing through the old column clears the kept value (one write path, no stale copy).
  if (split) {
    const clr = await admin.sb.schema("crm").from("party").update({ date_of_birth: null }).eq("id", PERSON);
    const after = await admin.sb.rpc("crm_party_confidential_read", { p_party_ids: [PERSON] });
    check("c4 writing NULL to the old column clears the date of birth", !clr.error && after.data?.[0]?.date_of_birth === null,
      clr.error?.message ?? `still ${after.data?.[0]?.date_of_birth}`);
    await seed(PERSON, { date_of_birth: DOB });
  }
  // c5. Merging carries the facts to the survivor; unmerge takes them back.
  if (split) {
    const WIN = "531e6866-5b65-4c04-b15b-fab70d3b484f"; // Zack Kotzer
    const LOSE = "da6c2c09-47df-46f2-9487-c7ad9504f1d9"; // Zack Kotzer Published August (the duplicate)
    const ZDOB = "1979-06-21";
    await seed(LOSE, { date_of_birth: ZDOB });
    const mg = await admin.sb.rpc("crm_merge_parties", { p_winner: WIN, p_loser: LOSE, p_method: "manual", p_reason: "lane7conf_c guard: duplicate" });
    const w = await admin.sb.rpc("crm_party_confidential_read", { p_party_ids: [WIN] });
    check("c5 merge carries the duplicate's date of birth to the survivor", !mg.error && w.data?.[0]?.date_of_birth === ZDOB, mg.error?.message ?? JSON.stringify(w.data));
    if (!mg.error) {
      const um = await admin.sb.rpc("crm_unmerge_parties", { p_merge_id: mg.data });
      const w2 = await admin.sb.rpc("crm_party_confidential_read", { p_party_ids: [WIN, LOSE] });
      const byId = Object.fromEntries((w2.data ?? []).map((e) => [e.party_id, e]));
      check("c5 unmerge takes it back from the survivor and the duplicate keeps it",
        !um.error && byId[WIN]?.date_of_birth === null && byId[LOSE]?.date_of_birth === ZDOB, um.error?.message ?? JSON.stringify(w2.data));
    }
    await seed(LOSE, { date_of_birth: null }).catch(() => undefined);
  }

  // ── § d (lane7conf_d1/d2): an HR workflow request (pay change) is read by its people, not by any member.
  {
    const OAK = "2643e470-b275-47f3-95f3-ae275ad3ca47"; // Oak Street Studio (admin@admin.com owns; HR runs here)
    const PAY = "2b9bc444-b790-4674-a178-9b72817161ae"; // a pay_change request in Oak Street Studio
    // test@test.com joins Oak Street Studio as a plain member the way a person does (the owner invites,
    // she accepts), for this check only; the owner removes her again below.
    const inv = await admin.sb.rpc("inv_create", { p_target_type: "organization", p_target_id: OAK, p_email: member.email, p_role: "member", p_org_id: OAK });
    const join = inv.error ? inv : await member.sb.rpc("inv_accept", { p_token: inv.data?.token });
    try {
      const mWf = await member.sb.schema("custom").rpc("entity_record_read", { p_organization_id: OAK, p_token: "hr_workflow_instance", p_record_id: PAY });
      const leakedWf = !!mWf.data?.columns?.payload;
      check("d1 a plain member does NOT read a pay-change request (payload) through the record door", !leakedWf,
        join.error ? `join failed: ${join.error.message}` : leakedWf ? "payload returned" : `withheld (${mWf.error?.code ?? "no error"})`);
      const aWf = await admin.sb.schema("custom").rpc("entity_record_read", { p_organization_id: OAK, p_token: "hr_workflow_instance", p_record_id: PAY });
      check("d2 the HR owner still reads it", !!aWf.data?.columns?.payload, aWf.error?.message);
      const inbox = await admin.sb.rpc("hr_wf_instance", { p_instance_id: PAY });
      check("d3 HR's own decision panel door still opens it", !inbox.error && !!inbox.data, inbox.error?.message);
    } finally {
      const out = await admin.sb.rpc("org_admin_remove_member", { p_org_id: OAK, p_user_id: member.uid, p_reassign_to: null });
      if (out.error) console.log(`cleanup: removing the member failed: ${out.error.message}`);
    }
  }

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

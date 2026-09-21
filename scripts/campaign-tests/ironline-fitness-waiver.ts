#!/usr/bin/env npx tsx
/**
 * LIMITS-FIX — THE REAL-DATA FIXTURE for the checkbox (boolean) field type.
 *
 * THE USE CASE. Ironline Fitness is a strength-training gym in Tempe, Arizona with a
 * platform-rack floor. Before a member is allowed on the platforms the front desk has to
 * know one yes/no fact about them: have they signed the liability waiver. The gym's third
 * state is the reason this field type had to exist — a member who has REFUSED to sign and a
 * member NOBODY HAS ASKED YET are two completely different conversations, and a screen that
 * draws both as an empty box sends the wrong one to the platforms.
 *
 * The members below are synthesized. The shapes — membership tier, join date, monthly dues,
 * waiver, fob issued — are the real ones a gym's front desk keeps.
 *
 * It creates the organization, turns the record store on for it, declares the table with a
 * REAL checkbox column, and writes the members. `ironline-fitness-waiver.spec.mjs` then
 * drives the shipped grid headlessly against it.
 *
 *   npx tsx scripts/campaign-tests/ironline-fitness-waiver.ts
 *
 * RE-RUNNABLE WITHOUT MINTING A SECOND GYM. Set IRONLINE_ORG / IRONLINE_TABLE / IRONLINE_HOME
 * to the ids it printed and it re-reads and re-asserts the fixture instead of creating one.
 * A script that made a new organization every time it was run would leave a row of identical
 * "Ironline Fitness" organizations behind it, which is the junk the owner law is about.
 */
import path from "node:path";
import dotenv from "dotenv";
import { writeFileSync } from "node:fs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), override: true });

const ADMIN_EMAIL = process.env.AI_ADMIN_USERNAME as string;
const ADMIN_PASSWORD = process.env.AI_ADMIN_PASSWORD as string;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;

/** Six members of a real gym's roster, and the three answers a waiver column has. */
const MEMBERS: Array<Record<string, unknown>> = [
  { member: "Priya Raghunathan", membership_tier: "Platform", joined: "2026-01-14", monthly_dues: 89, waiver_signed: true, fob_issued: true },
  { member: "Marcus Oyelaran", membership_tier: "Platform", joined: "2025-11-02", monthly_dues: 89, waiver_signed: true, fob_issued: true },
  { member: "Rosalind Achebe", membership_tier: "Open gym", joined: "2026-03-09", monthly_dues: 49, waiver_signed: false, fob_issued: false },
  { member: "Tomas Ferreira", membership_tier: "Platform", joined: "2026-08-21", monthly_dues: 89, waiver_signed: false, fob_issued: false },
  // NOBODY HAS ASKED THESE TWO YET. The key is simply absent from the document — it is
  // not `false`, and the front desk's whole question is which members these are.
  { member: "Grace Lindqvist", membership_tier: "Open gym", joined: "2026-09-15", monthly_dues: 49, fob_issued: false },
  { member: "Andre Boateng", membership_tier: "Barbell club", joined: "2026-09-18", monthly_dues: 129, fob_issued: false },
];

async function main() {
  const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY);
  const signedIn = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (signedIn.error || !signedIn.data.user) throw new Error(`sign-in failed: ${signedIn.error?.message}`);
  const userId = signedIn.data.user.id;
  console.log(`signed in as ${signedIn.data.user.email}`);

  const resumeOrg = process.env.IRONLINE_ORG;
  const resumeTable = process.env.IRONLINE_TABLE;
  const resumeHome = process.env.IRONLINE_HOME;
  if (resumeOrg && resumeTable && resumeHome) {
    const resumed: RecordsClient = createRecordsClient({
      dataSource: recordsDataSource(supabase),
      actor: personActor(userId),
      organizationId: resumeOrg,
    });
    await assertTheThreeStates(resumed, resumeTable);
    writeFileSync(
      path.resolve(__dirname, "ironline-fitness-waiver.json"),
      JSON.stringify({ orgId: resumeOrg, homeId: resumeHome, tableId: resumeTable, members: MEMBERS.length }, null, 2),
    );
    console.log(`\nfixture re-read. org=${resumeOrg} table=${resumeTable}`);
    return;
  }

  const stamp = Date.now().toString(36);
  const { data: org, error: orgError } = await supabase.rpc("org_create", {
    p_name: "Ironline Fitness",
    p_abbreviation: "IRF",
    p_slug: `ironline-fitness-${stamp}`,
    p_description:
      "Strength-training gym, Tempe AZ. Front-desk member roster: who has signed the liability waiver, who has refused, and who has not been asked.",
    p_logo_url: null,
    p_logo_file_id: null,
    p_website: null,
    p_settings: { test_fixture: true, lane: "LIMITS-FIX", use_case: "gym member waiver" },
  });
  if (orgError) throw new Error(`org_create failed: ${orgError.message}`);
  const orgId: string = Array.isArray(org) ? ((org[0] as any)?.id ?? org[0]) : ((org as any)?.id ?? org);
  console.log(`organization Ironline Fitness -> ${orgId}`);

  const store: RecordsClient = createRecordsClient({
    dataSource: recordsDataSource(supabase),
    actor: personActor(userId),
    organizationId: orgId,
  });

  const kernel = await store.personKernelId();
  if (!kernel.ok) throw new Error(`personKernelId failed: ${JSON.stringify(kernel)}`);
  const home = await store.recordWrite({ table_id: kernel.data, data: { name: "Ironline Fitness — front desk" } });
  if (!home.ok) throw new Error(`home write failed: ${JSON.stringify(home)}`);
  const homeId = home.data;

  const declared = await store.tableDeclare({
    spec: {
      name: "Ironline Fitness: Members",
      slug: `ironline_members_${stamp}`,
      type: "entity",
      label_singular: "Member",
      label_plural: "Members",
      display: "page",
      weight: "light",
      ordered: false,
      row_order: "sorted",
      retention_days: 2555,
      agent_writable: true,
      title_field: "member",
      default_sort: [{ field: "member", direction: "asc" }],
      fields: [{ name: "member", label: "member", plain: "text" }],
    },
    homeId,
  });
  if (!declared.ok) throw new Error(`tableDeclare failed: ${JSON.stringify(declared)}`);
  const tableId = declared.data;
  console.log(`table Members -> ${tableId}`);

  // THE COLUMN THIS LANE EXISTS FOR, declared by the word a person uses.
  for (const spec of [
    { label: "Membership tier", parity_type: "select" as const, options: ["Open gym", "Platform", "Barbell club"] },
    { label: "Joined", parity_type: "datetime" as const, kind: "date" as const },
    { label: "Monthly dues", parity_type: "currency" as const, unit: "$" },
    { label: "Waiver signed", type: "checkbox" as const },
    { label: "Fob issued", type: "checkbox" as const },
  ]) {
    const field = await store.fieldDeclare({ table_id: tableId, spec: spec as never });
    if (!field.ok) throw new Error(`fieldDeclare ${spec.label} failed: ${JSON.stringify(field)}`);
    console.log(`  column ${spec.label} -> ${field.data}`);
  }

  for (const row of MEMBERS) {
    const written = await store.recordWrite({ table_id: tableId, data: { ...row, parent_id: homeId } });
    if (!written.ok) throw new Error(`recordWrite ${row.member} failed: ${JSON.stringify(written)}`);
  }
  console.log(`${MEMBERS.length} members written`);

  await assertTheThreeStates(store, tableId);

  writeFileSync(
    path.resolve(__dirname, "ironline-fitness-waiver.json"),
    JSON.stringify({ orgId, homeId, tableId, members: MEMBERS.length }, null, 2),
  );
  console.log(`\nfixture written. org=${orgId} table=${tableId}`);
}

/**
 * THE ASSERTION THE WHOLE FIXTURE IS FOR: what the READ DOOR hands a screen back is a real
 * boolean for the members who answered, and NOTHING AT ALL for the two nobody has asked.
 */
async function assertTheThreeStates(store: RecordsClient, tableId: string): Promise<void> {
  const read = await store.list({ table_id: tableId, limit: 50 });
  if (!read.ok) throw new Error(`list failed: ${JSON.stringify(read)}`);
  const shapes = read.data.rows.map((r) => ({
    member: r.document?.["member"],
    waiver: r.document?.["waiver_signed"],
    shape: typeof r.document?.["waiver_signed"],
  }));
  console.log("what the read door hands back:");
  for (const s of shapes) {
    console.log(`  ${String(s.member).padEnd(22)} ${s.shape === "undefined" ? "(nobody has asked)" : `${s.shape} ${String(s.waiver)}`}`);
  }
  const signed = shapes.filter((s) => s.waiver === true).length;
  const refused = shapes.filter((s) => s.waiver === false).length;
  const unasked = shapes.filter((s) => s.shape === "undefined").length;
  if (signed !== 2 || refused !== 2 || unasked !== 2) {
    throw new Error(`expected 2 signed / 2 refused / 2 never asked, got ${signed} / ${refused} / ${unasked}`);
  }
  console.log(`\nTHREE STATES: ${signed} signed, ${refused} not signed, ${unasked} nobody has asked.`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });

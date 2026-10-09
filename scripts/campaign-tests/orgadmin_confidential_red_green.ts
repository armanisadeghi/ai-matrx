#!/usr/bin/env npx tsx
/**
 * CONFIDENTIAL-BY-ORG-ADMIN — proven from real seats through client doors (LIVE, disposable records only).
 *
 *   cd matrx-frontend && npx tsx scripts/campaign-tests/orgadmin_confidential_red_green.ts
 *
 * Seats: admin@admin.com (owner of Cedar Ridge Physical Therapy) and test@test.com (a plain member of it),
 * both signed in with their own password, calling the store's own doors. One fresh realistic custom table
 * ("Compensation Reviews") is declared, used and archived at the end.
 *
 *   1  Before: the member reads the table's row (Organization is the default).
 *   2  The plain member is REFUSED setting Confidential, and the table stays Organization; her facts say can_set = false.
 *   3  The admin's facts say can_set = true; a missing reason and a field that is not the table's are refused.
 *   4  The admin sets Confidential with a person column as reader; the ledger holds her id, seat, reason and date.
 *   5  The member now reads NOTHING from the table; the admin (its maker) still reads her row.
 *   6  NOBODY can set Confidential through the new door on a platform-kept table, a typed table, or a table of a
 *      system organization (the admin is refused with "The platform sets how open this table is" or "Only an owner...").
 *   7  The admin moves it back to Organization; the member reads the row again.
 *
 * RED = the doors do not exist yet (PGRST202 on the first call) or any check below fails. Exit 0 GREEN, 1 RED, 2 could not run.
 */
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createRecordsClient } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), override: true });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;
const SECRET = process.env.SUPABASE_SECRET_KEY as string;
const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04"; // Cedar Ridge Physical Therapy
const PERSON_KERNEL = "11111111-0000-4000-8000-000000000005";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed += 1;
};

async function seat(email: string, password: string) {
  const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await sb.auth.signInWithPassword({ email, password });
  if (s.error || !s.data.user) throw new Error(`UNMEASURED: ${email} could not sign in (${s.error?.message})`);
  const custom = (fn: string, args: Record<string, unknown>) => sb.schema("custom").rpc(fn, args);
  return { sb, id: s.data.user.id, custom };
}

async function main() {
  const admin = await seat(process.env.AI_ADMIN_USERNAME as string, process.env.AI_ADMIN_PASSWORD as string);
  const member = await seat("test@test.com", "Password1234#");
  const service = createClient(URL_, SECRET, { auth: { persistSession: false } });
  const sql = async (query: string) => {
    const r = await service.rpc("execute_admin_query", { query });
    if (r.error) throw new Error(r.error.message);
    return (r.data as unknown as { result: Array<Record<string, unknown>> }).result;
  };

  const store = createRecordsClient({
    dataSource: recordsDataSource(admin.sb),
    actor: personActor(admin.id),
    organizationId: ORG,
  });
  const home = await store.personKernelId();
  if (!home.ok) throw new Error(`UNMEASURED: personKernelId ${JSON.stringify(home)}`);
  const homeRec = await store.recordWrite({ table_id: home.data, data: { name: "Cedar Ridge HR review home" } });
  if (!homeRec.ok) throw new Error(`UNMEASURED: home ${JSON.stringify(homeRec)}`);
  const declared = await store.tableDeclare({
    spec: {
      name: "Compensation Reviews",
      slug: `compensation_reviews_${Date.now().toString(36)}`,
      type: "entity",
      label_singular: "Compensation review",
      label_plural: "Compensation reviews",
      display: "list",
      weight: "light",
      ordered: false,
      row_order: "sorted",
      retention_days: 365,
      agent_writable: false,
      title_field: "name",
      default_sort: [{ field: "name", direction: "asc" }],
      fields: [
        { name: "name", label: "name", plain: "text" },
        { name: "reviewer", label: "reviewer", type: "relation", relation_target: PERSON_KERNEL },
      ],
    },
    homeId: homeRec.data,
  });
  if (!declared.ok) throw new Error(`UNMEASURED: tableDeclare ${JSON.stringify(declared)}`);
  const TABLE = declared.data;
  const row = await store.recordWrite({ table_id: TABLE, data: { name: "Q4 compensation review - physical therapist band 3" } });
  if (!row.ok) throw new Error(`UNMEASURED: row ${JSON.stringify(row)}`);

  const read = async (s: typeof admin) => {
    const r = await s.custom("read_records", { p_organization_id: ORG, p_table_id: TABLE, p_limit: 50, p_offset: 0 });
    if (r.error) return { n: -1, stubs: 0, error: r.error };
    // A row the reader may not open comes back as the store's honest locked stub ({id, exists, submitted_at}, level null):
    // the reader learns a row exists and nothing of what it says. Only a row with its content counts as READ.
    const rows = r.data as Array<{ document?: Record<string, unknown> }>;
    const open = rows.filter((x) => x.document && "name" in x.document).length;
    return { n: open, stubs: rows.length - open, error: null };
  };

  // 1 ─ before
  const before = await member.custom("table_level_facts", { p_table_id: TABLE });
  if (before.error?.code === "PGRST202") {
    console.log("RED: custom.table_level_facts does not exist on this database.");
    process.exit(1);
  }
  check("1 the member reads the row while the table is Organization", (await read(member)).n === 1);

  // 2 ─ the plain member is refused
  const refusedMember = await member.custom("set_table_confidential", { p_table_id: TABLE, p_readers: [{ field: "reviewer", level: "viewer" }], p_reason: "I would like it private" });
  check("2a a plain member is refused setting Confidential", refusedMember.error?.code === "42501", refusedMember.error?.message ?? "NOT REFUSED");
  const f1 = (await member.custom("table_level_facts", { p_table_id: TABLE })).data as Record<string, unknown>;
  check("2b her facts: Organization, can_set false", f1?.["level"] === "organization" && f1?.["can_set"] === false);
  const f1a = (await admin.custom("table_level_facts", { p_table_id: TABLE })).data as Record<string, unknown>;
  check("2c the table stayed Organization", f1a?.["level"] === "organization");

  // 3 ─ the admin: facts and refusals
  check("3a the admin's facts: can_set true, set_by org_admin", f1a?.["can_set"] === true && f1a?.["set_by"] === "org_admin");
  const noReason = await admin.custom("set_table_confidential", { p_table_id: TABLE, p_readers: [], p_reason: "  " });
  check("3b no reason is refused (22023)", noReason.error?.code === "22023", noReason.error?.message ?? "NOT REFUSED");
  const badField = await admin.custom("set_table_confidential", { p_table_id: TABLE, p_readers: [{ field: "not_a_column", level: "viewer" }], p_reason: "Pay figures" });
  check("3c a reader that is not the table's own field is refused (23514)", badField.error?.code === "23514", badField.error?.message ?? "NOT REFUSED");

  // 4 ─ the admin sets Confidential
  const set = await admin.custom("set_table_confidential", { p_table_id: TABLE, p_readers: [{ field: "reviewer", level: "viewer" }], p_reason: "Compensation figures are for HR only" });
  check("4a the admin sets Confidential", !set.error && (set.data as Record<string, unknown>)?.["level"] === "confidential", set.error?.message ?? "");
  const ledger = await sql(`select approver_user_id, approver_role, reason, approved_on::text as approved_on, level from platform.class_approval_by_org_admin where token = 'custom.table:${TABLE}' order by id`);
  check("4b the ledger holds her id, seat, reason and date", ledger.length === 1 && ledger[0]?.["approver_user_id"] === admin.id && ledger[0]?.["approver_role"] === "owner" && ledger[0]?.["reason"] === "Compensation figures are for HR only" && ledger[0]?.["level"] === "confidential", JSON.stringify(ledger));
  const arman = await sql(`select count(*)::int as n from platform.class_approval_by_arman where token = 'custom.table:${TABLE}'`);
  check("4c nothing was written under Arman's name", arman[0]?.["n"] === 0);

  // 5 ─ the member sees nothing; the maker still does
  const m5 = await read(member);
  check("5a the member, not named, reads no row's content (the store may show a locked stub)", m5.n === 0, JSON.stringify(m5));
  check("5b the admin (its maker) still reads her row", (await read(admin)).n === 1);
  const f5 = (await member.custom("table_level_facts", { p_table_id: TABLE })).data as Record<string, unknown> | null;
  check("5c the member's facts read Confidential, can_set false", f5 === null || (f5["level"] === "confidential" && f5["can_set"] === false));

  // 6 ─ nobody sets Confidential on a platform / typed table through the new door
  const targets = await sql(`
    (select 'typed_kept_by_app' as why, t.id::text as id from custom.record t where t.organization_id = '${ORG}' and t.table_id = custom.table_kernel_id() and t.data_class = 'table' and t.deleted_at is null and t.data->>'kept_by_the_app' = 'true' limit 1)
    union all
    (select 'typed_kind', t.id::text from custom.record t where t.organization_id = '${ORG}' and t.table_id = custom.table_kernel_id() and t.data_class = 'table' and t.deleted_at is null and t.data ? 'kind' limit 1)
    union all
    (select 'system_org', t.id::text from custom.record t join iam.system_orgs so on so.organization_id = t.organization_id where t.table_id = custom.table_kernel_id() and t.data_class = 'table' and t.deleted_at is null limit 1)`);
  check("6 the proof found at least one platform or typed table to try", targets.length > 0);
  for (const t of targets) {
    for (const [name, s] of [["admin", admin], ["member", member]] as const) {
      const r = await s.custom("set_table_confidential", { p_table_id: t["id"], p_readers: [], p_reason: "Trying to lock it" });
      check(`6 ${name} on a ${t["why"]} table is refused`, r.error?.code === "42501", r.error?.message ?? "NOT REFUSED");
    }
    const lvl = await sql(`select coalesce(data->>'level','organization') as level from custom.record where id = '${t["id"]}'`);
    check(`6 the ${t["why"]} table is still Organization`, lvl[0]?.["level"] === "organization");
  }

  // 7 ─ the way back
  const memberBack = await member.custom("set_table_organization", { p_table_id: TABLE, p_reason: "Put it back" });
  check("7a the member cannot move it back", memberBack.error?.code === "42501" || memberBack.error?.code === "02000", memberBack.error?.message ?? "NOT REFUSED");
  const back = await admin.custom("set_table_organization", { p_table_id: TABLE, p_reason: "Review cycle is over" });
  check("7b the admin moves it back to Organization", !back.error && (back.data as Record<string, unknown>)?.["level"] === "organization", back.error?.message ?? "");
  check("7c the member reads the row again", (await read(member)).n === 1);

  await store.tableArchive({ table_id: TABLE });
  console.log(failed === 0 ? "GREEN" : `RED (${failed} failed)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("COULD NOT RUN", e);
  process.exit(2);
});

// features/spaces/data/page-database-live-proof.ts — live proof that a page's own database follows the page's
// share (association `document → record` `page_database`, Notion: an inline database is part of its page),
// and that a page which only shows a table made elsewhere (a linked view) shares nothing of it.
//
// Run: pnpm tsx --env-file=.env --env-file=.env.local features/spaces/data/page-database-live-proof.ts <admin-org-id>
// Signs in as admin@admin.com (AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD) and test@test.com
// (SPACES_PROOF_SECOND_PASSWORD, else the admin password). The organization must be one the admin owns and
// test@test.com is NOT a member of. Prints one PASS/FAIL line per claim and archives what it made.

import { createClient } from "@supabase/supabase-js";
import { createRecordsClient, declareTable, supabaseDataSource } from "@ai-matrx/records/core";

import type { Database } from "@/types/database.types";
import { SupabaseSpacesStore } from "../store-db/supabase-store";
import { adoptPageDatabase } from "./new-database";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const orgId = process.argv[2];
if (!url || !key || !orgId) throw new Error("Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and an organization id argument.");

async function signedIn(email: string, password: string) {
  const db = createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
  const records = createRecordsClient({ dataSource: supabaseDataSource(db as never), actor: { actor: "user", user_id: data.user.id }, organizationId: orgId });
  return { db, userId: data.user.id, records };
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const dbBlock = (tableId: string, title: string, linked: boolean) => {
  const view = { id: crypto.randomUUID(), name: "Table", layout: "grid" as const };
  return { id: crypto.randomUUID(), type: "database", props: { source: { kind: "table", tableId }, inline: true, title, linked, views: [view], activeViewId: view.id } };
};

async function main() {
  const admin = await signedIn(process.env.AI_ADMIN_USERNAME!, process.env.AI_ADMIN_PASSWORD!);
  const second = await signedIn("test@test.com", process.env.SPACES_PROOF_SECOND_PASSWORD ?? process.env.AI_ADMIN_PASSWORD!);
  const store = new SupabaseSpacesStore(admin.db, orgId);
  const pages: string[] = [];
  const stamp = Date.now().toString(36);
  const NAME = { key: "name", label: "Name", type: "text", sort: 10, required: false } as const;

  try {
    // A page with its own inline database, made the way "/" → Database makes it.
    const own = await declareTable(admin.records, { name: "Appointments", slug: `appointments_${stamp}`, titleField: "name", fields: [NAME] });
    if (!own.ok) throw new Error(own.error.message);
    const page = await store.create({ parentId: null, title: "Grooming week of Oct 13", blocks: [dbBlock(own.data, "Appointments", false)] as never });
    pages.push(page.id);
    await adoptPageDatabase(page.id, own.data, admin.db as never);
    const seeded = await admin.records.recordWrite({ table_id: own.data, data: { name: "Biscuit — full groom, Tue 10:00" } as never });
    check("admin makes a page, its inline database and a row", seeded.ok, seeded.ok ? "" : seeded.error.message);

    // A table made elsewhere, shown on a second page only as a linked view.
    const outside = await declareTable(admin.records, { name: "Supplier price list", slug: `supplier_price_list_${stamp}`, titleField: "name", fields: [NAME] });
    if (!outside.ok) throw new Error(outside.error.message);
    await admin.records.recordWrite({ table_id: outside.data, data: { name: "Oatmeal shampoo, 1 gal — $38" } as never });
    const linkedPage = await store.create({ parentId: null, title: "Supplies to reorder", blocks: [dbBlock(outside.data, "Supplier price list", true)] as never });
    pages.push(linkedPage.id);

    for (const id of [page.id, linkedPage.id]) {
      const { error } = await admin.db.rpc("share_resource_with_user", { p_resource_type: "document", p_resource_id: id, p_target_user_id: second.userId, p_permission_level: "edit_content" });
      check(`share ${id === page.id ? "the page" : "the linked-view page"} with test@test.com at Can edit content`, !error, error?.message ?? "");
    }

    const read = await second.records.list({ table_id: own.data } as never);
    const rows = read.ok ? ((read.data as { rows?: Array<{ id: string; data: Record<string, unknown> }> }).rows ?? []) : [];
    check("test@test.com sees the page's inline database rows", read.ok && rows.length === 1, read.ok ? `${rows.length} row(s)` : read.error.message);

    const edited = rows[0] ? await second.records.recordUpdate({ record_id: rows[0].id, patch: { name: "Biscuit — full groom, Tue 11:30" } }) : null;
    check("test@test.com edits a row", Boolean(edited?.ok), edited && !edited.ok ? edited.error.message : "");

    const added = await second.records.recordWrite({ table_id: own.data, data: { name: "Maple — nail trim, Wed 9:00" } as never });
    check("test@test.com adds a row", added.ok, added.ok ? "" : added.error.message);

    const del = rows[0] ? await second.records.recordDelete({ record_id: rows[0].id }) : null;
    check("test@test.com cannot delete a row at Can edit content", Boolean(del && !del.ok), del && !del.ok ? del.error.message : "deleted");

    const col = await second.records.fieldDeclare({ table_id: own.data, spec: { key: "groomer", label: "Groomer", type: "text" } as never });
    check("test@test.com cannot add a property at Can edit content", !col.ok, col.ok ? "added" : col.error.message);

    const outsideRead = await second.records.list({ table_id: outside.data } as never);
    const outsideRows = outsideRead.ok ? ((outsideRead.data as { rows?: unknown[] }).rows ?? []) : [];
    check("a page that only links an outside table gives test@test.com none of it", !outsideRead.ok || outsideRows.length === 0, outsideRead.ok ? `${outsideRows.length} row(s)` : outsideRead.error.message);

    const claim = await (second.db.rpc as never as (fn: string, a: object) => Promise<{ error: { message: string } | null }>)("assoc_link", {
      p_source_type: "document", p_source_id: linkedPage.id, p_target_type: "record", p_target_id: outside.data, p_role: "page_database", p_label: "page_database",
    });
    check("test@test.com cannot claim the outside table for a page shared at Can edit content", Boolean(claim.error), claim.error?.message ?? "claimed");

    await store.archive(page.id);
    const gone = await admin.records.tableArchived({ table_id: own.data });
    check("archiving the page archives its own database", gone.ok && gone.data !== null, gone.ok ? "" : gone.error.message);
    await store.restore(page.id);
    const back = await admin.records.tableArchived({ table_id: own.data });
    check("restoring the page brings its database back", back.ok && back.data === null, back.ok ? "" : back.error.message);
  } finally {
    for (const id of pages) {
      await admin.db.rpc("revoke_resource_access", { p_resource_type: "document", p_resource_id: id, p_target_user_id: second.userId });
      await store.archive(id).catch(() => undefined);
    }
  }
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
}

main().catch((e: unknown) => {
  console.error("FAIL  proof stopped:", e instanceof Error ? e.message : JSON.stringify(e));
  process.exit(1);
});

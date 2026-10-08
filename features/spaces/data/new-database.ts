// features/spaces/data/new-database.ts — Notion's "/database inline" and "/database full page": a NEW
// real table made in the page's organization (the person's "Create table" door, records `declareTable`),
// shown at once by a database block. The page and its tables share one organization (as "Add the sample").

import { createRecordsClient, declareTable, supabaseDataSource, tokenFor } from "@ai-matrx/records/core";

import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { createClient } from "@/utils/supabase/client";

import { pageOrganizationId } from "./agency-install";
import type { PickedSource } from "./SourcePicker";

/** Notion's new database: one title property, "Name". The property editor adds the rest. */
const NAME_FIELD = { key: "name", label: "Name", type: "text", sort: 10, required: false } as const;

export async function createPageDatabase(spaceId: string | null, activeOrg: string | null, userId: string | null, name = "Untitled database"): Promise<PickedSource> {
  // org-filter: write-target the page's organization; the active one only for a page not saved yet.
  const organizationId = (spaceId ? await pageOrganizationId(spaceId) : null) ?? (await ensureOrgId(null));
  const client = createRecordsClient({
    dataSource: supabaseDataSource(createClient()),
    actor: userId ? { actor: "user", user_id: userId } : { actor: "user" },
    organizationId,
  });
  // A unique address per table: two "Untitled database" tables are two tables.
  const made = await declareTable(client, { name, slug: `${tokenFor(name)}_${Date.now().toString(36)}`, titleField: "name", fields: [NAME_FIELD] });
  if (!made.ok) throw new Error(made.error.message || "The database could not be made.");
  return { tableId: made.data, name };
}

/** The association that makes a table its page's own (Notion: an inline database is part of its page). */
export const PAGE_DATABASE = "page_database";

/**
 * The page owns the table it made: one conveying edge `document → record` (`page_database`, editor max,
 * trash follows the page). Whoever the page is shared with then opens the table and its rows at the
 * page's level (the access ladder's "children inherit their parent"). Only for a table THIS page made —
 * a linked view of a table that lives elsewhere never calls this. Throws with the reason when refused.
 */
export async function adoptPageDatabase(spaceId: string, tableId: string, db: { rpc: (fn: "assoc_link", args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> } = createClient() as never): Promise<void> {
  const { error } = await db.rpc("assoc_link", {
    p_source_type: "document",
    p_source_id: spaceId,
    p_target_type: "record",
    p_target_id: tableId,
    p_role: PAGE_DATABASE,
    p_label: PAGE_DATABASE,
  });
  if (error) throw new Error(`The database was made, but sharing this page won't share it: ${error.message}`);
}

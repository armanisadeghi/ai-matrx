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
  const organizationId = (spaceId ? await pageOrganizationId(spaceId) : null) ?? (await ensureOrgId(activeOrg));
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

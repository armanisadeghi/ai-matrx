// features/spaces/data/entity-row-add.ts — "New" on a built-in module's table: one row added through the
// module's write door. The row is filed in the organization of the PAGE it is added on, read from the page
// record (never whichever organization is active).

import { pageOrganizationId } from "./agency-install";

interface RowWriter {
  entityRowWrite(input: { token: string; record_id: null; organization_id: string; columns: Record<string, unknown> }): Promise<{ ok: boolean; data?: unknown; error?: unknown }>;
}

export async function writeNewEntityRow<C extends RowWriter>(
  client: C,
  p: { token: string; spaceId: string | null; titleColumn: string | null },
): Promise<Awaited<ReturnType<C["entityRowWrite"]>>> {
  const organization_id = p.spaceId ? await pageOrganizationId(p.spaceId) : null;
  if (!organization_id) throw new Error("This page's organization isn't known yet, so a row can't be added.");
  return (await client.entityRowWrite({ token: p.token, record_id: null, organization_id, columns: p.titleColumn ? { [p.titleColumn]: "" } : {} })) as Awaited<ReturnType<C["entityRowWrite"]>>;
}

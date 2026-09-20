// features/unified-data/test-bench/savedViewsPort.ts
//
// THE ORGANIZATION'S SAVED VIEWS, FOR THE RECORD STORE'S NOTIFY EDITOR.
//
// A subscription points at a `platform.saved_view` (DOOR-18), and the record
// store has no door onto that table on purpose — it is the PLATFORM's, not the
// store's. So `@ai-matrx/records-ui` leaves a port, `savedViews`, and a host
// that does not bind it gets a picker that says so.
//
// This app has those views: `platform.saved_view` is the one table every list
// surface here already saves into (`features/crm/saved-views`). There was
// nothing to wait for — the try-everything page printed an instruction to go and
// edit source code where it should simply have bound the port. This is the
// binding.
//
// It is deliberately NOT filtered by `surface_key`: a subscription is "tell me
// when the records in THIS view change", and which list surface a person first
// saved their view on is not the store's business.

import { createClient } from "@/utils/supabase/client";

/** The views this organization has, newest use first, as `{ id, name }`. */
export async function organizationSavedViews(
  organizationId: string,
): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await createClient()
    .schema("platform")
    .from("saved_view")
    .select("id,name")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  // A READ THAT FAILED IS NOT AN EMPTY LIST. The editor's own empty state says
  // "no saved views yet", which would be a lie about a refusal — so this throws
  // and the editor shows the refusal it already knows how to show.
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }));
}

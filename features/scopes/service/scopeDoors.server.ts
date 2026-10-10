// features/scopes/service/scopeDoors.server.ts — the scope doors for a server component.
//
// Same doors as `scopeDoors()` (./scopeDoors), bound to the request's own server supabase client
// (`await createClient()` from @/utils/supabase/server), so the store decides as the signed-in person.

import "server-only";
import { asRecordsDataSource, createRecordsClient } from "@ai-matrx/records/core";
import type { ScopeDoors } from "@ai-matrx/records/scopes";
import { createClient } from "@/utils/supabase/server";

/** The scope doors for this request (one per call: a server client is per request). */
export async function serverScopeDoors(): Promise<ScopeDoors> {
  const supabase = await createClient();
  return createRecordsClient({
    dataSource: asRecordsDataSource(supabase),
    actor: { actor: "user" },
    organizationId: null,
  }).scopes;
}

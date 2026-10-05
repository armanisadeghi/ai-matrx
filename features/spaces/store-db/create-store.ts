// features/spaces/store-db/create-store.ts — the database SpacesStore for the browser.

import { supabase } from "@/utils/supabase/client";
import { SupabaseSpacesStore } from "./supabase-store";

/** The signed-in person's Spaces; new top-level Spaces are filed in `organizationId`. */
export function createDatabaseSpacesStore(organizationId: string): SupabaseSpacesStore {
  return new SupabaseSpacesStore(supabase, organizationId);
}

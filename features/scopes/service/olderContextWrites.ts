// features/scopes/service/olderContextWrites.ts
//
// THE LAST TWO WEB WRITES THAT STILL NAME THE OLD `context` SCHEMA (lane SCOPES-READS-WEB).
//
// Every READ of the scope system moved to the record store's doors (`storeScopeReads.ts`); these two
// are writes and belong to lane SCOPES-OLD-WRITERS (SCOPES-CUTOVER-PLAN L11), which retires them:
//
//   - `provisionScopeDatasetInTheOlderStore` — the older dataset store's `context.provision_scope_dataset`,
//     reached only for an organization whose tables are still born in that older store (a store-born
//     organization provisions through `custom.scope_table_provision`).
//   - `updateContextItemRow` — the direct `context.context_items` UPDATE behind
//     `scopesService.updateContextItem`, which no screen calls (context items are edited through the
//     store's scope doors, `scopeStore.ts`).
//
// They live here, alone, so `pnpm check:old-system-unreachable` can hold this ONE file in its census
// while every other web file is refused the old tables outright.

"use client";

import { supabase } from "@/utils/supabase/client";
import { contextDb } from "@/utils/supabase/contextDb";
import type { Database } from "@/types/database.types";

export function provisionScopeDatasetInTheOlderStore(contextItemId: string, scopeId: string) {
  return contextDb(supabase).rpc("provision_scope_dataset", { p_item_id: contextItemId, p_scope_id: scopeId });
}

export function updateContextItemRow(
  itemId: string,
  patch: Database["context"]["Tables"]["context_items"]["Update"],
) {
  return contextDb(supabase).from("context_items").update(patch).eq("id", itemId).select().single();
}

// features/scopes/service/olderContextWrites.ts
//
// THE LAST WEB WRITE THAT STILL NAMES THE OLD `context` SCHEMA (lanes SCOPES-READS-WEB, SCOPES-OLD-WRITERS).
//
// Every READ of the scope system has a store door (`storeScopeReads.ts`), and every scope WRITE goes through the
// record store's scope doors (`scopeStore.ts`). What is left here is not a scope write but the OLDER DATASET STORE's
// own provisioning door:
//
//   - `provisionScopeDatasetInTheOlderStore` — `context.provision_scope_dataset`, reached only for an organization
//     whose tables are still born in the older store (a store-born organization provisions through
//     `custom.scope_table_provision`). It makes the older dataset and records it in `context.scope_dataset_instances`;
//     its one scope write (the context value that points at the table) goes through `context.write_context_value`,
//     which no client may call. It leaves with the older tables store (scopes writers census S14).
//
// `updateContextItemRow` (a direct `context.context_items` UPDATE) was retired by SCOPES-OLD-WRITERS on 2026-09-29:
// a context field is edited only through `scopeStore.updateContextItem` (`custom.context_item_write`).
//
// It lives here, alone, so `pnpm check:old-system-unreachable` can hold this ONE file in its census while every other
// web file is refused the old tables outright.

"use client";

import { supabase } from "@/utils/supabase/client";
import { contextDb } from "@/utils/supabase/contextDb";

export function provisionScopeDatasetInTheOlderStore(contextItemId: string, scopeId: string) {
  return contextDb(supabase).rpc("provision_scope_dataset", { p_item_id: contextItemId, p_scope_id: scopeId });
}

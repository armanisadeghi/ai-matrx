// features/scopes/service/scopeDoors.ts — THE one host binding of the scope doors (browser).
//
// Scopes are custom data (`@ai-matrx/records/scopes`): a scope type is a Table kept for context, a
// scope a Record of it, a context field a Field, a value its cell. Every scope read and write in this
// app goes through `scopeDoors()` — the records client's `scopes` doors bound to the browser supabase.
// Nothing else in the app calls a `custom.context_*` door (guard: `pnpm check:scopes-data-layer`).
// Server components use `serverScopeDoors()` from `./scopeDoors.server`.

import { asRecordsDataSource, createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import type { ScopeDoors } from "@ai-matrx/records/scopes";
import { supabase } from "@/utils/supabase/client";
import { readFileText } from "@/features/unified-data/recordsFiles";

let client: RecordsClient | null = null;

function recordsClient(): RecordsClient {
  if (!client) {
    client = createRecordsClient({
      dataSource: asRecordsDataSource(supabase),
      actor: { actor: "user" },
      organizationId: null,
    });
  }
  return client;
}

/** The scope doors (memoized): tree, types, scopes, fields, values, and every scope write. */
export function scopeDoors(): ScopeDoors {
  return recordsClient().scopes;
}

/** The records client the scope doors live on — for its non-scope door `scopeTableProvision`. */
export function scopeRecordsClient(): RecordsClient {
  return recordsClient();
}

/** Opens the whole text of a value kept as a file, as the person (hand to `scopeDoors().values`). */
export function readScopeFileText(fileId: string): Promise<string> {
  return readFileText({ fileId });
}

// lib/account/accountPreferencesRow.ts — lane SHELL-DEDUPE
//
// THE ACCOUNT'S PREFERENCES ROW IS READ ONCE PER SHELL BOOT.
//
// `users.user_preferences` (one row per person) was read twice a moment apart: the preferences slice
// asked for `preferences`, and the active-organization load ladder asked for the two organization
// columns. One shared read now selects all three; each caller takes its own columns. Shared while in
// flight and for a few seconds after (`createSharedReads`); a write to the row forgets it.

import { supabase } from "@/utils/supabase/client";
import { createSharedReads } from "@/lib/sharedReads";

export interface AccountPreferencesRow {
  preferences: unknown;
  last_active_organization_id: string | null;
  startup_organization_id: string | null;
}

export interface AccountPreferencesAnswer {
  data: AccountPreferencesRow | null;
  error: { message: string } | null;
}

// The two organization columns are newer than the generated types: narrowed once, here.
interface UntypedUsersSchema {
  from(table: "user_preferences"): {
    select(columns: string): {
      eq(column: "user_id", value: string): { maybeSingle(): PromiseLike<AccountPreferencesAnswer> };
    };
  };
}

const reads = createSharedReads(5_000);
const KEY = "users.user_preferences:row";

export function readAccountPreferencesRow(userId: string): Promise<AccountPreferencesAnswer> {
  return reads.read(
    userId,
    KEY,
    () =>
      (supabase.schema("users") as unknown as UntypedUsersSchema)
        .from("user_preferences")
        .select("preferences, last_active_organization_id, startup_organization_id")
        .eq("user_id", userId)
        .maybeSingle(),
    { isFailure: (answer) => answer.error !== null },
  );
}

/** A write to the row (or a deliberate refresh): the next read asks again. */
export function forgetAccountPreferencesRow(): void {
  reads.forget(KEY);
}

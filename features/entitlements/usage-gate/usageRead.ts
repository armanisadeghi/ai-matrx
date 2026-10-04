// features/entitlements/usage-gate/usageRead.ts
//
// THE one browser read of the usage state: `billing.user_usage_state()` for the
// signed-in caller (the function defaults `p_user` to `auth.uid()`). Guests
// have no browser Supabase session, so this is never called for them — their
// state reaches the client only through server notifications and refusals.
//
// Fails soft to null: a failed read never blocks a call (USAGE-GATE.md rule 4 —
// nothing known means the request is honored).

import { createClient } from "@/utils/supabase/client";
import { parseUsageSnapshot, type UsageSnapshot } from "./usageState";

export async function readUsageSnapshot(): Promise<UsageSnapshot | null> {
  try {
    const { data, error } = await createClient()
      .schema("billing")
      .rpc("user_usage_state");
    if (error) {
      console.warn(
        `[usage-gate] billing.user_usage_state read failed — call proceeds: ${error.message}`,
      );
      return null;
    }
    return parseUsageSnapshot(data);
  } catch (err) {
    console.warn("[usage-gate] billing.user_usage_state read threw — call proceeds", err);
    return null;
  }
}

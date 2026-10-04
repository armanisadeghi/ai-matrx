// features/entitlements/usage-gate/usageReadServer.ts
//
// The landing-time read of `billing.user_usage_state` on the server, run by a
// layout IN PARALLEL with the reads it already makes (USAGE-GATE.md rule 9).
// Fails soft to null — the client then holds `unknown` and the boot effect
// reads it off the request path.

import type { createClient } from "@/utils/supabase/server";
import { parseUsageSnapshot, type UsageSnapshot } from "./usageState";

export async function readUsageSnapshotServer(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<UsageSnapshot | null> {
  try {
    const { data, error } = await supabase
      .schema("billing")
      .rpc("user_usage_state");
    if (error) {
      console.warn(`[usage-gate] landing usage read failed: ${error.message}`);
      return null;
    }
    return parseUsageSnapshot(data);
  } catch (err) {
    console.warn("[usage-gate] landing usage read threw", err);
    return null;
  }
}

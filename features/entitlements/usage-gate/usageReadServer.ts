// features/entitlements/usage-gate/usageReadServer.ts
//
// The landing-time read of `billing.user_usage_state` on the server, run by a
// layout IN PARALLEL with the reads it already makes (USAGE-GATE.md rule 9).
// Fails soft to null — the client then holds `unknown` and the boot effect
// reads it off the request path.

import type { createClient } from "@/utils/supabase/server";
import { parseUsageSnapshot, type UsageSnapshot } from "./usageState";

/**
 * 🚨 This read sits in the (core) layout, so every signed-in document waits on
 * it. Healthy it is ~100 ms; its tail has reached 7.4 s (pg_stat_statements,
 * 2026-10-09). Past this deadline the page paints without it and the client's
 * boot read fills it in — the same path a failed read already takes.
 */
const USAGE_SEED_DEADLINE_MS = 400;

export async function readUsageSnapshotServer(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<UsageSnapshot | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), USAGE_SEED_DEADLINE_MS);
  try {
    const { data, error } = await supabase
      .schema("billing")
      .rpc("user_usage_state")
      .abortSignal(controller.signal);
    if (controller.signal.aborted) {
      console.warn(`[usage-gate] landing usage read passed ${USAGE_SEED_DEADLINE_MS} ms; the client reads it after boot`);
      return null;
    }
    if (error) {
      console.warn(`[usage-gate] landing usage read failed: ${error.message}`);
      return null;
    }
    return parseUsageSnapshot(data);
  } catch (err) {
    console.warn("[usage-gate] landing usage read threw", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

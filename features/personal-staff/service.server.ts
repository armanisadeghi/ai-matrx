import "server-only";

/**
 * features/personal-staff/service.server.ts — what `/staff` can honestly know
 * before first paint.
 *
 * ONE THING: the `personal_staff.front_line` Holder at the SYSTEM rung, plus
 * its name, so the header and the chat shell paint with no flash and no
 * round-trip. `resolveMandateServer`'s own header explains why that is the only
 * rung available here — a Server Component has no active organization, so there
 * is no org or user rung to walk. The browser asks the door
 * (`staff-door.ts`) for the rung that actually runs, and publishes the answer
 * to the header.
 *
 * FAILURE IS LOUD AND NAMELESS. A resolution or name read that fails SCREAMS to
 * the server console and returns null. It never falls back to a hardcoded
 * "Chief of Staff": `door.py` refuses to invent that name on its side precisely
 * because an organization may have rebound the role, and a header that says it
 * anyway is a screen telling a lie.
 *
 * 🚨 AND IT IS BOUNDED. Until 2026-09-21 this function awaited the mandate read
 * with no deadline, and on 2026-09-21 production `/staff` answered **504
 * GATEWAY_TIMEOUT** on six consecutive signed-in loads: the database was in a
 * relation-lock storm, PostgREST answered `PGRST002` and RETRIED, and the retry
 * loop ran past Vercel's 15-second function cap. A read this module's own header
 * calls optional had taken the page down. Both reads below now go through
 * `resolveMandateSeed`'s deadline (or carry its signal), and the page paints
 * whatever happens — with a sentence when the seed is missing.
 */

import { createClient } from "@/utils/supabase/server";
import {
  MANDATE_SEED_DEADLINE_MS,
  resolveMandateSeed,
} from "@/features/mandates/seed.server";
import { PERSONAL_STAFF_MANDATE_KEY } from "./mandate";

export interface StaffSeed {
  /** `agent.definition` id of the system-rung Holder, or null. */
  agentId: string | null;
  /** That Holder's name, or null — which means paint NO name. */
  agentName: string | null;
  /**
   * `null` when the seed is real. Otherwise ONE sentence for the screen, so a
   * page painted without its seed says so instead of looking merely empty.
   * The thread itself still arrives from the door a hop after hydration, so
   * this is a notice and never an error state.
   */
  seedNotice: string | null;
}

export async function resolveStaffSeed(): Promise<StaffSeed> {
  const seed = await resolveMandateSeed(PERSONAL_STAFF_MANDATE_KEY);
  if (!seed.agentId) {
    return { agentId: null, agentName: null, seedNotice: seed.unavailable };
  }
  const agentId = seed.agentId;

  // The name read gets the SAME budget, for the same reason: it is the second
  // half of one optional seed, and an unbounded second read would restore
  // exactly the defect the first one just lost.
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("name")
    .eq("id", agentId)
    .is("deleted_at", null)
    .abortSignal(AbortSignal.timeout(MANDATE_SEED_DEADLINE_MS))
    .maybeSingle();
  if (error) {
    console.error("[/staff] the Holder's name could not be read at SSR:", error);
    return {
      agentId,
      agentName: null,
      seedNotice: null,
    };
  }
  return {
    agentId,
    agentName: (data?.name as string | null) ?? null,
    seedNotice: null,
  };
}

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
 */

import { createClient } from "@/utils/supabase/server";
import { resolveMandateServer } from "@/features/mandates/service.server";
import { PERSONAL_STAFF_MANDATE_KEY } from "./mandate";

export interface StaffSeed {
  /** `agent.definition` id of the system-rung Holder, or null. */
  agentId: string | null;
  /** That Holder's name, or null — which means paint NO name. */
  agentName: string | null;
}

export async function resolveStaffSeed(): Promise<StaffSeed> {
  let agentId: string;
  try {
    agentId = (await resolveMandateServer(PERSONAL_STAFF_MANDATE_KEY)).agentId;
  } catch (error) {
    console.error(
      `[/staff] "${PERSONAL_STAFF_MANDATE_KEY}" did not resolve at SSR — the door's own answer is the one that counts:`,
      error,
    );
    return { agentId: null, agentName: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("name")
    .eq("id", agentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[/staff] the Holder's name could not be read at SSR:", error);
    return { agentId, agentName: null };
  }
  return { agentId, agentName: (data?.name as string | null) ?? null };
}

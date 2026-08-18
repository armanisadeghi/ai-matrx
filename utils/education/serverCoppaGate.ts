// utils/education/serverCoppaGate.ts
//
// THE server-side COPPA verdict for a Next.js API route.
//
// Most AI generation is refused for an unconsented under-13 by aidream's
// `enforce_education_coppa`, which sits in the agent-run funnel. A route that
// mints a credential the BROWSER then uses to talk to a provider directly never
// reaches that funnel — aidream never sees the generation, so it cannot refuse
// it. `/api/voice-agent/token` was exactly that shape: a declared under-13 with
// no guardian could open a live voice model, with neither enforcement layer
// present (found by adversarial review, 2026-08-17).
//
// Any route that hands a client the means to reach a model MUST call this.
//
// It reads the ONE verdict function (`edu_coppa_gate_for`) through the service
// role, so it agrees with the client gate and with aidream by construction.
// FAILS CLOSED: an unreadable verdict for a signed-in user refuses.
//
// It is deliberately NOT education-scoped. COPPA is a fact about the ACCOUNT,
// not about which page the child is on — an unconsented under-13 should not get
// an unsupervised live model anywhere. Adults, teens, verified under-13s and
// anonymous visitors are all allowed, so gating a route costs nothing
// legitimate.

import "server-only";
import { createAdminClient } from "@/utils/supabase/adminClient";

export interface ServerCoppaVerdict {
  aiAllowed: boolean;
  reason: string;
  ageBand: string | null;
}

/** The refusal a route should return. Safe to show the user verbatim. */
export const COPPA_REFUSAL_MESSAGE =
  "A parent or guardian must approve AI features for this account before it can be used. Ask a parent to approve access, then try again.";

/**
 * Resolve one user's COPPA verdict server-side.
 *
 * Returns `aiAllowed: false` when the account may not use AI — including when
 * the verdict cannot be resolved at all. Never returns `true` on an error: a
 * child-safety gate does not fail open.
 */
export async function resolveServerCoppaVerdict(
  userId: string,
): Promise<ServerCoppaVerdict> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("edu_coppa_gate_for", {
      p_user_id: userId,
    });
    if (error || !data || typeof data !== "object") {
      console.error(
        "[coppa] server verdict unresolved; FAILING CLOSED (refusing) — " +
          "a child-safety gate never fails open",
        { userId, error },
      );
      return {
        aiAllowed: false,
        reason: "verdict_unresolved_fail_closed",
        ageBand: null,
      };
    }
    const verdict = data as {
      ai_allowed?: boolean;
      reason?: string;
      age_band?: string | null;
    };
    return {
      aiAllowed: Boolean(verdict.ai_allowed),
      reason: String(verdict.reason ?? "unknown"),
      ageBand: verdict.age_band ?? null,
    };
  } catch (e) {
    console.error(
      "[coppa] server verdict threw; FAILING CLOSED (refusing)",
      { userId, error: e },
    );
    return {
      aiAllowed: false,
      reason: "verdict_threw_fail_closed",
      ageBand: null,
    };
  }
}

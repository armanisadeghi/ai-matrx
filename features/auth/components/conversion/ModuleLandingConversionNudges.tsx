"use client";

import { useEffect } from "react";
import { useUserType } from "@/features/auth/hooks/useUserType";
import { useConversionTracker } from "@/features/auth/hooks/useConversionTracker";
import { InlineConversionCard } from "./InlineConversionCard";
import { ExitIntentSignupModal } from "./ExitIntentSignupModal";

interface ModuleLandingConversionNudgesProps {
  /** Unique id for the surface (e.g. `landing:chat`). */
  surfaceId: string;
  /** Module name woven into nudge copy. */
  moduleName: string;
}

const RETURNING_NUDGE_THRESHOLD = 2;

/**
 * The single orchestration point for guest-facing conversion nudges on a
 * module landing. Mounts:
 *
 *  - A view marker (records this surface visit, persisted across the
 *    session via `useConversionTracker`).
 *  - An inline conversion card, shown after the guest has visited at
 *    least two surfaces — the moment they've signaled real interest.
 *  - An exit-intent modal, fires once per session when the cursor leaves
 *    through the top of the viewport.
 *
 * Authenticated users see none of this — every nudge gates internally on
 * `useUserType`. Returning guests get the inline card eagerly (they
 * already know what they're looking at); first-time guests get a single
 * surface visit of breathing room before the card appears.
 */
export function ModuleLandingConversionNudges({
  surfaceId,
  moduleName,
}: ModuleLandingConversionNudgesProps) {
  const userType = useUserType();
  const { markViewed, hasSeenAtLeast } = useConversionTracker();

  useEffect(() => {
    markViewed(surfaceId);
  }, [markViewed, surfaceId]);

  if (userType === "authenticated") return null;

  const showInlineCard =
    userType === "returning-guest" || hasSeenAtLeast(RETURNING_NUDGE_THRESHOLD);

  return (
    <>
      {showInlineCard && (
        <InlineConversionCard
          heading={
            // A returning GUEST has visited before but has no account: greeting them as a member and
            // promising their work "synced" spoke to someone we have never met (live audit 2026-10-09, G1).
            userType === "returning-guest"
              ? `Back for another look at ${moduleName}?`
              : `Like what you see? Make ${moduleName} yours.`
          }
          description={
            userType === "returning-guest"
              ? "A free account keeps what you make, no card needed."
              : "Sign up free in seconds, no credit card needed."
          }
        />
      )}

      <ExitIntentSignupModal moduleName={moduleName} />
    </>
  );
}

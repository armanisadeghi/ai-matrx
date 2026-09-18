"use client";

// useOrganizationRequired — the missing half of the guard-before-the-call
// pattern, in ONE place.
//
// THE TWO STATES EVERY ORG-SCOPED SURFACE CONFUSES
// ------------------------------------------------
// `appContext.organization_id === null` means two completely different things
// at two different moments:
//
//   1. **Boot has not finished.** The selection is still being resolved
//      (stored choice → stated default → personal org → sole membership).
//      Correct behaviour: wait. Firing an org-scoped transport here is the
//      hydration race every workflow-runtime hook documents — refused on every
//      cold load and never retried.
//   2. **Boot finished and there is still nothing.** The person belongs to no
//      organization, or cleared the selection mid-session. Correct behaviour:
//      say so, with the picker. Waiting here is a spinner that never resolves —
//      a screen that lies (law 4), which is exactly what `/workflows/waiting`
//      showed.
//
// Surfaces that guard with a bare `if (!organizationId) return;` get state 1
// right and state 2 wrong: they sit on a skeleton forever. Surfaces that call
// anyway get state 2 "right" (an error) and state 1 wrong. This hook is the
// single reading of both, derived from `selectShouldPromptForOrganization` —
// the same signal the header's own no-organization cue uses, so a screen and
// the chrome around it can never disagree about whether an organization is
// missing.
//
//   3. **Boot is still resolving.** Not the same as either of the above, and
//      the one a surface silently collapses into whichever of the two it
//      happens to have written first. THREE states, and there is a name for
//      each: `organizationState`.
//   4. **The read FAILED.** (R37, 2026-09-18.) An aborted fetch, a membership
//      read that threw, a `current_personal_org_id()` that answered
//      `TypeError: Failed to fetch` — nobody looked, so nothing at all is known
//      about this person's memberships. Saying "select an organization" here is
//      a claim about memberships we never read: seat-proven on 2026-09-18,
//      where a member of THIRTEEN organizations was told to pick one, disabled,
//      for 24 seconds (V-23 NEW-2). The honest sentence is that we could not
//      check, with Retry, and controls stay in the CHECKING posture — never the
//      refusal. `organizationState: "unavailable"`, `retry()`.
//
// USAGE — prefer the discriminant, because a boolean pair can be read wrong
// and a switch cannot:
//   const { organizationId, organizationState } = useOrganizationRequired();
//   useEffect(() => { if (organizationState !== "ready") return; void load(); },
//             [organizationState, organizationId]);
//   if (organizationState !== "ready")
//     return <OrganizationContextNotice state={organizationState} what="Waiting runs" />;
//   if (loading) return <Skeleton />;
//
// A CONTROL rather than a body gates through
// `useOrganizationGatedControl` (same reading, ready-made `disabled` + `title`)
// so the "checking" beat can never be spelled as the terminal refusal — which
// is exactly what the Tasks import button announced for thirteen seconds
// (VERIFY-R7-FIX-WAVE NEW-1, 2026-09-18).

import { useCallback } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectShouldPromptForOrganization,
} from "@/lib/redux/slices/appContextSlice";
// 🚨 THE GATE READS ITS NEW INPUTS THROUGH PURE LEAVES, NEVER THROUGH MORE
// EXPORTS OF THE APP-CONTEXT SLICE OR MORE HOOKS. Dozens of surfaces render
// through this hook, and dozens of their tests stand the slice and
// `@/lib/redux/hooks` in with the two or three members the gate needed on the
// day they were written. A module mock replaces the module for every importer,
// so one more slice selector here killed seven suites and 25 tests on
// 2026-09-18 — surfaces that had not changed at all. The failure reason comes
// from `lib/organizations/orgBootstrapFailure.ts` (imports nothing) and the
// retry dispatches through `lib/redux/store-singleton.ts` (imports nothing),
// so the next thing this gate learns costs no test in the repo a line.
import { selectOrgBootstrapFailure } from "@/lib/organizations/orgBootstrapFailure";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { retryActiveOrgBootstrap } from "@/lib/redux/thunks/activeOrgBootstrap";

/**
 * The three states, named once. Every org-scoped surface reads THIS, never a
 * hand-rolled pair of booleans over a nullable id — `organization_id === null`
 * cannot tell "checking" from "you belong to nothing", and a surface that
 * cannot tell either shows a terminal refusal during boot or an empty state
 * forever.
 */
export type OrganizationState =
  | "resolving"
  | "required"
  | "ready"
  | "unavailable";

export interface OrganizationRequiredGate {
  /** The explicitly selected organization, or null. */
  organizationId: string | null;
  /** True when an org-scoped transport can be called without being refused. */
  canLoad: boolean;
  /**
   * True ONLY once boot has settled with no selection — the honest, terminal
   * "choose an organization" state. Never true during hydration.
   */
  organizationRequired: boolean;
  /**
   * True while boot is still resolving: neither loadable nor refused yet. Keep
   * showing the skeleton here, and only here.
   *
   * ⚠️ LEGACY PAIR. It is also true in the `unavailable` state, deliberately:
   * this boolean means "not ready, and not refused", and a surface that still
   * reads the pair must keep the CHECKING posture when the read failed rather
   * than fall through to a refusal or to nothing at all. It cannot tell you
   * which of the two it is — read `organizationState` for that, and prefer it
   * everywhere.
   */
  resolving: boolean;
  /**
   * The same reading as the three fields above, as ONE value a `switch` or an
   * equality test cannot get half right. Prefer it in new code.
   */
  organizationState: OrganizationState;
  /**
   * WHY the organization could not be read, when `organizationState` is
   * `"unavailable"` — a short technical reason for logs and support, never the
   * sentence shown to the person (that one lives once, in
   * `ORGANIZATION_UNAVAILABLE_*`). Null in every other state.
   */
  unavailableReason: string | null;
  /**
   * Re-run the organization read. Puts the surfaces back into `resolving` and
   * asks again — the same resolver boot runs, never a second path. Safe to call
   * in any state; it is what every "Try again" on the fourth state calls.
   */
  retry: () => void;
}

/** The headline for the fourth state. One wording, every surface. */
export const ORGANIZATION_UNAVAILABLE_TITLE =
  "We could not check your organization";

/**
 * The sentence for the fourth state. It says what happened, says plainly that
 * this is NOT a request to choose, and names the remedy.
 */
export const ORGANIZATION_UNAVAILABLE_DESCRIPTION =
  "Something went wrong while reading which organization you are working in, " +
  "so nothing was loaded. This does not mean you need to pick one — we simply " +
  "could not check. Try again, and if it keeps happening, reload the page.";

export function useOrganizationRequired(): OrganizationRequiredGate {
  const organizationId = useAppSelector(selectOrganizationId);
  const organizationRequired = useAppSelector(selectShouldPromptForOrganization);
  // Non-null ONLY when the read failed. `selectShouldPromptForOrganization`
  // already refuses to nudge in that case, so the two can never both be true.
  const unavailableReason = useAppSelector(selectOrgBootstrapFailure);
  const canLoad = organizationId != null;
  const unavailable = !canLoad && unavailableReason != null;
  // The legacy pair keeps the checking posture through `unavailable` — see the
  // field's note. `organizationState` is the reading that distinguishes them.
  const resolving = !canLoad && !organizationRequired;

  const retry = useCallback(() => {
    const store = getStoreSingleton();
    if (!store) {
      // Nothing to retry through. Say so — a button that silently does nothing
      // is the same lie in a smaller frame (law 4).
      console.error(
        "[useOrganizationRequired] retry: no Redux store yet — the organization read cannot be re-run.",
      );
      return;
    }
    void store.dispatch(retryActiveOrgBootstrap());
  }, []);

  const organizationState: OrganizationState = canLoad
    ? "ready"
    : unavailable
      ? "unavailable"
      : organizationRequired
        ? "required"
        : "resolving";

  return {
    organizationId,
    canLoad,
    organizationRequired,
    resolving,
    organizationState,
    unavailableReason: unavailable ? unavailableReason : null,
    retry,
  };
}

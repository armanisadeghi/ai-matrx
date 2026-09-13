"use client";

// features/organizations/awaitWorkspace.ts
//
// WAIT FOR THE WORKSPACE — never tell somebody to press the button again.
//
// THE DEFECT THIS CLOSES (Expert Book Challenge wall W39, 2026-09-12)
// ------------------------------------------------------------------
// On the guided start (`/masterwork/new`) the Expert pressed Start and got a
// red toast: "Your workspace is still loading — try again in a moment." It
// kept saying that for more than half a minute on a warm page, and only a
// reload cured it. The Rulebook before it had gone through on the same page
// ten minutes earlier.
//
// The cause is not a slow bootstrap. It is a screen that ACTS on a value it
// never waited for. `organization_id === null` means two different things
// (`useOrganizationRequired` documents both): boot has not finished, or boot
// finished with nothing selected. A press handler that reads the value once
// and bails gets the first case wrong — the answer was milliseconds away and
// it refused — and the SECOND case catastrophically wrong: it says "still
// loading" about something that will never arrive, which is a screen that
// lies (law 4) and a retry loop with no exit.
//
// THE CLASS FIX
// -------------
// An action that needs the workspace WAITS for it, with the platform's own
// bounded answer (`waitForOrganizationAdmission`), and the surface shows an
// honest inline state while it does. When the wait settles with nothing, the
// person is told the truth and given the remedy — never "try again".
//
// This is a PLATFORM primitive. Any action handler that today reads an
// organization id and bails should call this instead.

import {
  waitForOrganizationAdmission,
  type OrganizationAdmission,
} from "@/lib/api/organization-admission";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";

export type WorkspaceResolution =
  | { status: "ready"; organizationId: string }
  /**
   * Boot finished and there is no workspace to act in. `reason` is the plain
   * sentence to put ON the surface — it names the remedy and never says
   * "try again in a moment", because trying again changes nothing.
   */
  | { status: "unavailable"; reason: string };

/**
 * How long an ACTION waits. `waitForOrganizationAdmission` bounds itself at 8
 * seconds, which is right for a background transport and far too long for a
 * person watching a button. The wait that actually matters is the rehydrate
 * plus cookie restore, which lands in milliseconds; past this cap the honest
 * answer is that the workspace is not coming without help.
 */
const ACTION_WAIT_MS = 4_000;

const NO_WORKSPACE =
  "We could not tell which workspace to file this in. Pick one from the menu under your avatar, then press the button again — nothing was created.";

/** The effective workspace right now, without waiting. Null when there is none. */
export function peekEffectiveOrganizationId(): string | null {
  const state = getStoreSingleton()?.getState();
  return state ? (selectEffectiveOrganizationId(state as never) ?? null) : null;
}

/**
 * The workspace this action will file its work in — waiting, bounded, for a
 * bootstrap still in flight, and answering honestly when there is none.
 *
 * Reads the EFFECTIVE workspace (explicit selection, else the personal one),
 * because that is what the surfaces this replaces were already writing with;
 * `waitForOrganizationAdmission` only watches the explicit selection, so the
 * effective value is re-read after it settles — a personal workspace that
 * lands during the same bootstrap is a perfectly good answer.
 */
export async function awaitEffectiveOrganizationId(): Promise<WorkspaceResolution> {
  const immediate = peekEffectiveOrganizationId();
  if (immediate) return { status: "ready", organizationId: immediate };

  await Promise.race([
    waitForOrganizationAdmission(),
    new Promise<OrganizationAdmission>((resolve) =>
      setTimeout(() => resolve("timed-out"), ACTION_WAIT_MS),
    ),
  ]);

  const settled = peekEffectiveOrganizationId();
  if (settled) return { status: "ready", organizationId: settled };
  return { status: "unavailable", reason: NO_WORKSPACE };
}

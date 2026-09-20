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
//
// 🚨 WHAT IT WAITS FOR IS THE *SELECTED* ORGANIZATION (2026-09-17)
// ----------------------------------------------------------------
// This used to settle on `selectEffectiveOrganizationId` — `organization_id ??
// personal_organization_id` — so a wait that timed out with nothing selected
// still answered "ready" with the user's PERSONAL workspace, and the action
// filed its work there with nothing on screen saying so. That is exactly the
// silent tenant substitution `context-is-carried-never-rebuilt` forbids: the
// organization an action writes in is the one the user selected, or the action
// refuses. Now the wait watches ONLY the explicit selection, and settling with
// nothing returns `unavailable` with the remedy. The exported names still say
// "effective" because two consumers outside this feature import them by that
// name; the rename is a follow-up, not a behaviour change.

import {
  waitForOrganizationAdmission,
  type OrganizationAdmission,
} from "@/lib/api/organization-admission";
import { knobInt } from "@/lib/knobs/featureKnobs";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
// The fourth state's reader is a pure leaf on purpose — see its header. Reading
// it from the slice would break every surface test that stands the slice in.
import { selectOrgBootstrapFailure } from "@/lib/organizations/orgBootstrapFailure";

export type WorkspaceResolution =
  | { status: "ready"; organizationId: string }
  /**
   * Boot finished and there is no workspace to act in. `reason` is the plain
   * sentence to put ON the surface — it names the remedy and never says
   * "try again in a moment", because trying again changes nothing.
   *
   * 🚨 `cause` SEPARATES THE TWO WAYS THAT HAPPENS (R37, 2026-09-18).
   * `"no-selection"` is an answer: the memberships were read and none is
   * selected, so the remedy is the picker and trying again is pointless.
   * `"unreadable"` is the absence of one: the read failed, so the remedy IS to
   * try again and the sentence must not tell anybody to choose an organization
   * — nobody looked at what they have. A write path that collapses the two
   * says "pick one" to a person in thirteen organizations (V-23 NEW-2).
   */
  | {
      status: "unavailable";
      reason: string;
      cause: "no-selection" | "unreadable";
    };

/**
 * How long an ACTION waits — the `organizations.workspace action_wait_ms` knob.
 * `waitForOrganizationAdmission` bounds itself at 8 seconds, which is right
 * for a background transport and far too long for a person watching a button.
 * The wait that actually matters is the rehydrate plus cookie restore, which
 * lands in milliseconds; past this cap the honest answer is that the workspace
 * is not coming without help.
 */
const WORKSPACE_KNOB_FEATURE = "organizations.workspace";

const NO_WORKSPACE =
  "We could not tell which workspace to file this in. Pick one from the menu under your avatar, then press the button again — nothing was created.";

/**
 * The same refusal when the organization could not be READ. It never tells the
 * person to pick one, because we do not know that they need to.
 */
const WORKSPACE_UNREADABLE =
  "We could not check which organization to file this in, so nothing was created. Try the button again in a moment; if it keeps failing, reload the page.";

/**
 * The SELECTED organization right now, without waiting. Null when the user has
 * not chosen one — never the personal workspace standing in for it.
 */
export function peekEffectiveOrganizationId(): string | null {
  const state = getStoreSingleton()?.getState();
  return state ? (selectOrganizationId(state as never) ?? null) : null;
}

/**
 * The recorded reason the organization could not be READ, or null. Non-null is
 * the fourth state — see `useOrganizationRequired`.
 */
function peekOrganizationUnreadableReason(): string | null {
  const state = getStoreSingleton()?.getState();
  return state ? selectOrgBootstrapFailure(state) : null;
}

/**
 * The workspace this action will file its work in — waiting, bounded, for a
 * bootstrap still in flight, and answering honestly when there is none.
 *
 * Reads the EXPLICITLY SELECTED organization only. A bootstrap that lands a
 * selection during the wait is a perfectly good answer; a bootstrap that ends
 * with nothing selected is `unavailable`, never the personal workspace
 * substituted for the one the user meant.
 */
export async function awaitEffectiveOrganizationId(): Promise<WorkspaceResolution> {
  const immediate = peekEffectiveOrganizationId();
  if (immediate) return { status: "ready", organizationId: immediate };

  const actionWaitMs = await knobInt(WORKSPACE_KNOB_FEATURE, "action_wait_ms");
  await Promise.race([
    waitForOrganizationAdmission(),
    new Promise<OrganizationAdmission>((resolve) =>
      setTimeout(() => resolve("timed-out"), actionWaitMs),
    ),
  ]);

  const settled = peekEffectiveOrganizationId();
  if (settled) return { status: "ready", organizationId: settled };
  if (peekOrganizationUnreadableReason()) {
    return {
      status: "unavailable",
      reason: WORKSPACE_UNREADABLE,
      cause: "unreadable",
    };
  }
  return { status: "unavailable", reason: NO_WORKSPACE, cause: "no-selection" };
}

/**
 * The same sentence, for a READ rather than a write. "Nothing was created" is
 * true of a press and meaningless about a record somebody opened, and the
 * remedy is the same picker.
 */
const NO_WORKSPACE_FOR_READ =
  "No organization is selected, so there was nothing to read this record from. Pick the one you are working in from the menu under your avatar and it will load.";

/**
 * 🚨 THE ORGANIZATION QUESTION IS ASKED BEFORE THE RECORD READ, NOT AFTER IT
 * (VERIFY-R7-FIX-WAVE NEW-2, seat-proven 2026-09-18).
 *
 * From the seat, a cold load of `/detail/google_document/<id>` issued
 *
 *   +4231ms  GET …/google_document?select=*&id=eq.…
 *   +4610ms  POST …/rpc/current_personal_org_id      ← the organization question
 *
 * — the read went out with no organization on the wire and none in the store,
 * and the screen then blamed Google: "it may have been moved, deleted, or isn't
 * shared with you." Three explanations, and the true one — "you have not
 * chosen an organization yet" — was not among them. Meanwhile the in-place
 * opener for the very same record (`features/google-workspace/documents/
 * openRecord.tsx`) was organization-honest: two doors to one record, one honest.
 *
 * So a record read waits for the answer the boot path is already fetching
 * (bounded, no second request) and, when it settles with nothing selected,
 * refuses in the person's own words with the remedy — never a claim about the
 * record.
 */
export async function awaitOrganizationForRecordRead(): Promise<WorkspaceResolution> {
  const resolved = await awaitEffectiveOrganizationId();
  if (resolved.status === "ready") return resolved;
  // An unreadable organization keeps its own sentence here too: the record is
  // not the subject, and neither is the picker.
  if (resolved.cause === "unreadable") return resolved;
  return {
    status: "unavailable",
    reason: NO_WORKSPACE_FOR_READ,
    cause: "no-selection",
  };
}

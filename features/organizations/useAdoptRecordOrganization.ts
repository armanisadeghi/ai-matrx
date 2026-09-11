"use client";

// features/organizations/useAdoptRecordOrganization.ts
//
// THE RECORD ALREADY SAYS WHICH WORKSPACE IT BELONGS TO.
//
// Every org-scoped request in this app fails closed when no organization is
// selected: `requireSelectedOrgId()` throws "Select an organization before
// sending this request." (lib/organizations/activeOrg.ts) and the person gets a
// red toast telling them to go somewhere else and start over. That refusal is
// CORRECT when nobody can answer the question — and wrong when the durable
// record on screen answers it already.
//
// Found live 2026-09-10 (Expert Book Challenge, wall W3): after a reload of a
// Rulebook page, every action died with that toast. The Rulebook row carries
// `organization_id`. Nothing on the page adopted it, and the active-org picker
// lives behind a switch in the avatar menu a first-time Expert has never seen.
//
// This is NOT the "guess an organization" fallback the organization gate
// (lib/organization/organization-gate.ts) exists to forbid. That ban is about
// INVENTING scope — falling back to the personal workspace, "the first one",
// "the last used". Here nothing is invented: the record being worked on
// declares its own organization, which is exactly the case appContextSlice
// already sanctions — "outbound compute refuses ... until an organization is
// selected OR EXPLICITLY SUPPLIED FROM THE DURABLE ENTITY BEING ACTED ON".
//
// The rules this hook keeps:
//   * It only ever acts when NOTHING is selected. A workspace the person
//     actively chose is never overwritten by a record they opened.
//   * It asks `waitForOrganizationAdmission()` first — the platform's own
//     BOUNDED answer to "is a workspace in force yet?" — so it can never beat
//     a restore that is still in flight, and it still answers on the cold
//     navigation where that restore times out.
//   * It proves the organization is READABLE by this user before adopting it.
//     An unreadable row means they are not a member; adopting it would trade a
//     clear "pick a workspace" for a stream of server refusals.
//   * IT ANNOUNCES ITSELF (law 4). A silent context switch is exactly the
//     class of invisible intervention that produced the 2026-08-30 incident.
//     The toast names the workspace, says why, and names the remedy.
//
// It is a PLATFORM primitive, not a Masterwork one: any route that loads one
// durable record carrying `organization_id` and then fires org-scoped requests
// from it should call this.

import { useEffect, useState } from "react";

import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { chooseActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";
import {
  waitForOrganizationAdmission,
  type OrganizationAdmission,
} from "@/lib/api/organization-admission";
import { getOrganization } from "./service";

/**
 * How long a surface waits for a workspace to appear on its own before it
 * adopts the record's.
 *
 * `waitForOrganizationAdmission()` bounds itself at 8 seconds, which is the
 * right budget for a BACKGROUND transport and far too long for a person
 * staring at a page that will not act. The wait that matters here is only the
 * warm-cache rehydrate + cookie restore, which lands in milliseconds; the rest
 * of that 8 seconds is the cold remote reconcile, and the record on screen has
 * already answered the question that reconcile would answer. Admission still
 * wins the race whenever it settles first — this only caps the wait.
 */
const ADOPTION_WAIT_MS = 1_500;

export type RecordOrganizationStatus =
  /** Still deciding — the caller must not fire org-scoped requests yet. */
  | "resolving"
  /** An organization is in force for this surface (selected, or adopted). */
  | "ready"
  /**
   * No organization, and this hook could not supply one: the record named none,
   * or the one it named is not readable by this user. The caller behaves
   * exactly as it did before — fail closed, and the picker is the remedy.
   */
  | "unavailable";

export interface AdoptRecordOrganizationResult {
  status: RecordOrganizationStatus;
  /** True when the organization in force came from the record, not the picker. */
  adopted: boolean;
}

/**
 * Adopt `organizationId` as the active organization for this surface when the
 * person has none selected.
 *
 * @param organizationId the record's own `organization_id` (null/undefined
 *        while the record is still loading — the hook stays "resolving").
 * @param recordLabel what the record is called in a sentence a person reads:
 *        "Rulebook", "workflow", "project".
 */
export function useAdoptRecordOrganization(
  organizationId: string | null | undefined,
  recordLabel: string,
): AdoptRecordOrganizationResult {
  const dispatch = useAppDispatch();
  const selectedOrganizationId = useAppSelector(selectOrganizationId);
  const [outcome, setOutcome] = useState<"pending" | "adopted" | "refused">(
    "pending",
  );

  useEffect(() => {
    if (!organizationId) return;
    if (outcome !== "pending") return;

    let cancelled = false;
    void (async () => {
      // THE PLATFORM'S OWN BOUNDED ANSWER to "is a workspace in force yet?".
      // It resolves "ready" the instant one is selected (so a restore in
      // flight is never beaten), and "unresolved" / "timed-out" /
      // "unavailable" when there authoritatively is not one — including the
      // cold-navigation timeout that used to leave this surface dead.
      const admission = await Promise.race([
        waitForOrganizationAdmission(),
        new Promise<OrganizationAdmission>((resolve) =>
          setTimeout(() => resolve("timed-out"), ADOPTION_WAIT_MS),
        ),
      ]);
      if (cancelled) return;
      if (admission === "ready") return;

      // Membership proof: `iam.organizations` is RLS-scoped to members, so an
      // unreadable row IS the answer "this is not your workspace".
      const organization = await getOrganization(organizationId);
      if (cancelled) return;
      if (!organization) {
        setOutcome("refused");
        return;
      }
      setOutcome("adopted");
      dispatch(
        chooseActiveOrganization({
          id: organization.id,
          name: organization.name,
        }),
      );
      toast.info(`Working in ${organization.name}`, {
        description: `That is the workspace this ${recordLabel} belongs to. Switch workspaces any time from your profile menu.`,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [dispatch, organizationId, outcome, recordLabel]);

  if (selectedOrganizationId) {
    return { status: "ready", adopted: outcome === "adopted" };
  }
  if (outcome === "refused" || !organizationId) {
    return { status: "unavailable", adopted: false };
  }
  return { status: "resolving", adopted: false };
}

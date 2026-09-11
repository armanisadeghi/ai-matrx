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
//   * It waits for the active-org bootstrap to finish, so it cannot race the
//     restore of a real selection.
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
import {
  selectOrganizationId,
  selectOrgBootstrapResolved,
} from "@/lib/redux/slices/appContextSlice";
import { chooseActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";
import { getOrganization } from "./service";

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
  /** True while this hook is the reason there is an organization. */
  adopted: boolean;
}

/**
 * Adopt `organizationId` as the active organization for this surface when the
 * person has none selected.
 *
 * @param organizationId the record's own `organization_id` (null while the
 *        record is still loading — the hook simply stays "resolving").
 * @param recordLabel what the record is called in a sentence a person reads,
 *        lowercase and singular: "Rulebook", "workflow", "project".
 */
export function useAdoptRecordOrganization(
  organizationId: string | null | undefined,
  recordLabel: string,
): AdoptRecordOrganizationResult {
  const dispatch = useAppDispatch();
  const selectedOrganizationId = useAppSelector(selectOrganizationId);
  const bootstrapResolved = useAppSelector(selectOrgBootstrapResolved);
  const [outcome, setOutcome] = useState<"pending" | "adopted" | "refused">(
    "pending",
  );

  useEffect(() => {
    // Somebody already answered the question — never overwrite a real choice.
    if (selectedOrganizationId) return;
    // The restore of a previous selection is still in flight; adopting now
    // could beat it and silently replace the workspace the person chose.
    if (!bootstrapResolved) return;
    if (!organizationId) return;
    if (outcome !== "pending") return;

    let cancelled = false;
    void (async () => {
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
  }, [
    bootstrapResolved,
    dispatch,
    organizationId,
    outcome,
    recordLabel,
    selectedOrganizationId,
  ]);

  if (selectedOrganizationId) {
    return { status: "ready", adopted: outcome === "adopted" };
  }
  if (outcome === "refused") return { status: "unavailable", adopted: false };
  if (!bootstrapResolved || organizationId) {
    return { status: "resolving", adopted: false };
  }
  return { status: "unavailable", adopted: false };
}

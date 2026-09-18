"use client";

// useOrganizationGatedControl — the three states for a CONTROL, so a surface
// cannot spell the waiting beat as the refusal.
//
// THE DEFECT THIS CLOSES (VERIFY-R7-FIX-WAVE NEW-1, seat-proven 2026-09-18)
// ------------------------------------------------------------------------
// The Tasks header's "Import from Google Tasks" button read the bare
// `selectOrganizationId` and derived both its `disabled` and its tooltip from
// that one nullable value:
//
//   @4048ms  disabled title="Select an organization before importing Google Tasks."
//   +9571ms  GET /rest/v1/organizations?…            ← memberships only NOW
//   @17395ms disabled title="Select an organization before importing Google Tasks."
//   @20601ms disabled=null title=null                ← the org was always there
//
// The person had an organization the whole time. `null` means two things
// (`useOrganizationRequired` names all three states) and a control that reads
// the id can tell them apart never — so it told a factual lie for thirteen
// seconds, with a remedy the person did not need, in the very file the previous
// round closed the same class in.
//
// THE CLASS FIX. A control that needs an organization does not write this
// logic. It asks for the gate, by the act it performs, and renders what it is
// handed:
//
//   const org = useOrganizationGatedControl("importing Google Tasks");
//   <Button disabled={org.disabled} title={org.title}
//           onClick={() => { if (!org.organizationId) return;
//                            open({ organizationId: org.organizationId }); }} />
//
//   resolving → disabled, "Checking which organization you are working in…"
//   required  → disabled, "Select an organization before <act>."
//   ready     → enabled, no title
//
// The refusal sentence is built by the ONE builder every other refusal in the
// repo uses (`organizationRefusalMessage` is its toast twin), so the wording
// can never drift per surface and `check:org-refusal-honesty` keeps reading it.
//
// A BODY rather than a control renders `OrganizationContextNotice` instead; a
// CLICK HANDLER that must wait rather than refuse uses
// `awaitEffectiveOrganizationId` (features/organizations/awaitWorkspace.ts).
//
// Law: common-docs/policies/context-is-carried-never-rebuilt.md.

import {
  useOrganizationRequired,
  type OrganizationState,
} from "@/features/organizations/useOrganizationRequired";

/** What the control shows while boot has not answered yet. Never a refusal. */
export const ORGANIZATION_RESOLVING_TITLE =
  "Checking which organization you are working in…";

/**
 * The refusal sentence for a control, from the act it performs. `act` is a
 * gerund phrase naming the act — "importing Google Tasks", "creating a note" —
 * so the sentence reads as an instruction with a remedy, never as a wire error.
 */
export function organizationControlRefusal(act: string): string {
  return `Select an organization before ${act}.`;
}

export interface OrganizationGatedControl {
  /** The selected organization, or null while resolving / with none. */
  organizationId: string | null;
  organizationState: OrganizationState;
  /** True in BOTH non-ready states — a control never acts on a guess. */
  disabled: boolean;
  /** The `title` to render: the checking beat, the refusal, or nothing. */
  title: string | undefined;
}

export function useOrganizationGatedControl(act: string): OrganizationGatedControl {
  const { organizationId, organizationState } = useOrganizationRequired();
  return {
    organizationId,
    organizationState,
    disabled: organizationState !== "ready",
    title:
      organizationState === "ready"
        ? undefined
        : organizationState === "resolving"
          ? ORGANIZATION_RESOLVING_TITLE
          : organizationControlRefusal(act),
  };
}

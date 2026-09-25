// features/bindings/access-target.ts
//
// WHEN THIS ANSWER IS NOT THE VIEWER'S TO WRITE — the one place the binding
// editor decides it, as a pure function.
//
// Owner ruling (Arman, 2026-09-25): a control the viewer cannot use is ABSENT,
// and where they would plausibly want to act they get one way to ask
// (`RequestAccess`). The binding editor has exactly two PERMISSION refusals:
//
//   · the org rung, for someone who is not an owner/admin of that org
//     → ask that organization's admins;
//   · the mandate's own default (the bottom rung), when
//     `defaultHolderRungOffer()` did not offer it → ask its home: the platform
//     team for a system-homed mandate, the home organization's admins otherwise.
//
// Every other Save refusal (pick a holder, fix the map, …) is something the
// viewer CAN fix, so it stays a sentence and the Save stays.

import type { RequestAccessTarget } from "@/features/access-gate/service/requestAccess";
import type { DefaultHolderRungOffer } from "./default-holder-rung";

export interface BindingAccessInput {
  rung: string;
  /** Writing the mandate's own default (bottom rung or the system host). */
  writingDefinitionDefault: boolean;
  /** The org the org rung is for. */
  organizationId: string | null;
  organizationName: string | null;
  canBindThisOrg: boolean;
  defaultHolderOffer: Pick<DefaultHolderRungOffer, "offered" | "systemHomed">;
  homeOrganizationId: string | null;
  homeOrganizationName: string | null;
  mandate: { id: string; mandate_key: string; label?: string | null };
}

export function bindingAccessTarget(
  input: BindingAccessInput,
): RequestAccessTarget | null {
  const resource = {
    kind: "Mandate",
    name: input.mandate.label?.trim() || input.mandate.mandate_key,
    type: "mandate",
    id: input.mandate.id,
  };
  const orgMandateHref = (orgId: string) =>
    `/organizations/${encodeURIComponent(orgId)}/settings/mandates/${encodeURIComponent(input.mandate.mandate_key)}`;

  if (input.writingDefinitionDefault) {
    if (input.defaultHolderOffer.offered) return null;
    // An unread home is not a permission answer — never guess who decides.
    if (!input.homeOrganizationId) return null;
    const action = "Set the default Mandate Holder";
    if (input.defaultHolderOffer.systemHomed) {
      return { action, resource, owner: "system" };
    }
    return {
      action,
      resource,
      owner: {
        organizationId: input.homeOrganizationId,
        organizationName: input.homeOrganizationName,
      },
      manageHref: orgMandateHref(input.homeOrganizationId),
    };
  }

  if (input.rung === "org" && input.organizationId && !input.canBindThisOrg) {
    return {
      action: "Set the Mandate Holder for everyone",
      resource,
      owner: {
        organizationId: input.organizationId,
        organizationName: input.organizationName,
      },
      manageHref: orgMandateHref(input.organizationId),
    };
  }
  return null;
}

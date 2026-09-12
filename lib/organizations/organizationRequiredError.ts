// lib/organizations/organizationRequiredError.ts
//
// The ONE recogniser for "this failed because no organization is selected".
//
// Every Matrx transport fails CLOSED when the user has not selected an
// organization — `requireOrganizationContext` in the package kernel and
// `requireSelectedOrgId` in `lib/organizations/activeOrg.ts` both throw
// `OrganizationContextError("organization_context_required", …)`. That is the
// right behaviour on the wire and the WRONG thing to put on a screen: its
// message ("Select an organization before sending this request.") is an
// instruction to a programmer, with no remedy and no way to choose.
//
// Law 4 — a screen is absent or honest, never lying or dead. So every surface
// that renders a caught error asks this function first, and when it says yes it
// renders `OrganizationRequiredNotice` (features/organizations/components)
// instead of the raw string: what happened, why, and the picker right there.

import { OrganizationContextError } from "@ai-matrx/agents/matrx";

/**
 * True when `err` is the fail-closed "no organization selected" refusal —
 * from the package transport kernel or from `requireSelectedOrgId`.
 *
 * Matches by the error CLASS and code. It deliberately does NOT string-match
 * the message: a message match would silently rot the day the copy changes,
 * and both throw sites now raise the same typed error.
 */
export function isOrganizationRequiredError(err: unknown): boolean {
  return (
    err instanceof OrganizationContextError &&
    err.code === "organization_context_required"
  );
}

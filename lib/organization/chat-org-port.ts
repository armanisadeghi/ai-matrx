// lib/organization/chat-org-port.ts
//
// This app's organization gate, as @ai-matrx/chat's org port `require` (PACKAGE-INDEPENDENCE.md
// P7). The package asks through `org.require(reason, options)`; this maps the ask onto the ONE
// gate the rest of the app uses — never a second one:
//   - a WRITE (no options) → `ensureOrgId(null)`: joins the boot path's own answer, then asks only
//     right after the person acted (a debounced autosave refuses instead of raising a picker);
//   - an explicit ask → `ensureOrganizationContext` with the caller's `interactive` and the
//     memberships a refusal already carried.
// Never picks an organization for the person. Used by the chat host adapter and by the gate's
// test harness, so tests drive exactly the path the app runs.

import type { ChatOrgRequireOptions } from "@ai-matrx/chat/host";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import type { OrganizationRequiredWireMembership } from "@/lib/organizations/organizationRequiredError";
import { ensureOrganizationContext } from "./organization-gate";

export function requireOrganizationForChat(
  _reason: string,
  options?: ChatOrgRequireOptions,
): Promise<string> {
  if (options?.interactive === undefined && !options?.prefetched) return ensureOrgId(null);
  return ensureOrganizationContext({
    interactive: options.interactive ?? true,
    prefetchedOrganizations:
      (options.prefetched as OrganizationRequiredWireMembership[] | null | undefined) ?? null,
  });
}

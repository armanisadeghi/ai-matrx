/**
 * The CRM's URL doors.
 *
 * THE DOOR LAW says a surface that names a person the CRM should hold must let
 * the user get them in there — and landing them on the bare `/crm` index is a
 * door onto a list, not onto the thing they were told to add. It makes the user
 * re-type a name the sending surface already had on screen.
 *
 * So `/crm?create=person&name=<name>` opens the canonical create window
 * (`PartyCreateForm`, via `crmCreatePartyWindow`) with the name already filled.
 * The params are consumed and stripped by `CrmListPage` on arrival, so a
 * reload or a back-button press does not re-open the window.
 *
 * This is the ONE builder for that link — never hand-assemble the query string.
 */

import type { PartyKind } from "@/features/crm/types";

export const CRM_HREF = "/crm";

/** The query keys `CrmListPage` reads on the route mount. */
export const CRM_CREATE_PARAM = "create";
export const CRM_CREATE_NAME_PARAM = "name";

/**
 * A door onto "add this person/company to the CRM", carrying what the calling
 * surface already knows. With no name it is simply the create window, opened
 * empty — still better than an index the user has to hunt through.
 */
export function crmCreatePartyHref(options: {
  kind: PartyKind;
  name?: string | null;
}): string {
  const params = new URLSearchParams({ [CRM_CREATE_PARAM]: options.kind });
  const name = options.name?.trim();
  if (name) params.set(CRM_CREATE_NAME_PARAM, name);
  return `${CRM_HREF}?${params.toString()}`;
}

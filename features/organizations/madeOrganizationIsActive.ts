// features/organizations/madeOrganizationIsActive.ts
//
// AN ORGANIZATION A PERSON MAKES IS THE ONE SHE WORKS IN (G5 a, lane MAKE-HOME, 2026-10-02).
//
// Making an organization is the person's own explicit choice, so the act that creates it also makes
// it active — the way Notion, Slack and Linear put you in the workspace you just made. This is not a
// default chosen for her (the no-default-organization law forbids only an organization picked FOR a
// person from a cookie, a preference or signup). Every client call of `org_create` calls this; guard:
// features/organizations/__tests__/an-organization-you-make-is-the-one-you-work-in.test.ts.
//
// It dispatches the slice's own `setOrganization` (what `chooseActiveOrganization` dispatches)
// through the store singleton, so the organization service needs no import of the bootstrap thunk
// (which imports the service back).

import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { setOrganization } from "@/lib/redux/slices/appContextSlice";
import { memberOrganizationsInvalidated } from "@/features/agent-context/redux/organizationsSlice";
import { writeLastActiveOrganization } from "@/lib/organizations/accountOrganizationChoices";

export function makeCreatedOrganizationActive(org: { id: string; name?: string | null }): void {
  const store = getStoreSingleton();
  if (!store) {
    // Nothing fails silently: outside a booted app there is no active organization to set.
    console.error("[organizations] made an organization but no store is booted to make it active:", org.id);
    return;
  }
  store.dispatch(setOrganization({ id: org.id, name: org.name ?? null }));
  // A switch like any other: the next load opens to it.
  void writeLastActiveOrganization(org.id).catch((err: unknown) =>
    console.error("[organizations] saving the made organization as last active failed", err),
  );
  // Her organization lists (kept per tab, `useUserOrganizations`) now include it.
  store.dispatch(memberOrganizationsInvalidated());
}

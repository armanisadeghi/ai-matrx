// lib/organizations/retryActiveOrganization.ts
//
// "Try again" for the honest states that still exist when the active
// organization is missing: the membership read failed, or the person belongs to
// no organization yet. It re-runs the ONE load ladder (never a second path) and
// never prompts or picks.

import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { retryActiveOrgBootstrap } from "@/lib/redux/thunks/activeOrgBootstrap";

export function retryActiveOrganization(): void {
  const store = getStoreSingleton();
  if (!store) {
    console.error("[retryActiveOrganization] no Redux store yet — the organization read cannot be re-run.");
    return;
  }
  void store.dispatch(retryActiveOrgBootstrap());
}

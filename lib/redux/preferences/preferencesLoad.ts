/**
 * Retry the load of the person's saved preferences — the SAME load the sync
 * engine runs at cold boot (`invokeRemoteFetch` over `userPreferencesPolicy`),
 * so a retry reports through the same `sync/remoteFetchStatus` outcomes and
 * the slice's `_meta.loadStatus` / `_meta.error` move exactly as at boot.
 *
 * Never rejects: `invokeRemoteFetch` turns every failure into the `failed`
 * load status, which the settings gate renders with the menu and a retry.
 */
import { invokeRemoteFetch } from "@/lib/sync/engine/remoteFetch";
import type { AppStore } from "@/lib/redux/store";
import { userPreferencesPolicy } from "./userPreferencesSlice";

export function retryPreferencesLoad(store: AppStore): Promise<void> {
  return invokeRemoteFetch({
    policy: userPreferencesPolicy,
    store,
    getIdentity: () => store._sync.getIdentity(),
    reason: "manual",
  });
}

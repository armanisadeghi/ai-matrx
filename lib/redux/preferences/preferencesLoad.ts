/**
 * Retry the load of the person's saved preferences — the SAME load the sync
 * engine runs at cold boot (`invokeRemoteFetch` over `userPreferencesPolicy`),
 * so a retry reports through the same `sync/remoteFetchStatus` outcomes and
 * the slice's `_meta.loadStatus` / `_meta.error` move exactly as at boot. A
 * retry that succeeds replays any edits held meanwhile on the loaded record
 * and saves them (see `persistAfterLoad` on the policy).
 *
 * Never rejects, and never leaves the status "loading": `invokeRemoteFetch`
 * turns a failed read into the `failed` status, and anything that throws
 * around it is announced the same way.
 */
import { invokeRemoteFetch } from "@/lib/sync/engine/remoteFetch";
import { announceLoadFailure } from "@/lib/sync/engine/remoteFetchStatus";
import type { AppStore } from "@/lib/redux/store";
import { extractErrorMessage } from "@/utils/errors";
import { userPreferencesPolicy } from "./userPreferencesSlice";

export async function retryPreferencesLoad(store: AppStore): Promise<void> {
  try {
    await invokeRemoteFetch({
      policy: userPreferencesPolicy,
      store,
      getIdentity: () => store._sync.getIdentity(),
      reason: "manual",
    });
  } catch (err) {
    announceLoadFailure(store, [userPreferencesPolicy], extractErrorMessage(err), "manual");
  }
}

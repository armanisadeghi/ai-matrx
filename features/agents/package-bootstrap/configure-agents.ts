/**
 * configureAgentsForHost — one-shot boot wiring for the `@matrx/agents`
 * package. Call this ONCE, early in the app's startup (before the first
 * dispatch that touches an agents slice or thunk).
 *
 * This module owns all the host-specific glue: the app's Supabase client,
 * the Next.js fetch, the base URL derived from apiConfig, the existing
 * callbackManager, and auth credentials derived from userSlice. The package
 * itself knows none of this — it reads everything through adapter
 * interfaces (`@matrx/agents/adapters/*`).
 *
 * Keeping this file OUTSIDE the package means the package has zero
 * Next.js-specific imports; RN / Vite / HTML-JS hosts each provide their
 * own version of this wiring.
 */

import { configure } from "@matrx/agents/config";
import type { Store } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import {
  selectAccessToken,
  selectFingerprintId,
} from "@/lib/redux/slices/userSlice";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { callbackManager } from "@/utils/callbackManager";
import type { RootState } from "@/lib/redux/store";

/**
 * Wire host adapters into the agents package. Pass the Redux store so
 * auth credentials + base URL can be resolved lazily (they change across
 * tab-visibility stale-while-revalidate + user sign-in / sign-out).
 */
export function configureAgentsForHost(store: Store<RootState>): void {
  configure({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: supabase as unknown as any,
    fetch: globalThis.fetch.bind(globalThis),
    // `apiBaseUrl` is snapshotted at configure() time. If the host lets the
    // user switch servers at runtime, call `configureAgentsForHost(store)`
    // again after the switch — the registry is mutable.
    apiBaseUrl: selectResolvedBaseUrl(store.getState()) ?? "",
    callbackManager: {
      trigger<T>(id: string, data: T): void {
        callbackManager.trigger<T>(id, data);
      },
    },
    auth: {
      getCredentials() {
        const state = store.getState();
        return {
          accessToken: selectAccessToken(state) ?? null,
          fingerprintId: selectFingerprintId(state) ?? null,
        };
      },
    },
    logger: console,
  });
}

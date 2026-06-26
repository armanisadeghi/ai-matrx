"use client";

// DeferredShellData — fires after first paint, never blocks rendering.
// Calls Supabase directly from the browser — no API route middleman.

import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setUser, setShellDataLoaded } from "@/lib/redux/slices/userSlice";
import {
  setModulePreferences,
  type UserPreferences,
} from "@/lib/redux/preferences/userPreferencesSlice";
import { setContextMenuRows } from "@/lib/redux/slices/contextMenuCacheSlice";
import { setAgentContextMenuRows } from "@/lib/redux/slices/agentContextMenuCacheSlice";
import {
  hydrateModels,
  type AIModel,
} from "@/features/ai-models/redux/modelRegistrySlice";
// smsSlice imported lazily — avoids pulling the full SMS feature into the shell bundle
import { supabase } from "@/utils/supabase/client";
import {
  getSSRShellData,
  getSSRAgentShellData,
} from "@/utils/supabase/ssrShellData";
import { mapUserData } from "@/utils/userDataMapper";
import { bootstrapActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";
// Phase 4 PR 4.C: setGlobalUserIdAndToken removed — the dispatch(setUser(...))
// below already updates the Redux state, and `lib/sync/identity::attachStore`
// (wired in StoreProvider) makes that state visible to non-React consumers.
// No imperative seeding needed.
import type { ContextMenuRow } from "@/utils/supabase/ssrShellData";

export default function DeferredShellData() {
  const dispatch = useAppDispatch();
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    const t0 = performance.now();
    console.debug(`⚡DeferredShellData effect started at ${t0.toFixed(2)}ms`);

    async function load() {
      try {
        const t1 = performance.now();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        console.debug(
          `⚡DeferredShellData getUser: ${(performance.now() - t1).toFixed(2)}ms`,
        );
        if (!user) return;

        // Fetch session for the access token (fast local read, no network call)
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const accessToken = session?.access_token ?? null;

        const t2 = performance.now();
        // Phase 5: parallel-call legacy + agent SSR RPCs so both slices are
        // warm in one round-trip. The agent RPC is additive and safe — if it
        // is not yet deployed the helper returns defaults without throwing.
        const [shellData, agentShellData] = await Promise.all([
          getSSRShellData(supabase, user.id),
          getSSRAgentShellData(supabase, user.id),
        ]);
        console.debug(
          `⚡DeferredShellData getSSRShellData: ${(performance.now() - t2).toFixed(2)}ms`,
        );
        const userData = mapUserData(user, accessToken, shellData.is_admin);

        dispatch(setUser(userData));

        // Hydrate active-org state: record the personal org (API fallback) and
        // resolve the active org (default → only-org → nudge). Fire-and-forget
        // — never blocks the rest of shell hydration. (The live core/admin
        // shell triggers this via the ActiveOrgBootstrap island.)
        void dispatch(bootstrapActiveOrganization());

        if (shellData.preferences_exists && shellData.preferences) {
          for (const [key, value] of Object.entries(shellData.preferences)) {
            if (key !== "_meta" && value != null) {
              dispatch(
                setModulePreferences({
                  module: key as keyof UserPreferences,
                  preferences: value as Partial<
                    UserPreferences[keyof UserPreferences]
                  >,
                }),
              );
            }
          }
        }

        console.log(
          "[DeferredShellData] Context Menu length: ",
          shellData.context_menu.length,
        );

        if (shellData.context_menu.length > 0) {
          dispatch(
            setContextMenuRows(shellData.context_menu as ContextMenuRow[]),
          );
        }

        if (agentShellData.agent_context_menu.length > 0) {
          dispatch(
            setAgentContextMenuRows(
              agentShellData.agent_context_menu as ContextMenuRow[],
            ),
          );
        }

        if (shellData.ai_models.length > 0) {
          dispatch(
            hydrateModels({
              models: shellData.ai_models as AIModel[],
              fetchType: "options",
              fetchScope: "active",
              lastFetched: Date.now(),
            }),
          );
        }

        if (shellData.sms_unread_total > 0) {
          const { setUnreadTotal } =
            await import("@/features/sms/redux/smsSlice");
          dispatch(setUnreadTotal(shellData.sms_unread_total));
        }
        console.debug(
          `⚡DeferredShellData dispatches done at ${performance.now().toFixed(2)}ms (total: ${(performance.now() - t0).toFixed(2)}ms)`,
        );

        // Signal that all shell data (user + preferences) is loaded.
        // Components that must not render stale defaults (e.g. AnnouncementProvider)
        // gate themselves on this flag to avoid a flash of already-dismissed content.
        dispatch(setShellDataLoaded(true));
      } catch (err) {
        console.error("[DeferredShellData]", err);
        // Still mark as loaded so gated components don't hang indefinitely on error.
        dispatch(setShellDataLoaded(true));
      }
    }

    load();
  }, [dispatch]);

  return null;
}

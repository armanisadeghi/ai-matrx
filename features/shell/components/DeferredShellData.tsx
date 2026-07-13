"use client";

// DeferredShellData — fires after first paint, never blocks rendering.
// Calls Supabase directly from the browser — no API route middleman.

import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setUser, setShellDataLoaded } from "@/lib/redux/slices/userSlice";
import {
  setModulePreferences,
  stripLegacyDefaultModelSentinels,
  type UserPreferences,
} from "@/lib/redux/preferences/userPreferencesSlice";
import {
  hydrateModels,
  type AIModel,
} from "@/features/ai-models/redux/modelRegistrySlice";
// smsSlice imported lazily — avoids pulling the full SMS feature into the shell bundle
import { supabase } from "@/utils/supabase/client";
import { getSSRShellData } from "@/utils/supabase/ssrShellData";
import { mapUserData } from "@/utils/userDataMapper";
import { bootstrapActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";
// Phase 4 PR 4.C: setGlobalUserIdAndToken removed — the dispatch(setUser(...))
// below already updates the Redux state, and `lib/sync/identity::attachStore`
// (wired in StoreProvider) makes that state visible to non-React consumers.
// No imperative seeding needed.

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
        const shellData = await getSSRShellData(supabase, user.id);
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
          // Load boundary: fold the legacy hardcoded defaultModel seed
          // constants back to null (= platform default) before the module
          // merges — setModulePreferences is a user-write reducer and must
          // never sanitize, so it happens here.
          const sanitized = stripLegacyDefaultModelSentinels(
            shellData.preferences as Partial<UserPreferences>,
          );
          for (const [key, value] of Object.entries(sanitized)) {
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

        // Context-menu preloads removed 2026-07-07 (D25 residual): the v1
        // UnifiedContextMenu (contextMenuCache reader) was deleted with the
        // prompts system, and the v2/v3 menu fetches on open via
        // /api/agent-context-menu — neither cache slice has a reader. The
        // slices themselves are kept (per D25 disposition); only the dead
        // preload data flow is gone.

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

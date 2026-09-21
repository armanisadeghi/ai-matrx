"use client";

// DeferredShellData — fires after first paint, never blocks rendering.
// Calls Supabase directly from the browser — no API route middleman.

import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setUser, setShellDataLoaded } from "@/lib/redux/slices/userSlice";
// eslint-disable-next-line no-restricted-syntax -- boot totality: this island owns "the organization question has been answered", including the no-user and failed-fetch exits
import { setOrgBootstrapResolved } from "@/lib/redux/slices/appContextSlice";
import { markOrgBootstrapResolved } from "@/lib/organizations/orgBootstrapGate";
import {
  setModulePreferences,
  sanitizeLoadedPreferences,
  type UserPreferences,
} from "@/lib/redux/preferences/userPreferencesSlice";
import {
  hydrateModels,
  type AIModel,
} from "@/features/ai-models/redux/modelRegistrySlice";
// smsSlice imported lazily — avoids pulling the full SMS feature into the shell bundle
import { supabase } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { fetchAuthUserRecord } from "@/utils/supabase/authUserRecord.client";
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

    // Did the org bootstrap actually START? If it did, IT owns the answer
    // (its own `finally` always marks the question answered, success or not).
    // If it never started — no session, or the claims read itself threw — this
    // island must answer, or every gated surface waits forever.
    let bootstrapStarted = false;

    async function load() {
      try {
        const t1 = performance.now();
        // Identity is LOCAL: the access token's claims, verified against the
        // project JWKS in the browser. No auth-server round trip decides who
        // this is — on 2026-09-21 that round trip was a 10s stall per page.
        const {
          data: { user },
          error: claimsError,
        } = await getClaimsUser(supabase);
        console.debug(
          `⚡DeferredShellData getClaims: ${(performance.now() - t1).toFixed(2)}ms`,
        );
        if (claimsError) {
          console.warn(
            "[DeferredShellData] the session token could not be verified locally; " +
              `treating this load as signed out for the shell only. ${claimsError.name}: ${claimsError.message}`,
          );
        }
        if (!user) {
          // Not signed in: the organization question is ANSWERED (there is no
          // organization and never will be this session), so say so rather
          // than leaving every gated surface waiting on a boot that ended.
          dispatch(setOrgBootstrapResolved(true));
          markOrgBootstrapResolved();
          return;
        }

        // 🚨 BOOT IS TOTAL, AND IT DOES NOT RIDE ON THE SHELL FETCH.
        // This dispatch used to sit AFTER `getSSRShellData`, so any failure in
        // that fetch — a network blip, one bad preference row — skipped it
        // entirely. The catch below then set `shellDataLoaded`, which unblocks
        // the chrome, while `orgBootstrapResolved` stayed FALSE forever: ~20
        // surfaces gate their "choose an organization" notice on
        // `bootstrapResolved && !organizationId`, so every one of them showed a
        // permanent skeleton with no error and no picker. The org question is
        // independent of the shell payload, so it is asked FIRST, with the user
        // we already have in hand, and answered whatever happens next.
        bootstrapStarted = true;
        void dispatch(bootstrapActiveOrganization(user.id));

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

        // THE ONE record read. The JWT does not carry `created_at`,
        // `identities`, `last_sign_in_at` or `*_confirmed_at`; the profile page
        // and the user menus show them, so they are fetched ONCE here, after
        // the shell is already interactive, and merged into Redux when they
        // arrive. A stalled auth server delays these four fields, nothing else.
        void fetchAuthUserRecord().then(({ user: record, error }) => {
          if (!record || record.id !== user.id) {
            if (error) {
              console.warn(
                "[DeferredShellData] the auth-server user record did not arrive; " +
                  `created_at / identities / last_sign_in_at stay empty this session. ${error.message}`,
              );
            }
            return;
          }
          const full = mapUserData(record, accessToken, shellData.is_admin);
          dispatch(
            setUser({
              createdAt: full.createdAt,
              emailConfirmedAt: full.emailConfirmedAt,
              lastSignInAt: full.lastSignInAt,
              identities: full.identities,
            }),
          );
        });

        if (shellData.preferences_exists && shellData.preferences) {
          // Load boundary: normalize every known legacy shape drift
          // (defaultModel seed constants → null; superseded videoConference
          // audio fields dropped) before the module merges. setModulePreferences
          // is a user-write reducer and must never sanitize, and dispatching a
          // module here IS a real mutation → the sync engine writes the cleaned
          // blob back to IDB + remote, so a stale row self-heals on load instead
          // of waiting for the user's next manual save. Missing a strip here
          // would re-persist the field it dropped — hence the single canonical
          // sanitizer, never a subset.
          const sanitized = sanitizeLoadedPreferences(
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

        // Context-menu preloads removed 2026-07-07 (D25 residual); the menu
        // fetches on open via /api/agent-context-menu. The reader-less cache
        // slices (contextMenuCache / agentContextMenuCache) were deleted with
        // context-menu-v2 on 2026-07-19.

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
      } finally {
        // The backstop for the same class: however this function ends, nothing
        // is left waiting on an answer that is never coming. Deliberately NOT
        // unconditional — marking here while the bootstrap is still in flight
        // would answer "no organization" before anyone looked, which is the
        // cold-boot false refusal this same change set exists to remove.
        if (!bootstrapStarted) {
          dispatch(setOrgBootstrapResolved(true));
          markOrgBootstrapResolved();
        }
      }
    }

    load();
  }, [dispatch]);

  return null;
}

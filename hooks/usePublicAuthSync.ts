// hooks/usePublicAuthSync.ts
// Single source of truth for auth sync on public routes
"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  setUser,
  setFingerprintId,
  setAuthReady,
} from "@/lib/redux/slices/userSlice";
import { clearUserAuth } from "@/lib/redux/slices/userAuthSlice";
import { createClient } from "@/utils/supabase/client";
import { getFingerprint } from "@/lib/services/fingerprint-service";
import type { AdminLevel } from "@/utils/supabase/userSessionData";
import { rememberValidatedAccount } from "@/utils/auth/remembered-account";

/**
 * Syncs authentication state to Redux for ALL public routes.
 *
 * For authenticated users: stores user info + access token
 * For guests: stores fingerprint ID (for API authentication)
 *
 * Call this ONCE at the top level (PublicProviders).
 * All other components read from Redux via useApiAuth hook.
 *
 * Features:
 * - Delayed start (100ms) to not block initial render
 * - Gets session (includes access token) for authenticated users
 * - Gets fingerprint for guests (for guest API access)
 * - Checks admin status from database
 * - Sets authReady=true when complete (either path)
 * - Non-blocking, runs after hydration
 */
export function usePublicAuthSync() {
  const dispatch = useAppDispatch();
  const hasRun = useRef(false);

  useEffect(() => {
    // Only run once
    if (hasRun.current) return undefined;
    hasRun.current = true;

    const syncAuth = async () => {
      const startTime = performance.now();

      try {
        const supabase = createClient();

        // First check local session — this is a fast local-only read with
        // no network call and no error when no session exists. Only call
        // getUser() (which validates against the server) when a session is
        // present. This avoids the noisy AuthSessionMissingError on public
        // routes where the user is a guest.
        const {
          data: { session: localSession },
        } = await supabase.auth.getSession();

        let user = localSession?.user ?? null;

        if (localSession) {
          // Session exists locally — validate it against the server
          const {
            data: { user: validatedUser },
            error: userError,
          } = await supabase.auth.getUser();
          if (userError) {
            console.error("Auth validation error:", userError);
          }
          user = validatedUser;
        }

        if (user) {
          // AUTHENTICATED USER PATH
          // We already have the session from the local check above
          const session = localSession;

          // Check admin status + level
          let isAdmin = false;
          let adminLevel: AdminLevel | null = null;
          try {
            const { data: adminData } = await supabase
              .schema("admin")
              .from("admins")
              .select("user_id, level")
              .eq("user_id", user.id)
              .maybeSingle();
            isAdmin = !!adminData;
            adminLevel =
              (adminData as { level?: AdminLevel } | null)?.level ?? null;
          } catch {
            // Admin check failed, default to non-admin
          }

          // Dispatch to Redux with access token (authReady set automatically)
          const userMetadata = {
            avatarUrl: user.user_metadata?.avatar_url || null,
            fullName: user.user_metadata?.full_name || null,
            name: user.user_metadata?.name || null,
            preferredUsername: user.user_metadata?.preferred_username || null,
            picture: user.user_metadata?.picture || null,
          };
          rememberValidatedAccount(window.localStorage, userMetadata);

          dispatch(
            setUser({
              id: user.id,
              email: user.email || null,
              phone: user.phone || null,
              emailConfirmedAt: user.email_confirmed_at || null,
              lastSignInAt: user.last_sign_in_at || null,
              appMetadata: {
                provider: user.app_metadata?.provider || null,
                providers: user.app_metadata?.providers || [],
              },
              userMetadata,
              identities:
                user.identities?.map((i) => ({
                  provider: i.provider || null,
                  id: i.id || null,
                  user_id: i.user_id || null,
                  avatar_url: i.identity_data?.avatar_url || null,
                  email: i.identity_data?.email || null,
                  email_verified: i.identity_data?.email_verified || null,
                  full_name: i.identity_data?.full_name || null,
                  picture: i.identity_data?.picture || null,
                  provider_id: i.identity_data?.provider_id || null,
                  sub: i.identity_data?.sub || null,
                  name: i.identity_data?.name || null,
                })) || [],
              isAdmin,
              adminLevel,
              accessToken: session?.access_token || null,
              tokenExpiresAt: session?.expires_at || null,
            }),
          );
          // User preferences hydration is now handled automatically
          // by the sync engine: it reads from IDB on boot and falls
          // back to `userPreferencesPolicy.remote.fetch` (Supabase)
          // when IDB misses. No explicit dispatch required.
        } else {
          // GUEST USER PATH - get fingerprint for API authentication
          //
          // 🚨 CLEAR THE SSR IDENTITY FIRST. The store is seeded on the SERVER
          // from the auth cookie (`resolveStoreBootstrapState`), so a render
          // the server considered signed-in hands the browser a `userAuth.id`.
          // When the browser then turns out to have NO usable session, nothing
          // used to reconcile the two: Redux kept saying "signed in as X"
          // while supabase-js was anon, and every consumer gated on `userId`
          // — messaging, the file tree, assists, memberships, the COPPA gate,
          // agent access, integration connections — fired an authenticated-only
          // call that came back `42501 permission denied`. Seven unrelated
          // features breaking at once, on every load, for one cause.
          //
          // This is the same lesson `AuthSessionWatcher` records ("keeps them
          // mounted after Supabase has become anon and fans one expiry into
          // unrelated 42501 failures") — but that watcher lives inside
          // `DeferredSingletonCore`, which is `ssr: false` AND gated behind
          // `useIdleReady()`, so it cannot mount until the page goes idle,
          // long after the readers have already fired. The reconciliation has
          // to happen HERE, in the one auth hook that runs un-deferred on
          // every route.
          //
          // getSession() above is a local cookie read. If it came back empty
          // the browser genuinely cannot authenticate, so every authenticated
          // call WILL fail — clearing is strictly more honest than leaving a
          // signed-in shell that only produces permission errors. The user
          // gets the guest experience, and `AuthSessionWatcher` still owns the
          // "your session expired" overlay when it later mounts.
          dispatch(clearUserAuth());
          try {
            const fingerprintId = await getFingerprint();
            dispatch(setFingerprintId(fingerprintId));
            dispatch(setAuthReady(true));
          } catch (fpError) {
            console.error("Fingerprint error:", fpError);
            // Still set a temporary fingerprint so authReady becomes true
            dispatch(
              setFingerprintId(
                `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              ),
            );
            dispatch(setAuthReady(true));
          }
        }

        // Single consolidated log - route is now fully ready
        console.log(
          `[Public Route Ready] ${(performance.now() - startTime).toFixed(0)}ms`,
        );
      } catch (error) {
        console.error("Auth sync error:", error);
        // Even on error, try to get fingerprint so guests can still use the site
        try {
          const fingerprintId = await getFingerprint();
          dispatch(setFingerprintId(fingerprintId));
          dispatch(setAuthReady(true));
        } catch {
          dispatch(
            setFingerprintId(
              `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            ),
          );
          dispatch(setAuthReady(true));
        }
      }
    };

    // ── THE RECONCILIATION PRE-PASS ──────────────────────────────────────
    // Runs IMMEDIATELY, before the delayed full sync below, and does exactly
    // one thing: if the server seeded this store with an identity that the
    // browser cannot back with a session, drop the identity.
    //
    // It has to be its own pass because the full sync is deliberately delayed
    // 100ms and then validates against the server (`getUser()`), and every
    // millisecond in between is a window where consumers read a signed-in
    // `userId` out of Redux and issue authenticated-only calls as `anon`. That
    // window is what produced the `42501` bursts on `/chat/new`: seven
    // unrelated features failing on one page load.
    //
    // `getSession()` is a local cookie/storage read — no network, nothing to
    // wait for — so this costs nothing and cannot itself delay paint.
    const reconcileIdentity = async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) dispatch(clearUserAuth());
      } catch {
        // A storage read that throws is not proof of anything. Leave the
        // identity alone and let the full sync below decide.
      }
    };
    void reconcileIdentity();

    // Delay to ensure page renders first
    const timer = setTimeout(syncAuth, 100);
    return () => clearTimeout(timer);
  }, [dispatch]);
}

"use client";

/**
 * Auth Session Watcher — thin client shell.
 *
 * Subscribes to `supabase.auth.onAuthStateChange` immediately on mount
 * (the listener has to be active before the user can sign out). Only
 * the lightweight Supabase client + listener setup live in this file.
 *
 * Two conditions render the blocking overlay:
 *
 * 1. `SIGNED_OUT` — the classic "Session Expired" case.
 * 2. **Identity drift** — the authenticated user under this tab is no longer
 *    the user the app booted as. The auth cookie is domain-wide; a login in
 *    ANY tab of the profile (another account, a test account, an OAuth-review
 *    walkthrough) silently rotates it for every open tab. A tab that keeps
 *    running then attributes writes to the wrong account or has every write
 *    RLS-filtered to 0 rows. This is not hypothetical: on 2026-08-07 a
 *    Google-OAuth-verification login as `oauth-review@aimatrx.com` rotated
 *    the cookie under Arman's open /notes tab — the note he created was
 *    owned by the reviewer account, and ~14h of subsequent edits (after the
 *    cookie rotated back) were all silently rejected by RLS. Identity drift
 *    must therefore HARD-STOP the tab, never warn-and-continue.
 *
 * Drift is detected two ways, because cookie-based auth (@supabase/ssr) does
 * not reliably emit cross-tab auth events: (a) the auth-state listener when
 * it does fire, and (b) a storage re-read on focus/visibility and on a slow
 * interval — the cases where another tab rotated the cookie.
 *
 * The full-screen overlay (lucide icons, Button, the dialog markup) lives in
 * `AuthSessionWatcherImpl.tsx` and is `next/dynamic`-loaded ONLY when one of
 * the two conditions fires — i.e. nearly never — so the modal's dep graph
 * never enters the static graph of any route.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/utils/supabase/client";
import { captureDrafts } from "@/lib/local-drafts/localDrafts";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
// Surface A lifecycle write: reset the global active context on sign-out so the
// previous user's org/scope/context never bleeds into the next same-tab session.
// eslint-disable-next-line no-restricted-syntax -- Surface A: logout active-context reset
import { clearContext } from "@/lib/redux/slices/appContextSlice";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { contextValuesActions } from "@/features/scopes/redux/contextValuesSlice";

const AuthSessionWatcherImpl = dynamic(
  () => import("./AuthSessionWatcherImpl"),
  { ssr: false, loading: () => null },
);

/**
 * Persist every registered feature's unsaved buffer to the local-draft store
 * before this tab is hard-stopped, and scream: reaching this line means real
 * user work existed only in memory at the moment we took the tab away.
 */
function snapshotUnsavedWork(bootedId: string, currentId: string): number {
  const drafts = captureDrafts("auth-identity-drift");
  if (drafts.length === 0) return 0;
  captureError({
    source: "unsaved-work",
    message: `Identity drift with ${drafts.length} unsaved item(s) in memory — snapshotted to local drafts before blocking the tab`,
    details: `Tab booted as ${bootedId}; the auth cookie now belongs to ${currentId}. Drafts: ${drafts
      .map((d) => d.key)
      .join(", ")}`,
    hint: "The drafts are offered back when the original account reopens those records. Test-account logins belong in a separate browser profile.",
    callSite: "AuthSessionWatcher",
  });
  return drafts.length;
}

// How often to re-read the auth cookie while the tab is visible. Focus /
// visibility checks are the primary cross-tab signal; this is the backstop
// for a tab the user never blurs (long editing sessions).
const IDENTITY_RECHECK_INTERVAL_MS = 60_000;

export default function AuthSessionWatcher() {
  const [sessionExpired, setSessionExpired] = useState(false);
  const [driftedToEmail, setDriftedToEmail] = useState<string | null>(null);
  // How many unsaved items we rescued into local drafts before blocking — the
  // overlay says so, because "reload and lose everything" is what the user
  // otherwise (correctly) fears.
  const [rescuedDraftCount, setRescuedDraftCount] = useState(0);
  const dispatch = useAppDispatch();

  // The identity this tab booted as (SSR-hydrated userAuth). Captured once —
  // deliberately NOT updated on later changes: a later change IS the defect.
  const bootedIdRef = useRef<string | null>(null);
  const userAuthId = useAppSelector((state) => state.userAuth.id);
  useEffect(() => {
    if (!bootedIdRef.current && userAuthId) {
      bootedIdRef.current = userAuthId;
    }
  }, [userAuthId]);

  const checkIdentity = useCallback(async () => {
    const booted = bootedIdRef.current;
    if (!booted) return;
    // getSession() re-reads the cookie store — cheap, no network round-trip.
    const { data } = await supabase.auth.getSession();
    const current = data.session?.user;
    if (current && current.id !== booted) {
      // SNAPSHOT BEFORE BLOCKING. The overlay forces a reload, which discards
      // every in-memory buffer — that is how the last edits of D132 died. The
      // drafts are stamped with the account that wrote them, so they are only
      // ever offered back to that user.
      setRescuedDraftCount(snapshotUnsavedWork(booted, current.id));
      console.error(
        "[AuthSessionWatcher] IDENTITY DRIFT: tab booted as",
        booted,
        "but the auth cookie now belongs to",
        current.id,
        `(${current.email ?? "unknown email"}).`,
        "Blocking the tab — continuing would attribute writes to the wrong",
        "account or have them silently rejected by RLS.",
      );
      setDriftedToEmail(current.email ?? "another account");
    }
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        // Sign-out ends this tab's write path too — keep a copy of anything
        // still unsaved before the overlay goes up.
        captureDrafts("signed-out");
        setSessionExpired(true);
        // The store is a module-level singleton that survives a same-tab
        // sign-out → re-login. Reset the org/scope/context state so the
        // previous user's active context and cached scope tree never bleed
        // into the next session. (Legacy agent-context slices have no reset
        // actions — they are torn down in Phase 5.)
        dispatch(clearContext());
        dispatch(scopesActions.scopesReset());
        dispatch(contextValuesActions.contextValuesReset());
      }
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        setSessionExpired(false);
        const booted = bootedIdRef.current;
        const current = session?.user;
        if (booted && current && current.id !== booted) {
          setRescuedDraftCount(snapshotUnsavedWork(booted, current.id));
          console.error(
            "[AuthSessionWatcher] IDENTITY DRIFT (auth event):",
            "tab booted as",
            booted,
            "but is now signed in as",
            current.id,
            `(${current.email ?? "unknown email"}).`,
          );
          setDriftedToEmail(current.email ?? "another account");
        }
      }
    });

    // Cross-tab cookie rotation does not reliably fire auth events on a
    // cookie-storage client — re-read the cookie when the tab regains focus
    // or becomes visible, plus a slow interval backstop.
    const onFocusOrVisible = () => {
      if (document.visibilityState === "visible") void checkIdentity();
    };
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void checkIdentity();
    }, IDENTITY_RECHECK_INTERVAL_MS);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
      clearInterval(interval);
    };
  }, [dispatch, checkIdentity]);

  if (driftedToEmail) {
    return (
      <AuthSessionWatcherImpl
        variant="identity-changed"
        newEmail={driftedToEmail}
        rescuedDraftCount={rescuedDraftCount}
      />
    );
  }
  if (!sessionExpired) return null;
  return <AuthSessionWatcherImpl variant="expired" />;
}

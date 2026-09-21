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
 * NEITHER STOP IS TERMINAL (2026-09-13). While an overlay is up the watcher
 * keeps re-reading the cookie — on any activity in the tab (pointer, key,
 * touch, focus, visibility), on a fast poll, and on a cross-tab
 * `matrx-auth` broadcast fired by every tab's own auth events — and acts on
 * the verdict from `authTabReconcile.ts`: resume in place when the booted
 * identity is back, reload on its own when someone else is signed in
 * (spread over a few seconds for hidden tabs), or swap to "Session Expired"
 * when the cookie emptied. Before this, a sign-in from one tab left every
 * other blocked tab blocked until a human pressed Reload on each of ~50.
 *
 * WHAT "SESSION EXPIRED" USUALLY MEANS (2026-09-14 investigation): not an
 * expiry. The auth configuration is 7-day tokens, no rotation, no inactivity
 * timeout. The overlay appears when the account was signed out ELSEWHERE with
 * the Supabase default scope `global`, which deletes every session on every
 * device; each open tab's still-valid token then meets `session_not_found`.
 * The fix lives in `features/shell/auth/useSignOut.ts` (device-scoped sign-out,
 * super admins warned twice) and `pnpm check:signout-scope`.
 *
 * The full-screen overlay (lucide icons, Button, the dialog markup) lives in
 * `AuthSessionWatcherImpl.tsx` and is `next/dynamic`-loaded ONLY when one of
 * the two conditions fires — i.e. nearly never — so the modal's dep graph
 * never enters the static graph of any route.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/utils/supabase/client";
import { captureDrafts } from "@ai-matrx/kit/drafts";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
// Surface A lifecycle write: reset the global active context on sign-out so the
// previous user's org/scope/context never bleeds into the next same-tab session.
// eslint-disable-next-line no-restricted-syntax -- Surface A: logout active-context reset
import { clearContext } from "@/lib/redux/slices/appContextSlice";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { contextValuesActions } from "@/features/scopes/redux/contextValuesSlice";
import { clearUserAuth } from "@/lib/redux/slices/userAuthSlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { mediaFilesClient } from "@/features/files/media-client/client";
import {
  ACTIVITY_RECHECK_THROTTLE_MS,
  BLOCKED_RECHECK_INTERVAL_MS,
  decideBlockedTabReconcile,
  reloadDelayMs,
} from "./authTabReconcile";

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
// An empty cookie is acted on only when a second read, this long later, is
// still empty — @supabase/ssr rewrites the chunked cookie during a refresh.
const EMPTY_COOKIE_CONFIRM_MS = 1_500;

// Cross-tab "the auth cookie may have changed" nudge. Deliberately NOT the
// `matrx-sync` channel: that one is identity-gated by design (a message from
// another identity is dropped), and this notice exists precisely to cross
// identities. Payload-free on purpose — receivers re-read the cookie
// themselves; the message only says "look now".
const AUTH_BROADCAST_CHANNEL = "matrx-auth";

function openAuthBroadcast(): BroadcastChannel | null {
  if (typeof BroadcastChannel !== "function") return null;
  try {
    return new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
  } catch {
    return null;
  }
}

// --- Browser timezone capture (sign-in) -------------------------------------
//
// 749 of 766 people on the platform have no timezone recorded anywhere, so the
// SMS send gate judges their quiet hours in UTC and holds texts back in the
// middle of their afternoon. The browser has always known the answer; nothing
// carried it. Sign-in is the one moment every person passes through, so this is
// where it is offered — ONCE per browser session per user, best-effort.
//
// 🚨 THIS IS A FACT BEING OFFERED, NOT A USER-FACING ACTION. It must never
// block sign-in, never raise a toast, never throw, and never open a dialog:
//   • the module-level set makes it once per tab, the sessionStorage key makes
//     it once per browser session across reloads (every access is wrapped —
//     `sessionStorage` THROWS, not returns null, in some privacy modes);
//   • it is skipped outright when no organization has been selected yet.
//     `fetchWithOrganization` would otherwise meet the route's
//     `organization_required` refusal and OPEN THE ORG PICKER — a modal nobody
//     asked for, on top of a fresh sign-in, to answer a question the person was
//     never posed. Skipping is silent and cheap: the next sign-in, or the SMS
//     enrolment path, carries the same fact.
// The server decides whether to write at all (`record_person_timezone` writes
// only when nothing the person declared already answers), so there is nothing
// to pre-check and nothing to retry here.
const TIMEZONE_CAPTURE_STORAGE_PREFIX = "matrx.tz-captured.";
const timezoneCapturedThisTab = new Set<string>();

/** For tests, and for an in-place auth swap. */
export function resetBrowserTimezoneCapture(): void {
  timezoneCapturedThisTab.clear();
}

/**
 * Offer this browser's timezone for `userId`, at most once per browser session.
 * Resolves `true` when a request was actually sent. Never rejects.
 */
export async function captureBrowserTimezoneOnce(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  if (timezoneCapturedThisTab.has(userId)) return false;

  const storageKey = `${TIMEZONE_CAPTURE_STORAGE_PREFIX}${userId}`;
  try {
    if (sessionStorage.getItem(storageKey)) {
      timezoneCapturedThisTab.add(userId);
      return false;
    }
  } catch {
    /* privacy mode: the in-memory set still holds for this tab */
  }

  // Older browsers (and a few locked-down ones) yield nothing here. An absent
  // answer is not a wrong answer — send nothing.
  let timezone: string | undefined;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return false;
  }
  if (!timezone) return false;

  try {
    const { getActiveOrgId } = await import("@/lib/organizations/activeOrg");
    if (!getActiveOrgId()) return false;

    // Claim the slot BEFORE the request: a second SIGNED_IN arriving while this
    // one is in flight must not send a second POST.
    timezoneCapturedThisTab.add(userId);
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      /* privacy mode */
    }

    const { fetchWithOrganization } = await import(
      "@/lib/organizations/fetchWithOrganization"
    );
    await fetchWithOrganization("/api/person/timezone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone, source: "sign_in" }),
    });
    return true;
  } catch {
    // Best-effort by definition: a failed offer of a fact the server may
    // already know is not something to tell the person about, and it must not
    // escape into the auth handler.
    return false;
  }
}

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
  // App context hydrates after the first client render, and the file-session
  // mint is organization-admitted: minting before it lands is refused at the
  // server gate. The client waits for hydration on its own; re-running here
  // when the selection arrives (or changes) covers a bootstrap slower than
  // that wait and an in-session organization switch.
  const organizationId = useAppSelector(selectOrganizationId);
  useEffect(() => {
    if (!bootedIdRef.current && userAuthId) {
      bootedIdRef.current = userAuthId;
    }
    if (!userAuthId) return;
    // Establish the durable-file-URL session cookie as soon as this tab has
    // an authenticated identity (app load with an existing session). Fire
    // and forget — private media renders retry via force on error.
    void mediaFilesClient.ensureSession();
  }, [userAuthId, organizationId]);

  // Mirrors of the overlay state for callbacks that must not re-subscribe.
  const blockedRef = useRef<"expired" | "identity-changed" | null>(null);
  useEffect(() => {
    blockedRef.current = driftedToEmail
      ? "identity-changed"
      : sessionExpired
        ? "expired"
        : null;
  }, [driftedToEmail, sessionExpired]);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleReload = useCallback((reason: string) => {
    if (reloadTimerRef.current) return;
    const visible = document.visibilityState === "visible";
    const delay = reloadDelayMs(visible);
    console.warn(
      "[AuthSessionWatcher] blocked tab reloading on its own:",
      reason,
      visible ? "(visible — now)" : `(hidden — in ${Math.round(delay / 1000)}s)`,
    );
    reloadTimerRef.current = setTimeout(() => window.location.reload(), delay);
  }, []);

  /**
   * The blocked-tab loop. Re-reads the cookie and acts on the verdict; runs
   * on activity, on the fast poll, and on the cross-tab broadcast. Does
   * nothing while no overlay is up — `checkIdentity` owns that half.
   */
  const reconcileBlockedTab = useCallback(async () => {
    const variant = blockedRef.current;
    if (!variant || reloadTimerRef.current) return;
    const { data } = await supabase.auth.getSession();
    const verdict = decideBlockedTabReconcile({
      variant,
      bootedId: bootedIdRef.current,
      currentId: data.session?.user.id ?? null,
    });
    switch (verdict.action) {
      case "stay":
        return;
      case "resume":
        console.warn(
          "[AuthSessionWatcher] the auth cookie belongs to the booted account again — resuming this tab in place.",
        );
        setDriftedToEmail(null);
        setRescuedDraftCount(0);
        return;
      case "expire":
        setDriftedToEmail(null);
        setSessionExpired(true);
        return;
      case "reload":
        scheduleReload(verdict.reason);
        return;
    }
  }, [scheduleReload]);

  /**
   * The authority cutoff for a tab whose session is gone. Reached from the
   * in-tab SIGNED_OUT event AND from a confirmed empty cookie read (a sign-out
   * in another tab of this browser fires no event here — before 2026-09-13
   * such a tab kept running on a dead session until someone else signed in).
   */
  const onSignedOut = useCallback(() => {
    // Sign-out ends this tab's write path too — keep a copy of anything
    // still unsaved before the overlay goes up.
    captureDrafts("signed-out");
    setSessionExpired(true);
    // This is the authority cutoff, not merely overlay state. Global
    // identity-scoped islands key their lifetimes off Redux; leaving the
    // boot-time id/token there keeps them mounted after Supabase has
    // become anon and fans one expiry into unrelated 42501 failures.
    dispatch(clearUserAuth());
    // The store is a module-level singleton that survives a same-tab
    // sign-out → re-login. Reset the org/scope/context state so the
    // previous user's active context and cached scope tree never bleed
    // into the next session. (Legacy agent-context slices have no reset
    // actions — they are torn down in Phase 5.)
    //
    // NOT A DUPLICATE of `sync/identityReset` (lib/sync/engine/identityReset.ts),
    // and neither one covers the other: that reset is automatic over every
    // slice registered with `definePolicy` and fires on ANY swap away from
    // an authenticated identity (person → person included, which this
    // SIGNED_OUT branch never sees); this hand-written list is the only
    // thing that reaches `scopes` and `contextValues`, which are not sync
    // policies and so have no record for the engine to key on. Deleting
    // either one leaves a real hole — if you make those two slices
    // policies, delete these lines rather than leaving both.
    dispatch(clearContext());
    // The shared active-organization cookie (Domain=.aimatrx.com) is
    // identity-keyed, but a SIGNED_OUT is the one moment the next person
    // may be about to sign in on this browser — forget it outright.
    void import("@/lib/organizations/activeOrgCookie").then((m) =>
      m.activeOrgCookie.clear(),
    );
    dispatch(scopesActions.scopesReset());
    dispatch(contextValuesActions.contextValuesReset());
    // Same conditional flush for the Content-IR registries: a session that
    // loaded kinds while signed in holds the previous user's private
    // schemas/components in memory. Reload as the now-anon identity so
    // only public data survives; a session that never demanded a kind
    // still fetches nothing (THE ZERO-PREFETCH LAW).
    void import("@/features/content-ir/registry/kind-registry").then(
      (m) => {
        if (m.kindRegistry.hasBeenDemanded()) void m.kindRegistry.refresh(0);
      },
    );
    void import("@/features/content-ir/registry/component-registry").then(
      (m) => {
        if (m.componentRegistry.hasBeenDemanded()) {
          void m.componentRegistry.refresh(0);
        }
      },
    );
  
  }, [dispatch]);

  const checkIdentity = useCallback(async () => {
    const booted = bootedIdRef.current;
    if (!booted) return;
    // Once an overlay is up, the reconcile loop owns the cookie; re-running
    // the pre-block check would re-snapshot drafts and re-warn every tick.
    if (blockedRef.current) return;
    // getSession() re-reads the cookie store — cheap, no network round-trip.
    const { data } = await supabase.auth.getSession();
    const current = data.session?.user;
    if (!current) {
      // Empty cookie: a sign-out in another tab (no event reaches this one).
      // Confirm on a second read so a cookie mid-rewrite during a token
      // refresh never reads as a sign-out.
      await new Promise((r) => setTimeout(r, EMPTY_COOKIE_CONFIRM_MS));
      if (blockedRef.current) return;
      const again = await supabase.auth.getSession();
      if (again.data.session?.user) return;
      console.warn(
        "[AuthSessionWatcher] the auth cookie is empty on two reads — this tab's session ended elsewhere. Blocking as Session Expired.",
      );
      onSignedOut();
      return;
    }
    if (current.id !== booted) {
      // SNAPSHOT BEFORE BLOCKING. The overlay forces a reload, which discards
      // every in-memory buffer — that is how the last edits of D132 died. The
      // drafts are stamped with the account that wrote them, so they are only
      // ever offered back to that user.
      setRescuedDraftCount(snapshotUnsavedWork(booted, current.id));
      // This is an intentionally handled security transition, not a failed
      // application operation. `console.error` is globally persisted to the
      // system-error repair queue, so keep the operator-visible signal at warn.
      console.warn(
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
  }, [onSignedOut]);

  useEffect(() => {
    const broadcast = openAuthBroadcast();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Every tab's own auth event (including INITIAL_SESSION on a fresh page
      // load — the only event a server-action login ever produces) nudges
      // every other tab to re-read the cookie now, not on its next poll.
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "USER_UPDATED" ||
        event === "INITIAL_SESSION"
      ) {
        try {
          broadcast?.postMessage({ type: "auth-changed", event });
        } catch {
          /* a closed channel is not an error */
        }
      }
      const lostBootedSession =
        event === "SIGNED_OUT" ||
        (event === "INITIAL_SESSION" &&
          Boolean(bootedIdRef.current) &&
          !session);

      if (lostBootedSession) onSignedOut();
      if (
        event === "SIGNED_IN" ||
        event === "USER_UPDATED" ||
        (event === "INITIAL_SESSION" && session)
      ) {
        // Offer this browser's timezone once per session — see the note above
        // `captureBrowserTimezoneOnce`. Fire-and-forget, never rejects.
        //
        // 🚨 IT MUST INCLUDE `INITIAL_SESSION`, AND THAT IS NOT TIDINESS. A
        // session restored from cookies never fires `SIGNED_IN` — verified on
        // localhost 2026-09-21: a signed-in load of /dashboard sent no capture
        // at all. The hole this closes is 749 people who ALREADY have accounts,
        // and somebody who simply stays signed in for months would never once
        // have been asked. The door is idempotent (it answers `already_known`
        // and writes nothing), and the once-per-browser-session guard inside
        // keeps a page reload from turning into a second POST.
        void captureBrowserTimezoneOnce(session?.user?.id);

        // THE AUTH-HYDRATION RE-KICK (2026-08-31), rewritten same day under
        // 🚨 THE ZERO-PREFETCH LAW (Arman): a session that never met a
        // `__kind` fetches NOTHING Content-IR — not on page load, not on auth
        // events, not the light catalog. So this re-kick is CONDITIONAL: it
        // fires only when a kind was already demanded this session
        // (hasBeenDemanded), and then it must FORCE (refresh(0)), not
        // ensureWarm — because since the public-parent anon lane (aidream
        // 0581) a pre-hydration load SUCCEEDS as anon with the public rows,
        // and the old "no-op when the first load succeeded" posture would
        // have silently skipped loading the user's own and org shapes for
        // the whole session. The kind repaint seam (useContentIrKindVersion)
        // upgrades every mounted block in place when the refresh lands.
        //
        // Dynamic imports on purpose: this file is the thin always-mounted
        // shell, and a static edge into the registry cluster would pull the
        // entire compiled-kind graph into every route's first load (THE
        // FRAGMENTATION LAW). importing the module alone fetches nothing —
        // module init performs no IO; only demanded sessions refresh.
        void import("@/features/content-ir/registry/kind-registry").then(
          (m) => {
            if (m.kindRegistry.hasBeenDemanded()) void m.kindRegistry.refresh(0);
          },
        );
        void import("@/features/content-ir/registry/component-registry").then(
          (m) => {
            if (m.componentRegistry.hasBeenDemanded()) {
              void m.componentRegistry.refresh(0);
            }
          },
        );
      }
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        setSessionExpired(false);
        // Fresh sign-in → establish the file-session cookie for this identity.
        void mediaFilesClient.ensureSession({ force: event === "SIGNED_IN" });
        const booted = bootedIdRef.current;
        const current = session?.user;
        if (booted && current && current.id !== booted) {
          setRescuedDraftCount(snapshotUnsavedWork(booted, current.id));
          // The blocking overlay is the successful recovery path. Do not send
          // this expected auth transition to the system-error repair queue.
          console.warn(
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
      if (document.visibilityState !== "visible") return;
      void checkIdentity();
      void reconcileBlockedTab();
    };
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void checkIdentity();
    }, IDENTITY_RECHECK_INTERVAL_MS);

    // --- Blocked-tab recovery: activity, fast poll, cross-tab nudge. ---
    // ANY activity in a blocked tab re-reads the cookie (throttled — pointer
    // moves are a firehose). Cheap when nothing is blocked: one ref read.
    let lastActivityCheck = 0;
    const onActivity = () => {
      if (!blockedRef.current) return;
      const now = Date.now();
      if (now - lastActivityCheck < ACTIVITY_RECHECK_THROTTLE_MS) return;
      lastActivityCheck = now;
      void reconcileBlockedTab();
    };
    const activityEvents = [
      "pointermove",
      "pointerdown",
      "keydown",
      "touchstart",
      "wheel",
    ] as const;
    for (const name of activityEvents) {
      window.addEventListener(name, onActivity, { passive: true });
    }
    // Fast poll while blocked, hidden tabs included — the browser throttles
    // background timers on its own, and the broadcast covers the gap.
    const blockedPoll = setInterval(() => {
      if (blockedRef.current) void reconcileBlockedTab();
    }, BLOCKED_RECHECK_INTERVAL_MS);
    if (broadcast) {
      broadcast.onmessage = () => {
        // The nudge carries no payload; the cookie is the truth.
        void checkIdentity();
        void reconcileBlockedTab();
      };
    }

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
      clearInterval(interval);
      for (const name of activityEvents) {
        window.removeEventListener(name, onActivity);
      }
      clearInterval(blockedPoll);
      broadcast?.close();
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, [dispatch, checkIdentity, reconcileBlockedTab, onSignedOut]);

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

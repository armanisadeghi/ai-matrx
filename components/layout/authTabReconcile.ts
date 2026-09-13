/**
 * authTabReconcile — what a BLOCKED tab does when the auth cookie changes.
 *
 * `AuthSessionWatcher` hard-stops a tab in two cases: the session signed out
 * ("Session Expired") or the domain-wide cookie now belongs to a different
 * account than the one the tab booted as ("Account Changed"). Both stops
 * used to be terminal: nothing ever re-examined the cookie, so after a
 * sign-in from ANY other tab every blocked tab stayed blocked until a human
 * pressed Reload on each one. On 2026-09-13 that was ~50 tabs, each showing
 * "Account Changed" while a plain reload would have landed signed in — the
 * system had logged the tabs out blindly and then refused to log them back
 * in just as blindly.
 *
 * This module is the pure verdict; the watcher owns the timers, listeners
 * and the reload itself. Kept free of React and browser globals so the
 * verdict table is unit-tested directly.
 */

export type BlockedVariant = "expired" | "identity-changed";

export interface ReconcileInput {
  /** Which overlay is up. */
  variant: BlockedVariant;
  /** The identity this tab booted as (SSR-hydrated). */
  bootedId: string | null;
  /** The identity the auth cookie holds RIGHT NOW (null = signed out). */
  currentId: string | null;
}

export type ReconcileVerdict =
  /** Nothing changed; keep the overlay. */
  | { action: "stay" }
  /**
   * The cookie belongs to the booted identity again. Nothing in this tab's
   * memory was cleared for the drift stop, so it may simply continue.
   */
  | { action: "resume" }
  /**
   * Someone IS signed in and this tab cannot honestly continue in place —
   * reload so it re-hydrates as the current account.
   */
  | { action: "reload"; reason: string }
  /**
   * The cookie is now empty under a drift stop: the tab has no session at
   * all, so the honest overlay is "Session Expired" (which then reloads on
   * the next sign-in).
   */
  | { action: "expire" };

export function decideBlockedTabReconcile({
  variant,
  bootedId,
  currentId,
}: ReconcileInput): ReconcileVerdict {
  if (variant === "expired") {
    // Redux authority was cleared at sign-out (clearUserAuth + context
    // resets), so a same-identity return still cannot resume in place — a
    // reload is the one honest re-hydration, whoever is signed in now.
    if (!currentId) return { action: "stay" };
    return {
      action: "reload",
      reason:
        currentId === bootedId
          ? "the original account signed back in"
          : "a different account signed in",
    };
  }

  // identity-changed
  if (!currentId) return { action: "expire" };
  if (bootedId && currentId === bootedId) return { action: "resume" };
  return {
    action: "reload",
    reason: "continuing as the account this browser is now signed in as",
  };
}

/**
 * A hidden tab spreads its reload over a short window so fifty background
 * tabs do not all hit the server in the same second when one sign-in
 * settles. A visible tab reloads at once — the person is looking at it.
 */
export const HIDDEN_TAB_RELOAD_JITTER_MS = 15_000;

/** Cookie re-read cadence while an overlay is up (a cookie parse, no network). */
export const BLOCKED_RECHECK_INTERVAL_MS = 5_000;

/** Minimum gap between activity-driven re-checks (mouse moves are a firehose). */
export const ACTIVITY_RECHECK_THROTTLE_MS = 1_000;

export function reloadDelayMs(
  visible: boolean,
  random: () => number = Math.random,
): number {
  return visible ? 0 : Math.floor(random() * HIDDEN_TAB_RELOAD_JITTER_MS);
}

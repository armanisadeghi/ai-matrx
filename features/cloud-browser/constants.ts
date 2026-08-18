/**
 * Cloud Browser — CAPS constants (architecture, not configuration).
 *
 * Per repo doctrine these are code constants, never env toggles. Screenshot
 * cadence + auto-off are D-21 overseer defaults Arman tunes by feel.
 */

export const CLOUD_BROWSER_OVERLAY_ID = "cloudBrowserWindow" as const;

/** The canonical shareable resource type for a Cloud Browser profile (S1 §5.2). */
export const CLOUD_BROWSER_RESOURCE_TYPE = "browser_profile" as const;

/** Assists surface name — `<client>/<surface>` (features/assists). */
export const CLOUD_BROWSER_ASSIST_SURFACE = "cloud-browser/panel" as const;

// ── Screenshots-on-request (D-8 tier 2, D-21 defaults) ───────────────────────
/** Fresh capture roughly every 5s while the viewer keeps the request open. */
export const SCREENSHOT_CADENCE_MS = 5_000;
/** Auto-off after 5 minutes without interaction; always re-armable. */
export const SCREENSHOT_AUTO_OFF_MS = 5 * 60_000;

// ── Control lease cadence (S4 §5.3) ──────────────────────────────────────────
export const CONTROL_LEASE_RENEW_INTERVAL_MS = 20_000;

// ── Retention (D-20) ─────────────────────────────────────────────────────────
export const CHECKPOINT_RETENTION_DAYS = 30;

/** The three visibility tiers of PLAN.md §First-release media policy. */
export type MediaTier = "written" | "screenshots" | "takeover";

/** Honest walkthrough — the AWS session-expiry caveat is stated, not hidden. */
export const AWS_SESSION_CAVEAT =
  "Some sites (AWS most of all) expire a signed-in session on their own hard clock. When that happens the Cloud Browser will ask a person to sign in again — we cannot keep those sessions alive forever, and we will always tell you when one needs you.";

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

/**
 * The query parameter a D-14 handoff notification lands with.
 *
 * The server builds the door as
 * `/chat[/{conversationId}]?cloudBrowserHandoff={handoffId}`
 * (aidream `services/cloud_browser/notify.py::handoff_deep_link`) and
 * `components/CloudBrowserHandoffDeepLink.tsx` is the ONE reader. Both halves
 * must change together — a chip whose parameter nobody reads is a dead end,
 * which is exactly what shipped first.
 */
export const CLOUD_BROWSER_HANDOFF_PARAM = "cloudBrowserHandoff" as const;

// ── Screenshots-on-request (D-8 tier 2, D-21 defaults) ───────────────────────
// Captures are EVENT-DRIVEN first (Arman 2026-08-21): every cloud-browser tool
// action (navigate / click / fill / login) triggers a capture, so the viewer
// never misses the moment the page changes. The timed cadence is only the
// idle backstop for quiet pages — which is why it is slower than the old flat
// 5s poll — and Rapid mode covers pages that animate without tool activity.
/** Idle heartbeat between captures while no browser activity is streaming. */
export const SCREENSHOT_IDLE_CADENCE_MS = 15_000;
/** Rapid mode for visually busy pages (user opt-in per session). */
export const SCREENSHOT_RAPID_CADENCE_MS = 2_000;
/** A burst of tool actions collapses into one capture per this window. */
export const SCREENSHOT_ACTIVITY_DEBOUNCE_MS = 600;
/** Auto-off after 5 minutes without interaction; always re-armable. */
export const SCREENSHOT_AUTO_OFF_MS = 5 * 60_000;

// ── Written progress (D-8 tier 1 — the DEFAULT face) ────────────────────────
/**
 * How often the open panel reads the written-progress tail.
 *
 * NOT a tuning dial for "how live does this feel" — the read is an incremental
 * cursor over an append-only ledger, so this is only the worst-case latency
 * between a browser action and its line appearing. 2s is below the threshold at
 * which a person reading play-by-play notices a gap; going lower buys nothing
 * and going higher makes the agent look stalled. A CAPS constant, never an env
 * toggle (CLAUDE.md § An env var is a VALUE, never a TOGGLE).
 */
export const WRITTEN_PROGRESS_POLL_MS = 2_000;

// ── Control lease cadence (S4 §5.3) ──────────────────────────────────────────
export const CONTROL_LEASE_RENEW_INTERVAL_MS = 20_000;

// ── Retention (D-20) ─────────────────────────────────────────────────────────
export const CHECKPOINT_RETENTION_DAYS = 30;

/** The three visibility tiers of PLAN.md §First-release media policy. */
export type MediaTier = "written" | "screenshots" | "takeover";

/** Honest walkthrough — the AWS session-expiry caveat is stated, not hidden. */
export const AWS_SESSION_CAVEAT =
  "Some sites (AWS most of all) expire a signed-in session on their own hard clock. When that happens the Cloud Browser will ask a person to sign in again — we cannot keep those sessions alive forever, and we will always tell you when one needs you.";

/**
 * What the agent is told when a person takes the wheel. These ride the
 * Turn-Boundary Inbox as `system_message` notes (see
 * `hooks/useCloudBrowserTakeover.ts`) — the STEER note at the agent's own next
 * boundary, the INTERRUPT note held for its next turn after being stopped.
 * Written to the agent, plainly, with the one instruction that matters.
 */
export const TAKEOVER_STEER_NOTE =
  "The person you are working with is taking control of the cloud browser. " +
  "Stop issuing browser actions now and acknowledge — they are driving it " +
  "themselves. Continue with anything that does not need the browser, and " +
  "wait for them to hand control back before using it again.";

export const TAKEOVER_INTERRUPT_NOTE =
  "You were stopped mid-run because the person you are working with took " +
  "immediate control of the cloud browser. Nothing went wrong — they are " +
  "driving it themselves now. Do not resume browser actions; wait until they " +
  "hand control back, then pick up from what the browser actually shows.";

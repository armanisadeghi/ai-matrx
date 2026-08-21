/**
 * QUIET — the ONE vocabulary for "stop showing me this, for a while".
 *
 * Three scopes, one set of windows, one meaning of the timestamp:
 *
 *   - **Everything**  → `preferences.assists.quietUntil` (this file's windows).
 *     The dock goes to a dot, and client-side producers STOP EMITTING — a
 *     suggestion nobody will read is money spent for nothing, so quiet has to
 *     reach production, not just rendering.
 *   - **One kind**    → `platform.assists.suppressed_until` across the source
 *     (`service.ts#suppressAssistSource`), inherited by future rows from the
 *     same producer via `private.inherit_assist_source_suppression()`.
 *   - **One assist**  → the ordinary snooze in `constants.ts`.
 *
 * `null` means "not quiet". `"infinity"` (the Postgres value, kept as a
 * string here so both scopes speak one type) means "until I turn it back on".
 * Everything else is an ISO timestamp that simply passes.
 *
 * These are CAPS constants, never env vars — a product rule in an env var
 * fails silently (CLAUDE.md § "An env var is a VALUE, never a TOGGLE").
 */

/** "Until I turn it back on" — the Postgres `infinity` timestamp. */
export const QUIET_FOREVER = "infinity";

export interface QuietWindow {
  key: string;
  /** Menu label — what the user picks. */
  label: string;
  /** ms from now, or null for QUIET_FOREVER, or "end-of-day". */
  kind: "duration" | "end-of-day" | "forever";
  ms?: number;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The standard windows, shortest first. Deliberately short at the top: the
 * complaint that produced this feature was volume during focused work, and a
 * one-hour mute the user actually reaches for beats a permanent one they
 * reach for once and never reverse.
 */
export const QUIET_WINDOWS: readonly QuietWindow[] = [
  { key: "1h", label: "1 hour", kind: "duration", ms: HOUR_MS },
  { key: "4h", label: "4 hours", kind: "duration", ms: 4 * HOUR_MS },
  { key: "today", label: "Rest of today", kind: "end-of-day" },
  { key: "24h", label: "Tomorrow", kind: "duration", ms: 24 * HOUR_MS },
  { key: "7d", label: "A week", kind: "duration", ms: 7 * 24 * HOUR_MS },
  { key: "forever", label: "Until I turn it back on", kind: "forever" },
] as const;

export type QuietWindowKey = (typeof QUIET_WINDOWS)[number]["key"];

/** The X on the dock uses this one — cheap, obvious, and self-reversing. */
export const DEFAULT_QUIET_KEY: QuietWindowKey = "24h";

/**
 * Resolve a window to the stored value. `now` is injectable so the tests (and
 * anything comparing two scopes) never race the clock.
 */
export function quietUntil(key: string, now: Date = new Date()): string {
  // An unknown key falls back to the default window rather than throwing: a
  // mute the user asked for must never fail to happen.
  const window =
    QUIET_WINDOWS.find((w) => w.key === key) ??
    QUIET_WINDOWS.find((w) => w.key === DEFAULT_QUIET_KEY);
  if (!window || window.kind === "forever") return QUIET_FOREVER;
  if (window.kind === "end-of-day") {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return end.toISOString();
  }
  return new Date(now.getTime() + (window.ms ?? HOUR_MS)).toISOString();
}

/** Is this stored value still quieting anything right now? */
export function isQuiet(
  until: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!until) return false;
  if (until === QUIET_FOREVER) return true;
  const at = Date.parse(until);
  if (Number.isNaN(at)) return false;
  return at > now.getTime();
}

/**
 * Human remaining-time for a quiet state — "3h left", "until you turn it back
 * on". Coarse on purpose: this label sits on a 20px dot, and a ticking second
 * counter on a mute is the opposite of quiet.
 */
export function formatQuietRemaining(
  until: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!isQuiet(until, now)) return null;
  if (!until || until === QUIET_FOREVER) return "until you turn it back on";
  const remaining = Date.parse(until) - now.getTime();
  if (remaining < HOUR_MS) {
    return `${Math.max(1, Math.round(remaining / 60_000))}m left`;
  }
  if (remaining < 48 * HOUR_MS) return `${Math.round(remaining / HOUR_MS)}h left`;
  return `${Math.round(remaining / (24 * HOUR_MS))}d left`;
}

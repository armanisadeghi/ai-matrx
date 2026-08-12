/**
 * Assist constants — the shared thresholds and windows every surface obeys.
 *
 * These are CAPS constants, never env vars: an env toggle for a product rule
 * fails silently and invisibly (CLAUDE.md § "An env var is a VALUE, never a
 * TOGGLE").
 */

/**
 * Below this confidence an assist is real but weak: it never interrupts, is
 * folded out of the primary list, and stays reachable in the manager.
 *
 * Absorbed from kg-suggestions (`features/kg-suggestions/constants.ts`), where
 * a producer's sub-50% proposals were mostly noise and de-emphasising them was
 * the difference between a useful inbox and a dismissed one. A null confidence
 * is NOT low — deterministic producers don't score themselves, and a state
 * check that fired is exactly as true as it is loud.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

export function isLowConfidence(confidence: number | null | undefined): boolean {
  return typeof confidence === "number" && confidence < LOW_CONFIDENCE_THRESHOLD;
}

/**
 * "Remind me later" windows. Snoozing keeps the row `pending` and moves
 * `suppressed_until` — deliberately NOT a decision, so a producer's
 * `filterUndecidedKeys` gate still treats the thing as un-answered and the
 * chip returns on its own.
 */
export const SNOOZE_WINDOWS = [
  { key: "1d", label: "Tomorrow", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "Next week", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "Next month", ms: 30 * 24 * 60 * 60 * 1000 },
] as const;

export type SnoozeWindowKey = (typeof SNOOZE_WINDOWS)[number]["key"];

export const DEFAULT_SNOOZE_KEY: SnoozeWindowKey = "7d";

export function snoozeUntilIso(key: SnoozeWindowKey): string {
  const window =
    SNOOZE_WINDOWS.find((w) => w.key === key) ?? SNOOZE_WINDOWS[1];
  return new Date(Date.now() + window.ms).toISOString();
}

/**
 * Split a list into what deserves the user's attention now and what is real
 * but weak. Weak rows are never deleted or hidden — they fold into one quiet
 * line that opens the manager (a count is a door: THE DOOR LAW).
 */
export function partitionByConfidence<T extends { confidence: number | null }>(
  items: T[],
): { strong: T[]; weak: T[] } {
  const strong: T[] = [];
  const weak: T[] = [];
  for (const item of items) {
    (isLowConfidence(item.confidence) ? weak : strong).push(item);
  }
  return { strong, weak };
}

/** The manager route — where every assist, in every state, is reachable. */
export const ASSISTS_MANAGER_HREF = "/assists";

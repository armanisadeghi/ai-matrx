/**
 * The snooze half of the attention dock — the WHOLE dock, this browser, for
 * a while. Pure enough to test, small enough to read.
 *
 * THE DEFECT THIS EXISTS FOR (Arman, 2026-09-12). The first global alarm
 * shipped with collapse-only and no way out: it could be shrunk to a pill,
 * never put away. A notice a person cannot put away stops being a notice and
 * becomes furniture in their workspace.
 *
 * THE RULE THIS ENCODES: every notice has BOTH doors — make it go away now,
 * and make it stay away for a while. A snooze is TIMED, never permanent: the
 * only thing that removes an item forever is fixing it (or muting THAT item,
 * which is the per-item door beside every row). The closing X takes the
 * default (three hours) so the common case is one click.
 */

const SNOOZE_KEY = "matrx.admin-attention.snoozed-until";

const HOUR = 60 * 60 * 1000;

export interface SnoozeChoice {
  id: string;
  label: string;
  ms: number;
}

export const SNOOZE_CHOICES: SnoozeChoice[] = [
  { id: "1h", label: "1 hour", ms: HOUR },
  { id: "3h", label: "3 hours", ms: 3 * HOUR },
  { id: "8h", label: "8 hours", ms: 8 * HOUR },
  { id: "1d", label: "1 day", ms: 24 * HOUR },
  { id: "3d", label: "3 days", ms: 3 * 24 * HOUR },
];

/** What the closing X does, so the common case is a single click. */
export const DEFAULT_SNOOZE = SNOOZE_CHOICES[1];

/**
 * The epoch-ms the dock is silent until, or `null` when it should show.
 * A stored time already in the past is cleared rather than trusted, so a clock
 * change or a very old value can never silence the dock indefinitely.
 */
export function readSnoozedUntil(now: number = Date.now()): number | null {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY);
    if (!raw) return null;
    const until = Number(raw);
    if (!Number.isFinite(until) || until <= now) {
      window.localStorage.removeItem(SNOOZE_KEY);
      return null;
    }
    return until;
  } catch {
    return null;
  }
}

/** Silence the dock for `ms`, returning the epoch-ms it wakes at. */
export function writeSnooze(ms: number, now: number = Date.now()): number {
  const until = now + ms;
  try {
    window.localStorage.setItem(SNOOZE_KEY, String(until));
  } catch {
    // Storage refused (private mode) — the in-memory state still applies for
    // this tab, and the dock returns on the next load. Never silent-forever.
  }
  return until;
}

export function clearSnooze(): void {
  try {
    window.localStorage.removeItem(SNOOZE_KEY);
  } catch {
    // Nothing to do: an unremovable key expires on its own.
  }
}

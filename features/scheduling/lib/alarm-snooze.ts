"use client";

/**
 * The snooze half of the global schedule alarm — pure enough to test, small
 * enough to read.
 *
 * THE DEFECT THIS EXISTS FOR (Arman, 2026-09-12). The alarm shipped with
 * collapse-only and no way out: it could be shrunk to a pill, never put away.
 * A notice a person cannot put away stops being a notice and becomes furniture
 * in their workspace — and a super-admin who is mid-task does not need to be
 * told six times an hour about a schedule they already know about.
 *
 * THE RULE THIS ENCODES: every notice has BOTH doors — make it go away now,
 * and make it stay away for a while. For an operational alarm the second door
 * is a TIMED snooze, never a permanent dismissal: the only thing that removes
 * this alarm forever is fixing the schedules, so the snooze always expires and
 * the alarm always comes back.
 *
 * Durations are deliberately few and deliberately short; the closing X takes
 * the default (three hours) so the common case is one click.
 */

const SNOOZE_KEY = "matrx.schedule-alarm-banner.snoozed-until";

export interface SnoozeChoice {
  id: string;
  label: string;
  ms: number;
}

export const SNOOZE_CHOICES: SnoozeChoice[] = [
  { id: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
  { id: "3h", label: "3 hours", ms: 3 * 60 * 60 * 1000 },
  { id: "8h", label: "8 hours", ms: 8 * 60 * 60 * 1000 },
  { id: "24h", label: "24 hours", ms: 24 * 60 * 60 * 1000 },
];

/** What the closing X does, so the common case is a single click. */
export const DEFAULT_SNOOZE = SNOOZE_CHOICES[1];

/**
 * The epoch-ms the alarm is silent until, or `null` when it should show.
 * A stored time already in the past is cleared rather than trusted, so a clock
 * change or a very old value can never silence the alarm indefinitely.
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

/** Silence the alarm for `ms`, returning the epoch-ms it wakes at. */
export function writeSnooze(ms: number, now: number = Date.now()): number {
  const until = now + ms;
  try {
    window.localStorage.setItem(SNOOZE_KEY, String(until));
  } catch {
    // Storage refused (private mode) — the in-memory state still applies for
    // this tab, and the alarm returns on the next load. Never silent-forever.
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

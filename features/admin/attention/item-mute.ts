/**
 * Per-item mutes — the durations every item offers, and the LOCAL store for
 * items that have no row of their own (a provider outage id).
 *
 * THE RULE (Arman, 2026-09-12 and 2026-09-14): every notice has both doors —
 * make it go away now, and make it stay away for a while — and a mute is
 * TIMED, never permanent. The expiry is written next to the key so a stored
 * time already in the past is cleared rather than trusted: a clock change or a
 * very old value can never silence anything indefinitely.
 *
 * A schedule's mute does NOT live here — it lives on the row
 * (`sch_task.metadata.alarm_mute`, see `features/scheduling/service/queries.ts`)
 * because "this one is supposed to be off" is a fact every super-admin on
 * every device must see. This store is only for the things that cannot carry
 * their own mute.
 *
 * Every read and write is wrapped: `localStorage` throws in private mode and
 * can come back empty after a clear. The fallback is always "show it".
 */

const MUTE_KEY = "matrx.admin-attention.muted";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface MuteChoice {
  id: string;
  label: string;
  ms: number;
}

/**
 * Few, and spanning "I'm mid-task" to "this module is not built yet". The
 * longest is a month: a mute that outlives a month is a decision that belongs
 * on the schedule (pause it, delete it), not on the alarm about it.
 */
export const MUTE_CHOICES: MuteChoice[] = [
  { id: "1h", label: "1 hour", ms: HOUR },
  { id: "8h", label: "8 hours", ms: 8 * HOUR },
  { id: "1d", label: "1 day", ms: DAY },
  { id: "3d", label: "3 days", ms: 3 * DAY },
  { id: "8d", label: "8 days", ms: 8 * DAY },
  { id: "30d", label: "30 days", ms: 30 * DAY },
];

/** The span "mute with a note" uses — the note is for a long silence. */
export const NOTE_MUTE = MUTE_CHOICES[MUTE_CHOICES.length - 1];

export type MuteMap = Record<string, number>;

/**
 * The store is read through `useSyncExternalStore` (see `useLocalMutes`), so
 * a write here re-renders every dock and review page in this tab without a
 * setState-in-effect, and the snapshot is cached per version so React never
 * sees a fresh object for an unchanged store.
 */
const listeners = new Set<() => void>();
let version = 0;
let cache: { version: number; map: MuteMap } | null = null;
const EMPTY: MuteMap = Object.freeze({}) as MuteMap;

function notify(): void {
  version += 1;
  for (const l of listeners) l();
}

export function subscribeMutes(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMuteSnapshot(): MuteMap {
  if (cache === null || cache.version !== version) {
    cache = { version, map: readMuteMap() };
  }
  return cache.map;
}

export function getMuteServerSnapshot(): MuteMap {
  return EMPTY;
}

/** Re-read the store (an expiry timer just fired). */
export function touchMutes(): void {
  notify();
}

function read(): MuteMap {
  try {
    const raw = window.localStorage.getItem(MUTE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: MuteMap = {};
    for (const [key, until] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof until === "number" && Number.isFinite(until)) out[key] = until;
    }
    return out;
  } catch {
    // Storage refused or held garbage — nothing is muted, which shows the
    // item. Failing toward loud is the only safe direction here.
    return {};
  }
}

function write(map: MuteMap): void {
  try {
    window.localStorage.setItem(MUTE_KEY, JSON.stringify(map));
  } catch {
    // Storage refused (private mode) — the in-memory state still applies for
    // this tab and the item returns on the next load. Never silent-forever.
  }
}

/**
 * The live map — item key -> the epoch-ms it wakes at — with every expired
 * entry pruned on the way out, so the map cannot grow without bound and an
 * expiry that has passed can never silence anything.
 */
export function readMuteMap(now: number = Date.now()): MuteMap {
  const map = read();
  const live: MuteMap = {};
  let pruned = false;
  for (const [key, until] of Object.entries(map)) {
    if (until > now) live[key] = until;
    else pruned = true;
  }
  if (pruned) write(live);
  return live;
}

/** Silence one item for `ms`, returning the epoch-ms it wakes at. */
export function muteItem(key: string, ms: number, now: number = Date.now()): number {
  const until = now + ms;
  const live = readMuteMap(now);
  live[key] = until;
  write(live);
  notify();
  return until;
}

export function unmuteItem(key: string, now: number = Date.now()): void {
  const live = readMuteMap(now);
  delete live[key];
  write(live);
  notify();
}

/** Test/reset door: forget every local mute. Never called from the UI. */
export function clearMutes(): void {
  try {
    window.localStorage.removeItem(MUTE_KEY);
  } catch {
    // Nothing to do: an unremovable key expires on its own.
  }
  notify();
}

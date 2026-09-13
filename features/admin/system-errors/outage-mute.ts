/**
 * The mute half of the platform outage notice — per outage, timed, and never
 * permanent.
 *
 * THE RULE THIS ENCODES (Arman, 2026-09-12): "this can't be something that
 * complains constantly." So the notice has both doors — make it go away now,
 * and make it stay away for a while — but a NEW outage is never muted. The
 * mute is keyed by the server's outage id, and the server opens a new id for
 * every new outage, so silencing Anthropic being down this morning says
 * nothing about OpenAI going down this afternoon, or about Anthropic going
 * down again tomorrow.
 *
 * The expiry is written NEXT TO the id (`{ "<id>": <epoch-ms> }`) so a stored
 * time already in the past is cleared rather than trusted: a clock change or a
 * very old value can never silence an outage indefinitely.
 *
 * Every read and write is wrapped: `localStorage` throws in private mode and
 * can come back empty after a clear. The fallback is always "show it".
 */

const MUTE_KEY = "matrx.platform-outage.muted";

/** One click of the X. Deliberately short — an outage is worth re-asking. */
export const MUTE_MS = 60 * 60 * 1000;

type MuteMap = Record<string, number>;

function read(): MuteMap {
  try {
    const raw = window.localStorage.getItem(MUTE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: MuteMap = {};
    for (const [id, until] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof until === "number" && Number.isFinite(until)) out[id] = until;
    }
    return out;
  } catch {
    // Storage refused or held garbage — nothing is muted, which shows the
    // outage. Failing toward loud is the only safe direction here.
    return {};
  }
}

function write(map: MuteMap): void {
  try {
    window.localStorage.setItem(MUTE_KEY, JSON.stringify(map));
  } catch {
    // Storage refused (private mode) — the in-memory state still applies for
    // this tab and the notice returns on the next load. Never silent-forever.
  }
}

/**
 * The ids currently silent, with every expired entry pruned on the way out —
 * so the map cannot grow without bound as outages come and go.
 */
export function readMutedIds(now: number = Date.now()): Set<string> {
  const map = read();
  const live: MuteMap = {};
  let pruned = false;
  for (const [id, until] of Object.entries(map)) {
    if (until > now) live[id] = until;
    else pruned = true;
  }
  if (pruned) write(live);
  return new Set(Object.keys(live));
}

/** Silence one outage for `MUTE_MS`, returning the epoch-ms it wakes at. */
export function muteOutage(id: string, now: number = Date.now()): number {
  const until = now + MUTE_MS;
  const live: MuteMap = {};
  for (const [existing, expiry] of Object.entries(read())) {
    if (expiry > now) live[existing] = expiry;
  }
  live[id] = until;
  write(live);
  return until;
}

/** Test/reset door: forget every mute. Never called from the UI. */
export function clearMutes(): void {
  try {
    window.localStorage.removeItem(MUTE_KEY);
  } catch {
    // Nothing to do: an unremovable key expires on its own.
  }
}

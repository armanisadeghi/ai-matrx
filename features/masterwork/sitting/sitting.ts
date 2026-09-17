// features/masterwork/sitting/sitting.ts
//
// THE SITTING — the one place a Masterwork play surface writes down the round
// the Expert is in the middle of, so a reload, a phone going to sleep, or a
// closed tab never erases it.
//
// ## Why this is a shared primitive and not a per-lane trick
//
// Cold walk 4 (2026-09-16, finding 2) found the Triad game erasing an answered
// round on reload, and it was fixed there — by hand, inside `TriadGamePage`.
// Cold walk 5, the next day, found the EXACT same defect on the Sorting Table:
// five real cases sorted, a reload, and the screen back on "Sort the pile, then
// we'll find the line" with no banner, no partial progress, and nothing on
// screen admitting the sitting had ever happened. Two lanes, one defect, fixed
// once in one of them — which is the definition of fixing the instance instead
// of the class. So the mechanism lives here, both lanes call it, and the next
// play surface inherits it instead of rediscovering the bug.
//
// ## What a sitting is, and what it is NOT
//
// It holds ONLY what is already on the Expert's screen: the items dealt, where
// she is in them, and what each answer came back with. Nothing here is a source
// of truth — the rules live on the Rulebook and the answers live in their own
// durable runs on the server. This exists so the SCREEN does not lie about work
// that happened.
//
// A browser that refuses storage is allowed to: every call is wrapped, a
// refusal degrades to "this sitting cannot be picked up again", and it is never
// a reason to fail to deal.

/** A sitting older than this is a stale board, not a session someone is in. */
export const SITTING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Every stored sitting carries the moment it was written. */
export interface SittingBase {
  savedAt: number;
}

export interface SittingStore<T extends SittingBase> {
  /** The sitting for this scope, or null when there is nothing honest to show. */
  read(scopeId: string): T | null;
  /** Stamps `savedAt` and writes. Never throws. */
  write(scopeId: string, sitting: Omit<T, "savedAt">): void;
  clear(scopeId: string): void;
}

/**
 * One localStorage-backed sitting store per lane.
 *
 * @param keyPrefix  a versioned, lane-owned prefix — bump the version rather
 *                   than reshaping what an old key holds.
 * @param isUsable   the lane's own answer to "is there actually a round in
 *                   here?" — a stored setup screen is not a sitting.
 */
export function createSittingStore<T extends SittingBase>(opts: {
  keyPrefix: string;
  isUsable: (sitting: T) => boolean;
  maxAgeMs?: number;
}): SittingStore<T> {
  const maxAge = opts.maxAgeMs ?? SITTING_MAX_AGE_MS;
  const keyFor = (scopeId: string) => opts.keyPrefix + scopeId;
  return {
    read(scopeId) {
      try {
        const raw = window.localStorage.getItem(keyFor(scopeId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as T;
        if (!parsed || typeof parsed !== "object") return null;
        if (!Number.isFinite(parsed.savedAt)) return null;
        if (Date.now() - parsed.savedAt > maxAge) return null;
        if (!opts.isUsable(parsed)) return null;
        return parsed;
      } catch {
        return null;
      }
    },
    write(scopeId, sitting) {
      try {
        window.localStorage.setItem(
          keyFor(scopeId),
          JSON.stringify({ ...sitting, savedAt: Date.now() }),
        );
      } catch {
        /* storage refused — see read() */
      }
    },
    clear(scopeId) {
      try {
        window.localStorage.removeItem(keyFor(scopeId));
      } catch {
        /* storage refused — see read() */
      }
    },
  };
}

/**
 * What a picked-up sitting says for itself, in the Expert's own terms.
 *
 * Pure, so the sentence is testable without a browser. Every lane says the same
 * three things in the same order: where you were, what you had already done,
 * and — the part that matters most — what was still in flight when you left,
 * because that is the work she would otherwise redo.
 */
export function describeResumedSitting(facts: {
  /** Zero-based position in the round. */
  index: number;
  total: number;
  answered: number;
  /** Answers that were mid-save when the tab went away. */
  inFlight: number;
  /** What one item is called here — "card", "case", "question". */
  itemNoun: string;
  /** Completes "You had reached the end of …". */
  endedPhrase: string;
  /** Completes "…rather than …" — e.g. "playing those cards again". */
  redoPhrase: string;
  /** Completes ", after … N" — "answering" unless the lane does something else
   *  with an item, like sorting it. */
  answeredVerb?: string;
}): string {
  const where =
    facts.index >= facts.total
      ? `You had reached the end of ${facts.endedPhrase}`
      : `You were on ${facts.itemNoun} ${facts.index + 1} of ${facts.total}`;
  const answered =
    facts.answered > 0
      ? `, after ${facts.answeredVerb ?? "answering"} ${facts.answered}`
      : "";
  const flight =
    facts.inFlight > 0
      ? ` ${facts.inFlight === 1 ? "One answer was" : `${facts.inFlight} answers were`} still being turned into rules when you left — that work carried on without you, so check your Rulebook rather than ${facts.redoPhrase}.`
      : "";
  return `${where}${answered}. Picked up where you left off.${flight}`;
}

/**
 * A save that was in flight when the tab went away cannot be reported as
 * "saved" — this browser never heard the answer — and it cannot be reported as
 * lost either, because the server detaches that work and finishes it. It is
 * reported as what it is: landed, nothing this browser can count, and the
 * resume sentence above carries the remedy.
 */
export function settleInFlightSaves<S extends { kind: string }>(
  saveStates: Record<string, S>,
  landed: (id: string, state: S) => S,
): Record<string, S> {
  return Object.fromEntries(
    Object.entries(saveStates).map(([id, state]) => [
      id,
      state.kind === "saving" ? landed(id, state) : state,
    ]),
  );
}

/** How many answers were mid-save when the sitting was written. */
export function countInFlight(saveStates: Record<string, { kind: string }>): number {
  return Object.values(saveStates).filter((state) => state.kind === "saving").length;
}

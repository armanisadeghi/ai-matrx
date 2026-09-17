/**
 * features/capture-ladder/ladderOutcome.ts
 *
 * Reading the capture ladder off a scrape result, and the ONE selection rule
 * for "send the rest to my browser". CONTRACT.md §2 and §8.2.
 *
 * ── Where these fields come from, and what is actually live ────────────────
 *
 * The server's `ScrapeResult` dataclass
 * (`aidream/packages/matrx-scraper/matrx_scraper/orchestrator.py`) carries
 * `rung_trail`, `next_rung`, `next_rung_reason`, `next_rung_note`,
 * `next_rung_what_to_do`, `next_rung_estimated_seconds` and `stopped_because`,
 * and `ScrapeResult.to_dict()` emits every field that is not `None` while
 * `apply_field_flags()` (scrape_options.py) only ever REMOVES a short denylist
 * that none of them are on. So all seven reach the wire on `/quick-scrape` the
 * moment that build is deployed. VERIFIED BY READING THE SERVER SOURCE, not by
 * calling the endpoint: the ladder half of aidream is being built by a sibling
 * lane right now and is not live yet.
 *
 * Which is exactly why EVERY field below is optional and every reader is a
 * narrowing type guard. A response that predates the ladder carries none of
 * them, and the honest answer to that is `null` — a screen then shows the
 * engine provenance it already had and says nothing about rungs, rather than
 * inventing a rung nobody ran.
 *
 * Nothing here talks to the network and nothing here renders. The handoff POST
 * lives in `sendToOwnBrowser.ts`; the rendering lives on the batch screen.
 */

import {
  asRung,
  asStopCause,
  isRung,
  RUNG_LABEL,
  STOP_CAUSE_SENTENCE,
  type LadderOutcome,
  type Rung,
  type RungTrailEntry,
} from "@/features/capture-ladder/types";

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** One trail entry, or `null` when it is not one. Never throws. */
function readTrailEntry(value: unknown): RungTrailEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const rung = asRung(raw.rung);
  if (!rung) return null;
  return {
    rung,
    ok: raw.ok === true,
    reason: str(raw.reason),
    note: str(raw.note),
    chars: num(raw.chars) ?? 0,
    at: str(raw.at) ?? "",
  };
}

/**
 * Read the ladder half off a raw scrape-result object.
 *
 * Returns `null` when the server said NOTHING about the ladder — which is the
 * truthful answer for every response older than the ladder build, and the
 * difference between "this page stopped at rung 1" and "we do not know what
 * this page did".
 */
export function readLadderOutcome(
  raw: Record<string, unknown> | null | undefined,
): LadderOutcome | null {
  if (!raw) return null;

  const trailRaw = Array.isArray(raw.rung_trail) ? raw.rung_trail : null;
  const rung_trail = trailRaw
    ? trailRaw
        .map(readTrailEntry)
        .filter((entry): entry is RungTrailEntry => entry !== null)
    : null;

  const next_rung = asRung(raw.next_rung);
  const stopped_because = asStopCause(raw.stopped_because);
  const next_rung_reason = str(raw.next_rung_reason);
  const next_rung_note = str(raw.next_rung_note);
  const next_rung_what_to_do = str(raw.next_rung_what_to_do);
  const next_rung_estimated_seconds = num(raw.next_rung_estimated_seconds);

  const saidSomething =
    (rung_trail !== null && rung_trail.length > 0) ||
    next_rung !== null ||
    stopped_because !== null ||
    next_rung_reason !== null ||
    next_rung_note !== null;

  if (!saidSomething) return null;

  return {
    rung_trail,
    next_rung,
    next_rung_reason,
    next_rung_note,
    next_rung_what_to_do,
    next_rung_estimated_seconds,
    stopped_because,
  };
}

/** The last rung actually attempted, or `null` when the trail is empty. */
export function lastRungAttempted(outcome: LadderOutcome | null): Rung | null {
  const trail = outcome?.rung_trail;
  if (!trail || trail.length === 0) return null;
  const last = trail[trail.length - 1];
  return isRung(last.rung) ? last.rung : null;
}

/**
 * The Rung cell, in the person's words. Every sentence here is either the
 * SERVER's own (`next_rung_note`) or the contract's standing wording — this
 * module never invents an explanation for a particular page.
 */
export interface RungSentence {
  /** Where it got to. Always present when there is an outcome at all. */
  reached: string;
  /** What happens next, or why nothing does. `null` when the page succeeded. */
  next: string | null;
  /** `true` when the next thing is the person's own browser. */
  waitingOnYou: boolean;
}

/**
 * 🚨 §2's law, rendered: a failed result carries EITHER `next_rung` OR
 * `stopped_because`, never neither. When a result arrives with neither, this
 * does not paper over it with a blank cell — it says so, because that silent
 * skip is the whole defect class the ladder exists to make impossible, and a
 * screen that hides it is how it would survive.
 */
export function describeRung(
  outcome: LadderOutcome | null,
  succeeded: boolean,
): RungSentence | null {
  if (!outcome) return null;

  const reachedRung = lastRungAttempted(outcome);
  const reached = reachedRung
    ? RUNG_LABEL[reachedRung]
    : "We have no record of which step ran";

  if (succeeded) return { reached, next: null, waitingOnYou: false };

  if (outcome.next_rung) {
    return {
      reached,
      next:
        outcome.next_rung_note ??
        `Next: ${RUNG_LABEL[outcome.next_rung].toLowerCase()}.`,
      waitingOnYou: outcome.next_rung === "own_browser",
    };
  }

  if (outcome.stopped_because) {
    return {
      reached,
      next:
        outcome.next_rung_note ?? STOP_CAUSE_SENTENCE[outcome.stopped_because],
      waitingOnYou: false,
    };
  }

  return {
    reached,
    next: "This page failed without saying what comes next — that is a fault on our side, not yours. It has been recorded.",
    waitingOnYou: false,
  };
}

// ---------------------------------------------------------------------------
// THE SELECTION RULE — "Send the rest to my browser"
// ---------------------------------------------------------------------------

/** The minimum a row needs to be considered. Deliberately structural. */
export interface LadderCandidate {
  url: string;
  ladder: LadderOutcome | null;
}

/**
 * THE ONE PREDICATE. A row may be sent to the person's own browser if, and
 * only if, the SERVER said `next_rung === "own_browser"` for it.
 *
 * Not "it failed", not "it looks like a login wall", not "the trail ends at
 * browser" — those are inferences, and inferring the next rung on the client is
 * how a rung gets skipped. The server owns the ladder law; this asks it.
 */
export function stoppedAtOwnBrowser(row: LadderCandidate): boolean {
  return row.ladder?.next_rung === "own_browser";
}

/** Thrown when a selection contains a row the server did not send to rung 3. */
export class NotAnOwnBrowserRowError extends Error {
  readonly url: string;
  constructor(url: string, said: string) {
    super(
      `"${url}" cannot be sent to your browser: the server said its next step is ${said}, not your own browser. Sending it anyway would skip a rung.`,
    );
    this.name = "NotAnOwnBrowserRowError";
    this.url = url;
  }
}

function saidWhat(row: LadderCandidate): string {
  if (!row.ladder) return "nothing at all";
  if (row.ladder.next_rung) return `“${row.ladder.next_rung}”`;
  if (row.ladder.stopped_because)
    return `that the ladder stopped (${row.ladder.stopped_because})`;
  return "nothing at all";
}

/**
 * The URLs "Send the rest to my browser" may post, and NO OTHERS.
 *
 * Two mechanisms on purpose, because one of them is a filter and a filter is
 * one typo away from being the wrong filter:
 *   1. it selects only rows the server sent to `own_browser`;
 *   2. it then RE-CHECKS every row it is about to return and throws if any one
 *      of them is not such a row.
 *
 * (2) is not belt-and-braces — it is the ladder law asserted on the client, the
 * same way `assertNoSkippedRung` asserts it on a trail. An inverted or widened
 * filter in (1) cannot reach the network past (2); it fails loudly at the
 * button instead of quietly queueing pages a person's browser was never asked
 * to open.
 *
 * @throws {NotAnOwnBrowserRowError}
 */
export function selectOwnBrowserUrls(
  rows: readonly LadderCandidate[],
): string[] {
  const chosen = rows.filter(stoppedAtOwnBrowser);

  // The re-check reads the field LITERALLY rather than calling the predicate
  // above. Sharing the predicate would make this tautological — a widened
  // predicate would widen the check with it — and a guard that cannot disagree
  // with the thing it guards is decoration.
  for (const row of chosen) {
    if (row.ladder?.next_rung !== "own_browser") {
      throw new NotAnOwnBrowserRowError(row.url, saidWhat(row));
    }
  }

  // One page queued once, in the order the person sees it.
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const row of chosen) {
    if (seen.has(row.url)) continue;
    seen.add(row.url);
    urls.push(row.url);
  }
  return urls;
}

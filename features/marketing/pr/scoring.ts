/**
 * The Press Room's decision maths — pure, so every surface that shows a number
 * shows the SAME number, and so the reasoning can be printed to the user.
 *
 * Five 0–100 scores per angle rendered naively is noise (the brief's words, and
 * it is true). The resolution is a hierarchy, not a hiding place:
 *
 *   1. ONE headline number, "Pitch readiness", with a fixed, STATED weighting.
 *   2. A five-bar COMB beside it — a shape the eye compares across twenty rows
 *      in one sweep without reading a single digit. All five stored scores are
 *      on it, `evidence_quality` included, so nothing on the row is hidden.
 *   3. The five again, labelled, weighted and in the open, inside the expanded
 *      row — because a hover is not a door on a touch screen.
 *
 * `priority` is on the comb but carries weight ZERO, and says so. It is not a
 * readiness signal: it is the ORDER of the queue. Folding it into readiness
 * would count the same judgement twice.
 *
 * The weights are deliberately un-configurable. A readiness number the user can
 * tune is a number they can no longer compare between angles.
 */

import { readLadder } from "@/features/marketing/pr/ladder";
import type { SourceRequest, StoryAngle } from "@/features/marketing/pr/types";

// ─── Pitch readiness ────────────────────────────────────────────────────────

export type ScoreKey =
  | "newsworthiness"
  | "evidence_quality"
  | "timeliness"
  | "confidence"
  | "priority";

export interface ScoreSpec {
  key: ScoreKey;
  label: string;
  /** Contribution to the composite. The four readiness axes sum to 1. */
  weight: number;
  /** What a low value on this axis actually means, in plain language. */
  low: string;
  /** What a high value means. */
  high: string;
}

export const SCORE_MODEL: readonly ScoreSpec[] = [
  {
    key: "newsworthiness",
    label: "Newsworthy",
    weight: 0.3,
    high: "A journalist would care about this on its own merits.",
    low: "Interesting to you, not yet interesting to a newsroom.",
  },
  {
    key: "evidence_quality",
    label: "Proven",
    weight: 0.28,
    high: "The proof behind it is strong and checkable.",
    low: "The proof is thin — see what is still missing below.",
  },
  {
    key: "timeliness",
    label: "Timely",
    weight: 0.24,
    high: "There is a reason to run it this week, not someday.",
    low: "No hook to today — this one waits for its moment.",
  },
  {
    key: "confidence",
    label: "Confident",
    weight: 0.18,
    high: "We are sure the analysis behind this angle is right.",
    low: "We are guessing more than we would like.",
  },
  {
    key: "priority",
    label: "Priority",
    // Deliberately zero: priority sets the ORDER of the queue, not readiness.
    weight: 0,
    high: "Highest return for the effort this will take you.",
    low: "Real, but other angles pay back faster.",
  },
] as const;

/** The four axes that actually make up the composite. */
export const READINESS_AXES = SCORE_MODEL.filter((spec) => spec.weight > 0);

export function scoreValue(angle: StoryAngle, key: ScoreKey): number {
  return clamp(angle[key]);
}

function clamp(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** The one number a row shows. Deterministic, explained in the open row. */
export function pitchReadiness(angle: StoryAngle): number {
  const total = READINESS_AXES.reduce(
    (sum, spec) => sum + scoreValue(angle, spec.key) * spec.weight,
    0,
  );
  return Math.round(total);
}

export type ScoreTone = "strong" | "fair" | "weak";

export function scoreTone(value: number): ScoreTone {
  if (value >= 70) return "strong";
  if (value >= 45) return "fair";
  return "weak";
}

/**
 * The sentence under the breakdown. Not a restatement of the number — the
 * reason the number is what it is, taken from the weakest weighted axis.
 */
export function weakestAxis(angle: StoryAngle): ScoreSpec {
  return [...READINESS_AXES].sort(
    (a, b) =>
      scoreValue(angle, a.key) * a.weight - scoreValue(angle, b.key) * b.weight,
  )[0];
}

// ─── Proof, as a number the strip and the pill can share ────────────────────

export interface ProofProgress {
  total: number;
  inHand: number;
  gaps: number;
  percent: number;
  complete: boolean;
}

export function proofProgress(angle: StoryAngle): ProofProgress {
  const read = readLadder(angle);
  const gaps = read.total - read.held;
  return {
    total: read.total,
    inHand: read.held,
    gaps,
    percent: read.total === 0 ? 100 : Math.round((read.held / read.total) * 100),
    complete: gaps === 0,
  };
}

/** One gap away from pitchable — the cheapest work on the page. */
export function isQuickWin(angle: StoryAngle): boolean {
  const read = readLadder(angle);
  return read.total > 0 && read.total - read.held === 1;
}

// ─── Deadlines ──────────────────────────────────────────────────────────────

export type DeadlineUrgency = "critical" | "urgent" | "soon" | "later" | "past";

export interface DeadlineState {
  urgency: DeadlineUrgency;
  /** Whole minutes remaining; negative once past. */
  minutes: number;
  /** "4h 12m left" / "Closed 2h ago" / "No deadline given". */
  label: string;
  /** Short form for a dense row: "4h 12m". */
  short: string;
}

/**
 * The one genuinely time-critical thing in the product. `now` is injected so
 * the countdown is a pure function of the tick — no `Date.now()` inside a
 * render, and no hydration mismatch.
 */
export function deadlineState(
  deadlineAt: string | null,
  now: number,
): DeadlineState {
  if (!deadlineAt) {
    return {
      urgency: "later",
      minutes: Number.POSITIVE_INFINITY,
      label: "No deadline given",
      short: "—",
    };
  }
  const target = new Date(deadlineAt).getTime();
  if (!Number.isFinite(target)) {
    return {
      urgency: "later",
      minutes: Number.POSITIVE_INFINITY,
      label: "Deadline unreadable",
      short: "—",
    };
  }
  const minutes = Math.round((target - now) / 60_000);
  if (minutes <= 0) {
    return {
      urgency: "past",
      minutes,
      label: `Closed ${describeSpan(-minutes)} ago`,
      short: "Closed",
    };
  }
  const short = describeSpan(minutes);
  return {
    urgency:
      minutes <= 6 * 60
        ? "critical"
        : minutes <= 24 * 60
          ? "urgent"
          : minutes <= 72 * 60
            ? "soon"
            : "later",
    minutes,
    label: `${short} left`,
    short,
  };
}

function describeSpan(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

// ─── Queue ordering ─────────────────────────────────────────────────────────

const STATUS_RANK: Record<string, number> = {
  developing: 0,
  accepted: 1,
  proposed: 2,
  pitched: 3,
  landed: 4,
  dismissed: 5,
};

/**
 * The ranked work queue, Linear-style: live work first, then priority, then
 * readiness as the tie-break. Ordering is deliberate and stable — a queue that
 * reshuffles between renders is a queue nobody trusts.
 */
export function rankAngles(angles: readonly StoryAngle[]): StoryAngle[] {
  return [...angles].sort((a, b) => {
    const statusDelta =
      (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
    if (statusDelta !== 0) return statusDelta;
    if (b.priority !== a.priority) return b.priority - a.priority;
    const readiness = pitchReadiness(b) - pitchReadiness(a);
    if (readiness !== 0) return readiness;
    return a.headline.localeCompare(b.headline);
  });
}

/** Requests sort by what closes first; closed ones fall to the bottom. */
export function rankRequests(
  requests: readonly SourceRequest[],
  now: number,
): SourceRequest[] {
  return [...requests].sort((a, b) => {
    const aState = deadlineState(a.deadline_at, now);
    const bState = deadlineState(b.deadline_at, now);
    const aDead = aState.urgency === "past" ? 1 : 0;
    const bDead = bState.urgency === "past" ? 1 : 0;
    if (aDead !== bDead) return aDead - bDead;
    if (aState.minutes !== bState.minutes) return aState.minutes - bState.minutes;
    return b.match_score - a.match_score;
  });
}

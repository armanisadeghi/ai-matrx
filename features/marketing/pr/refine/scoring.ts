/**
 * The Press Room's decision maths — pure, so every surface that shows a number
 * shows the SAME number, and so the reasoning can be printed to the user.
 *
 * Five 0–100 scores per angle rendered naively is noise (the brief's words, and
 * it is true: five bar charts per row is a chart nobody reads). The resolution
 * here is a hierarchy, not a hiding place:
 *
 *   1. `priority` is not a score to the user — it is the ORDER of the queue.
 *   2. The other four collapse into ONE headline number, "Pitch readiness",
 *      with a fixed, stated weighting.
 *   3. The four survive as a four-bar micro-meter with a fixed footprint, and
 *      in full, labelled, with their weights, in the expanded row.
 *
 * Nothing is hidden behind a control the user has to find: the composite is
 * always visible, the parts are always visible as a meter, and the explanation
 * is one hover away — and also spelled out in prose when the row is open.
 */

import type { SourceRequest, StoryAngle } from "@/features/marketing/pr/refine/types";
import { jsonRecords } from "@/features/marketing/pr/refine/types";

// ─── Pitch readiness ────────────────────────────────────────────────────────

export interface ScorePart {
  key: "newsworthiness" | "timeliness" | "evidence_quality" | "confidence";
  label: string;
  /** What a low value on this axis actually means, in plain language. */
  meaning: string;
  weight: number;
  value: number;
}

/**
 * Weights are declared once, here, and are rendered to the user verbatim.
 * They are deliberately un-configurable: a readiness number the user can tune
 * is a number they can no longer compare between angles.
 */
export const READINESS_WEIGHTS: ReadonlyArray<Omit<ScorePart, "value">> = [
  {
    key: "newsworthiness",
    label: "Newsworthy",
    meaning: "How likely a reporter is to care at all",
    weight: 0.3,
  },
  {
    key: "evidence_quality",
    label: "Proven",
    meaning: "How much of it you can already back up",
    weight: 0.28,
  },
  {
    key: "timeliness",
    label: "Timely",
    meaning: "Whether this is a story this week or any week",
    weight: 0.24,
  },
  {
    key: "confidence",
    label: "Confident",
    meaning: "How sure the analysis is about this angle",
    weight: 0.18,
  },
];

export function scoreParts(angle: StoryAngle): ScorePart[] {
  return READINESS_WEIGHTS.map((part) => ({
    ...part,
    value: clamp(angle[part.key]),
  }));
}

export function pitchReadiness(angle: StoryAngle): number {
  const parts = scoreParts(angle);
  const total = parts.reduce((sum, part) => sum + part.value * part.weight, 0);
  return Math.round(total);
}

function clamp(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export type ScoreTone = "strong" | "fair" | "weak";

export function scoreTone(value: number): ScoreTone {
  if (value >= 70) return "strong";
  if (value >= 45) return "fair";
  return "weak";
}

// ─── Proof ──────────────────────────────────────────────────────────────────

export interface ProofProgress {
  required: number;
  /** Required minus still-missing, floored at 0. */
  inHand: number;
  missing: number;
  /** 0–100. 100 when nothing is required (an angle that needs no proof). */
  percent: number;
  /** True when the angle is provable today. */
  complete: boolean;
}

/**
 * Proof is progress, never an error. An angle with 2 of 6 proofs is a to-do
 * list with four items on it — which is exactly what a business owner who has
 * never done PR needs to be handed.
 */
export function proofProgress(angle: StoryAngle): ProofProgress {
  const required = jsonRecords(angle.proof_required).length;
  const missing = jsonRecords(angle.missing_evidence).length;
  if (required === 0) {
    return {
      required: 0,
      inHand: 0,
      missing,
      percent: missing === 0 ? 100 : 0,
      complete: missing === 0,
    };
  }
  const inHand = Math.max(0, required - missing);
  return {
    required,
    inHand,
    missing,
    percent: Math.round((inHand / required) * 100),
    complete: missing === 0,
  };
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

/**
 * The Press Room — the decision model.
 *
 * The brief's hardest constraint: "Four 0–100 numbers per row will look like
 * noise if rendered naively — solve that." This file is the solve. Every score
 * the UI shows is computed HERE, once, from the row — never re-derived in a
 * component, never rendered as five bare integers in a row.
 *
 * The shape of the answer:
 *   1. ONE number in the list row (`pressScore`) — a weighted read of all five.
 *   2. A five-bar comb beside it — shape, not digits, so the eye compares rows.
 *   3. The full breakdown ONLY in the detail panel, with the weight and the
 *      sentence that says what the number MEANS for the next action.
 *
 * Weights are stated, not hidden. `SCORE_MODEL` is the single source for the
 * label, the weight, and the plain-language reading of every score, so the comb,
 * the breakdown table, and the tooltip can never drift.
 */

import type {
  AngleStatus,
  AngleType,
  Endowment,
  RecommendedAction,
  SourcePlatform,
  SourceRequestRow,
  SourceRequestStatus,
  StoryAngleRow,
} from "./types";

/* ── the five scores ─────────────────────────────────────────────────────── */

export type ScoreKey =
  | "newsworthiness"
  | "timeliness"
  | "priority"
  | "evidence_quality"
  | "confidence";

export interface ScoreSpec {
  key: ScoreKey;
  label: string;
  /** Contribution to the composite. Sums to 1. */
  weight: number;
  /** What a HIGH value means, in the operator's language. */
  high: string;
  /** What a LOW value means — the actionable half. */
  low: string;
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
    key: "timeliness",
    label: "Timely",
    weight: 0.25,
    high: "There is a reason to run it this month, not someday.",
    low: "No hook to today — this one waits for its moment.",
  },
  {
    key: "priority",
    label: "Priority",
    weight: 0.2,
    high: "Highest return for the effort it will take you.",
    low: "Real, but other angles pay back faster.",
  },
  {
    key: "evidence_quality",
    label: "Evidence",
    weight: 0.15,
    high: "The proof behind it is strong and checkable.",
    low: "The proof is thin — see what is still missing.",
  },
  {
    key: "confidence",
    label: "Confidence",
    weight: 0.1,
    high: "We are sure the analysis behind this is right.",
    low: "We are guessing more than we would like.",
  },
] as const;

export function scoreValue(angle: StoryAngleRow, key: ScoreKey): number {
  return clamp(angle[key]);
}

function clamp(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** The one number a row shows. Deterministic, explained in the detail panel. */
export function pressScore(angle: StoryAngleRow): number {
  const total = SCORE_MODEL.reduce(
    (sum, spec) => sum + scoreValue(angle, spec.key) * spec.weight,
    0,
  );
  return Math.round(total);
}

export type ScoreBand = "strong" | "solid" | "weak";

export function scoreBand(value: number): ScoreBand {
  if (value >= 70) return "strong";
  if (value >= 45) return "solid";
  return "weak";
}

/**
 * The sentence under the composite. Not a restatement of the number — the
 * reason the number is what it is, taken from the weakest weighted score.
 */
export function weakestScore(angle: StoryAngleRow): ScoreSpec {
  return [...SCORE_MODEL].sort(
    (a, b) =>
      scoreValue(angle, a.key) * a.weight - scoreValue(angle, b.key) * b.weight,
  )[0];
}

/* ── vocabulary ──────────────────────────────────────────────────────────── */

export const ENDOWMENT_COPY: Record<Endowment, { label: string; hint: string }> =
  {
    data: { label: "Data", hint: "You sit on numbers nobody else has." },
    expertise: { label: "Expertise", hint: "You know what others get wrong." },
    media: { label: "Media", hint: "You can show it, not just say it." },
    process: { label: "Process", hint: "How you do it is the story." },
    people: { label: "People", hint: "Someone here is the story." },
    place: { label: "Place", hint: "Where you operate is the story." },
    capital: { label: "Capital", hint: "Money moved — that is reportable." },
    demand: { label: "Demand", hint: "What customers are asking for shifted." },
    code: { label: "Code", hint: "You built something others can inspect." },
  };

export const ANGLE_TYPE_LABEL: Record<AngleType, string> = {
  data_story: "Data story",
  expertise: "Expert take",
  milestone: "Milestone",
  trend_commentary: "Trend commentary",
  contrarian: "Contrarian",
  customer_impact: "Customer impact",
  process: "Behind the process",
  people: "People",
  seasonal: "Seasonal",
  research: "Original research",
  local_impact: "Local impact",
};

export interface ActionSpec {
  label: string;
  /** The verb on the button this action produces. */
  cta: string;
  /** Why the system is telling you this, in one line. */
  meaning: string;
  tone: "go" | "build" | "wait" | "ask" | "park";
}

export const ACTION_COPY: Record<RecommendedAction, ActionSpec> = {
  pitch_now: {
    label: "Pitch now",
    cta: "Find who wants it",
    meaning: "Provable, timely, and ready to go out today.",
    tone: "go",
  },
  develop_evidence: {
    label: "Get the proof",
    cta: "Work the evidence",
    meaning: "The story is good. The proof is not there yet.",
    tone: "build",
  },
  hold_for_timing: {
    label: "Hold for timing",
    cta: "Keep it warm",
    meaning: "Real story, wrong week. It has a date to wait for.",
    tone: "wait",
  },
  needs_expert_input: {
    label: "Needs your take",
    cta: "Answer the open question",
    meaning: "Only you can supply the missing piece.",
    tone: "ask",
  },
  park: {
    label: "Parked",
    cta: "Bring it back",
    meaning: "Kept on the shelf. Not worth effort right now.",
    tone: "park",
  },
};

export const ANGLE_STATUS_LABEL: Record<AngleStatus, string> = {
  proposed: "Proposed",
  accepted: "Accepted",
  developing: "Developing",
  pitched: "Pitched",
  landed: "Landed",
  dismissed: "Dismissed",
};

export const SOURCE_STATUS_LABEL: Record<SourceRequestStatus, string> = {
  new: "New",
  matched: "Matched",
  drafted: "Draft ready",
  submitted: "Submitted",
  won: "Won",
  passed: "Passed",
  expired: "Expired",
};

export const PLATFORM_LABEL: Record<SourcePlatform, string> = {
  haro: "HARO",
  qwoted: "Qwoted",
  featured: "Featured",
  sourcebottle: "SourceBottle",
  source_of_sources: "Source of Sources",
  journorequest: "#journorequest",
  mentionmatch: "MentionMatch",
  responsesource: "ResponseSource",
  other: "Other",
};

/** Narrow an unconstrained DB string to a known key, or fall back loudly. */
export function keyOf<T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T,
): T {
  return (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/* ── deadlines: the one genuinely time-critical thing here ───────────────── */

export type Urgency = "expired" | "critical" | "today" | "soon" | "later";

export interface DeadlineRead {
  urgency: Urgency;
  /** "4h 20m left", "Closed 2h ago", "No deadline given". */
  label: string;
  msLeft: number | null;
}

export function readDeadline(
  deadlineAt: string | null,
  now: Date,
): DeadlineRead {
  if (!deadlineAt) {
    return { urgency: "later", label: "No deadline given", msLeft: null };
  }
  const at = new Date(deadlineAt).getTime();
  if (!Number.isFinite(at)) {
    return { urgency: "later", label: "Deadline unreadable", msLeft: null };
  }
  const msLeft = at - now.getTime();
  if (msLeft <= 0) {
    return {
      urgency: "expired",
      label: `Closed ${formatSpan(-msLeft)} ago`,
      msLeft,
    };
  }
  const hours = msLeft / 3_600_000;
  const urgency: Urgency =
    hours <= 6 ? "critical" : hours <= 24 ? "today" : hours <= 72 ? "soon" : "later";
  return { urgency, label: `${formatSpan(msLeft)} left`, msLeft };
}

function formatSpan(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
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

/** Requests that are still actionable and closing — the rail's contents. */
export function isLiveRequest(row: SourceRequestRow): boolean {
  return ["new", "matched", "drafted"].includes(row.status);
}

export function formatDay(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatDayTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

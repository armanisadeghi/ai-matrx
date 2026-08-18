/**
 * The Press Room — row types and pure derivations.
 *
 * The row types ARE the generated Supabase types. Nothing here widens, mirrors
 * or re-declares a column: when `python db/generate.py` / `pnpm db-types` runs
 * again, this file breaks loudly instead of drifting silently.
 *
 * Everything below the type aliases is a PURE function of a row. No component
 * in this feature computes a score, a deadline bucket, or an evidence tally —
 * they all call in here, so the console and a future server-side ranker cannot
 * disagree about what "urgent" or "provable" means.
 */

import type { Database, Json } from "@/types/database.types";

export type StoryAngleRow = Database["seo"]["Tables"]["story_angle"]["Row"];
export type SourceRequestRow =
  Database["seo"]["Tables"]["source_request"]["Row"];
export type CoverageMentionRow =
  Database["seo"]["Tables"]["coverage_mention"]["Row"];

/* ────────────────────────────────────────────────────────────────────────────
 * CHECK-constraint vocabularies — mirrored from the live constraints so the
 * facet rail can enumerate every possible value, including the ones that have
 * zero rows today (a facet that only lists what happens to be loaded lies
 * about what the pipeline can contain).
 * ──────────────────────────────────────────────────────────────────────────── */

export const ENDOWMENTS = [
  "data",
  "expertise",
  "media",
  "process",
  "people",
  "place",
  "capital",
  "demand",
  "code",
] as const;
export type Endowment = (typeof ENDOWMENTS)[number];

export const ANGLE_TYPES = [
  "data_story",
  "expertise",
  "milestone",
  "trend_commentary",
  "contrarian",
  "customer_impact",
  "process",
  "people",
  "seasonal",
  "research",
  "local_impact",
] as const;
export type AngleType = (typeof ANGLE_TYPES)[number];

export const RECOMMENDED_ACTIONS = [
  "pitch_now",
  "develop_evidence",
  "hold_for_timing",
  "needs_expert_input",
  "park",
] as const;
export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

export const ANGLE_STATUSES = [
  "proposed",
  "accepted",
  "developing",
  "pitched",
  "landed",
  "dismissed",
] as const;
export type AngleStatus = (typeof ANGLE_STATUSES)[number];

export const REQUEST_PLATFORMS = [
  "haro",
  "qwoted",
  "featured",
  "sourcebottle",
  "source_of_sources",
  "journorequest",
  "mentionmatch",
  "responsesource",
  "other",
] as const;
export type RequestPlatform = (typeof REQUEST_PLATFORMS)[number];

export const REQUEST_STATUSES = [
  "new",
  "matched",
  "drafted",
  "submitted",
  "won",
  "passed",
  "expired",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Human wording. Machine values stay the source of truth for tone/logic. */
export const ENDOWMENT_LABEL: Record<string, string> = {
  data: "Data",
  expertise: "Expertise",
  media: "Media",
  process: "Process",
  people: "People",
  place: "Place",
  capital: "Capital",
  demand: "Demand",
  code: "Code",
};

export const ANGLE_TYPE_LABEL: Record<string, string> = {
  data_story: "Data story",
  expertise: "Expert take",
  milestone: "Milestone",
  trend_commentary: "Trend comment",
  contrarian: "Contrarian",
  customer_impact: "Customer impact",
  process: "How it works",
  people: "People",
  seasonal: "Seasonal",
  research: "Research",
  local_impact: "Local impact",
};

export const ACTION_LABEL: Record<string, string> = {
  pitch_now: "Pitch now",
  develop_evidence: "Get proof",
  hold_for_timing: "Hold for timing",
  needs_expert_input: "Ask the expert",
  park: "Parked",
};

/** What the operator should physically do next, in their words. */
export const ACTION_IMPERATIVE: Record<string, string> = {
  pitch_now: "Send this to a journalist this week.",
  develop_evidence: "Gather the proof below, then it is pitchable.",
  hold_for_timing: "Good angle, wrong week. It has a date attached.",
  needs_expert_input: "One question only you can answer is blocking this.",
  park: "Not worth working right now.",
};

export const PLATFORM_LABEL: Record<string, string> = {
  haro: "HARO",
  qwoted: "Qwoted",
  featured: "Featured",
  sourcebottle: "SourceBottle",
  source_of_sources: "SOS",
  journorequest: "#JournoRequest",
  mentionmatch: "MentionMatch",
  responsesource: "ResponseSource",
  other: "Other",
};

export const OUTLET_KIND_LABEL: Record<string, string> = {
  trade: "Trade",
  national: "National",
  regional: "Regional",
  local: "Local",
  podcast: "Podcast",
  newsletter: "Newsletter",
  broadcast: "Broadcast",
  blog: "Blog",
};

/* ────────────────────────────────────────────────────────────────────────────
 * jsonb[] readers — narrow, total, and never throw.
 *
 * Every one of these columns is `Json` in the generated types because Postgres
 * jsonb[] carries no shape. We read defensively: a malformed element is skipped,
 * never rendered as "[object Object]" and never allowed to crash a row.
 * ──────────────────────────────────────────────────────────────────────────── */

function asArray(value: Json): unknown[] {
  return Array.isArray(value) ? value : [];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(source: Record<string, unknown>, key: string): string | null {
  const raw = source[key];
  return typeof raw === "string" && raw.trim() ? raw : null;
}

function num(source: Record<string, unknown>, key: string): number | null {
  const raw = source[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

export interface ProofItem {
  key: string;
  claim: string;
  kind: string | null;
  why: string | null;
}

export interface MissingItem {
  key: string;
  need: string;
  how: string | null;
  owner: string | null;
  effort: "quick" | "medium" | "deep";
}

export interface FactItem {
  statement: string;
  source: string | null;
}

export interface EvidenceRefItem {
  label: string;
  url: string | null;
  kind: string | null;
}

export interface ContradictionItem {
  statement: string;
  note: string | null;
}

export function readProofRequired(value: Json): ProofItem[] {
  return asArray(value).flatMap((entry, index) => {
    const row = record(entry);
    const claim = row ? str(row, "claim") : null;
    if (!row || !claim) return [];
    return [
      {
        key: str(row, "key") ?? `proof-${index}`,
        claim,
        kind: str(row, "kind"),
        why: str(row, "why"),
      },
    ];
  });
}

export function readMissingEvidence(value: Json): MissingItem[] {
  return asArray(value).flatMap((entry, index) => {
    const row = record(entry);
    const need = row ? str(row, "need") : null;
    if (!row || !need) return [];
    const rawEffort = str(row, "effort");
    const effort: MissingItem["effort"] =
      rawEffort === "quick" || rawEffort === "deep" ? rawEffort : "medium";
    return [
      {
        key: str(row, "key") ?? `missing-${index}`,
        need,
        how: str(row, "how"),
        owner: str(row, "owner"),
        effort,
      },
    ];
  });
}

export function readFacts(value: Json): FactItem[] {
  return asArray(value).flatMap((entry) => {
    const row = record(entry);
    const statement = row ? str(row, "statement") : null;
    if (!row || !statement) return [];
    return [{ statement, source: str(row, "source") }];
  });
}

export function readInferences(value: Json): FactItem[] {
  return asArray(value).flatMap((entry) => {
    const row = record(entry);
    const statement = row ? str(row, "statement") : null;
    if (!row || !statement) return [];
    return [{ statement, source: str(row, "basis") }];
  });
}

export function readEvidenceRefs(value: Json): EvidenceRefItem[] {
  return asArray(value).flatMap((entry, index) => {
    const row = record(entry);
    if (!row) return [];
    const label = str(row, "label") ?? str(row, "url") ?? `Reference ${index + 1}`;
    return [{ label, url: str(row, "url"), kind: str(row, "kind") }];
  });
}

export function readContradictions(value: Json): ContradictionItem[] {
  return asArray(value).flatMap((entry) => {
    const row = record(entry);
    const statement = row ? str(row, "statement") : null;
    if (!row || !statement) return [];
    return [{ statement, note: str(row, "note") }];
  });
}

export function readRequirements(value: Json): string[] {
  return asArray(value).flatMap((entry) => {
    if (typeof entry === "string" && entry.trim()) return [entry];
    const row = record(entry);
    const text = row ? (str(row, "requirement") ?? str(row, "text")) : null;
    return text ? [text] : [];
  });
}

export function readAnalysisNote(value: Json, key: string): string | null {
  const row = record(value);
  return row ? str(row, key) : null;
}

export function readAnalysisScore(value: Json, key: string): number | null {
  const row = record(value);
  return row ? num(row, key) : null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The evidence ledger — the honest heart of the product.
 *
 * `proof_required` is the full list of things a journalist must be shown before
 * they will believe the angle. `missing_evidence` is the subset we do not have
 * yet, keyed back to the proof it satisfies. So "provable" is not a flag on the
 * row — it is arithmetic, and it is the same arithmetic everywhere.
 *
 * Deliberately framed as a completion count, never a failure count: an angle at
 * 3/5 is three-fifths of the way to a pitch, not two-fifths broken.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface EvidenceLedger {
  required: ProofItem[];
  missing: MissingItem[];
  /** proof items with nothing outstanding against them */
  satisfied: ProofItem[];
  /** missing items that answer no listed proof — extra homework */
  unmatchedMissing: MissingItem[];
  total: number;
  have: number;
  /** 0–1. `1` when nothing is outstanding, including a zero-proof angle. */
  ratio: number;
  /** true when a journalist could be sent this today */
  provable: boolean;
  quickWins: MissingItem[];
}

export function buildEvidenceLedger(angle: StoryAngleRow): EvidenceLedger {
  const required = readProofRequired(angle.proof_required);
  const missing = readMissingEvidence(angle.missing_evidence);
  const missingKeys = new Set(missing.map((item) => item.key));
  const requiredKeys = new Set(required.map((item) => item.key));

  const satisfied = required.filter((item) => !missingKeys.has(item.key));
  const unmatchedMissing = missing.filter((item) => !requiredKeys.has(item.key));

  const total = required.length + unmatchedMissing.length;
  const have = satisfied.length;

  return {
    required,
    missing,
    satisfied,
    unmatchedMissing,
    total,
    have,
    ratio: total === 0 ? 1 : have / total,
    provable: missing.length === 0,
    quickWins: missing.filter((item) => item.effort === "quick"),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Scores — five 0–100 smallints per angle.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ScoreSpec {
  key: "priority" | "confidence" | "newsworthiness" | "timeliness" | "evidence_quality";
  short: string;
  label: string;
  /** what a HIGH number means, in the operator's language */
  meaning: string;
}

export const SCORE_SPECS: ScoreSpec[] = [
  {
    key: "priority",
    short: "P",
    label: "Priority",
    meaning: "How much of your press effort this angle deserves.",
  },
  {
    key: "newsworthiness",
    short: "N",
    label: "Newsworthy",
    meaning: "How likely a journalist is to consider this a story at all.",
  },
  {
    key: "timeliness",
    short: "T",
    label: "Timely",
    meaning: "How much the calendar is working in your favour right now.",
  },
  {
    key: "confidence",
    short: "C",
    label: "Confidence",
    meaning: "How sure the analysis is that this angle is real.",
  },
  {
    key: "evidence_quality",
    short: "E",
    label: "Evidence",
    meaning: "How strong the proof already in hand is.",
  },
];

export function scoreValues(angle: StoryAngleRow): number[] {
  return SCORE_SPECS.map((spec) => angle[spec.key]);
}

/** Three bands, so colour carries meaning instead of decorating. */
export type Band = "strong" | "fair" | "weak";

export function band(score: number): Band {
  if (score >= 70) return "strong";
  if (score >= 40) return "fair";
  return "weak";
}

/* ────────────────────────────────────────────────────────────────────────────
 * Deadlines — the one genuinely time-critical thing on this surface.
 * ──────────────────────────────────────────────────────────────────────────── */

export type UrgencyBucket =
  | "expired"
  | "critical" // under 6h
  | "today" // under 24h
  | "soon" // under 72h
  | "later"
  | "none";

export interface Urgency {
  bucket: UrgencyBucket;
  msLeft: number | null;
  /** "4h 12m left", "overdue 2h", "no deadline" */
  label: string;
  /** short form for tight cells: "4h12m", "—" */
  compact: string;
}

export function urgencyOf(deadlineAt: string | null, now: number): Urgency {
  if (!deadlineAt) {
    return { bucket: "none", msLeft: null, label: "No deadline", compact: "—" };
  }
  const ms = new Date(deadlineAt).getTime();
  if (!Number.isFinite(ms)) {
    return { bucket: "none", msLeft: null, label: "No deadline", compact: "—" };
  }
  const left = ms - now;
  const abs = Math.abs(left);
  const minutes = Math.floor(abs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const compact =
    days > 0
      ? `${days}d ${hours % 24}h`
      : hours > 0
        ? `${hours}h ${minutes % 60}m`
        : `${minutes}m`;

  if (left <= 0) {
    return {
      bucket: "expired",
      msLeft: left,
      label: `Closed ${compact} ago`,
      compact: `-${compact}`,
    };
  }
  const bucket: UrgencyBucket =
    hours < 6 ? "critical" : hours < 24 ? "today" : hours < 72 ? "soon" : "later";
  return { bucket, msLeft: left, label: `${compact} left`, compact };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The pipeline — one ordered spine shared by the funnel rail, the board and
 * the angle timeline, so a stage can never be named in two orders.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface StageSpec {
  status: AngleStatus;
  label: string;
  /** the timestamp column that proves the row reached this stage */
  stampedBy: keyof StoryAngleRow | null;
  blurb: string;
}

export const PIPELINE: StageSpec[] = [
  {
    status: "proposed",
    label: "Proposed",
    stampedBy: "analyzed_at",
    blurb: "Found by analysis. Nobody has ruled on it yet.",
  },
  {
    status: "accepted",
    label: "Accepted",
    stampedBy: "accepted_at",
    blurb: "You said yes. It is yours to work.",
  },
  {
    status: "developing",
    label: "Developing",
    stampedBy: null,
    blurb: "Proof is being gathered before anyone pitches it.",
  },
  {
    status: "pitched",
    label: "Pitched",
    stampedBy: "pitched_at",
    blurb: "It is in a journalist's inbox.",
  },
  {
    status: "landed",
    label: "Landed",
    stampedBy: "landed_at",
    blurb: "It became coverage.",
  },
  {
    status: "dismissed",
    label: "Dismissed",
    stampedBy: "dismissed_at",
    blurb: "Ruled out, with the reason kept.",
  },
];

export function stageIndex(status: string): number {
  return PIPELINE.findIndex((stage) => stage.status === status);
}

/**
 * Coverage is tied back to the angle that produced it through
 * `coverage_mention.metadata.story_angle_id`.
 *
 * There is NO foreign key for this in the database — `coverage_mention` has no
 * `story_angle_id` column — so this reader is the whole contract, and it is
 * written to fail closed: no id in metadata means "we cannot attribute this
 * piece", which the UI says out loud rather than guessing.
 */
export function coverageAngleId(row: CoverageMentionRow): string | null {
  const meta = record(row.metadata);
  return meta ? str(meta, "story_angle_id") : null;
}

/** Percent of the way through the funnel, for the compact stage meter. */
export function funnelPosition(status: string): number {
  const index = stageIndex(status);
  if (index < 0) return 0;
  if (status === "dismissed") return 0;
  return index / 4;
}

export function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

/**
 * The Press Room — row types, the human vocabulary, and the `jsonb[]` readers.
 *
 * THE ROWS ARE THE GENERATED DB ROWS. Nothing here re-declares or widens a
 * column: every view model is derived from `Database["seo"]["Tables"][…]["Row"]`
 * so a real Supabase row and a fixture row are literally the same type, and a
 * schema change breaks the build instead of the page.
 *
 * The label maps exist because the DB stores machine values a journalist-facing
 * product must never print (`trend_commentary`, `develop_evidence`,
 * `sourcebottle`). Humanising is centralised so two surfaces can never disagree
 * on what a value is called.
 *
 * The readers exist because Postgres gives us `Json` for `proof_required`,
 * `missing_evidence`, `evidence_refs`, `facts`, `inferences`, `contradictions`
 * and `source_request.requirements` — the shape inside is a convention, not a
 * constraint. So every reader is TOTAL (it never throws), TOLERANT (a bare
 * string, or any of several key spellings, still reads), and HONEST (it counts
 * what it could not understand so the surface can say so instead of silently
 * dropping a proof requirement).
 */

import type { Database, Json } from "@/types/database.types";

type SeoTables = Database["seo"]["Tables"];

export type StoryAngle = SeoTables["story_angle"]["Row"];
export type SourceRequest = SeoTables["source_request"]["Row"];
export type CoverageMention = SeoTables["coverage_mention"]["Row"];

// ─── CHECK-constraint value sets (mirrored from the live constraints) ────────

export const ANGLE_STATUSES = [
  "proposed",
  "accepted",
  "developing",
  "pitched",
  "landed",
  "dismissed",
] as const;
export type AngleStatus = (typeof ANGLE_STATUSES)[number];

export const RECOMMENDED_ACTIONS = [
  "pitch_now",
  "develop_evidence",
  "hold_for_timing",
  "needs_expert_input",
  "park",
] as const;
export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

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

/**
 * BACKEND FACT 2. `expired` and `passed` are terminal and carry no draft and no
 * subject line — the query cannot be answered any more. A surface that offers a
 * send affordance on one of these is lying about what will happen.
 */
export const CLOSED_REQUEST_STATUSES: readonly RequestStatus[] = [
  "expired",
  "passed",
  "won",
  "submitted",
];

export function isAnswerable(request: SourceRequest): boolean {
  return !CLOSED_REQUEST_STATUSES.includes(request.status as RequestStatus);
}

// ─── Human vocabulary ───────────────────────────────────────────────────────

/**
 * The endowment answers "what do you have that a journalist can't get
 * elsewhere?" — the whole premise of the product. The description is the
 * sentence we show the user, because "process" alone means nothing to a
 * recycling-plant owner who has never pitched a reporter.
 */
export const ENDOWMENT_COPY: Record<string, { label: string; blurb: string }> = {
  data: { label: "Data", blurb: "Numbers only you hold" },
  expertise: { label: "Expertise", blurb: "Judgment reporters can quote" },
  media: { label: "Media", blurb: "Footage, photos, visuals" },
  process: { label: "Process", blurb: "A way of working worth seeing" },
  people: { label: "People", blurb: "A person with a story" },
  place: { label: "Place", blurb: "A location that anchors it" },
  capital: { label: "Capital", blurb: "Money moving somewhere" },
  demand: { label: "Demand", blurb: "What customers are asking for" },
  code: { label: "Code", blurb: "Software or tooling you built" },
};

export const ANGLE_TYPE_LABELS: Record<string, string> = {
  data_story: "Data story",
  expertise: "Expert commentary",
  milestone: "Milestone",
  trend_commentary: "Trend take",
  contrarian: "Contrarian",
  customer_impact: "Customer impact",
  process: "Behind the process",
  people: "People",
  seasonal: "Seasonal",
  research: "Original research",
  local_impact: "Local impact",
};

export const OUTLET_KIND_LABELS: Record<string, string> = {
  trade: "Trade press",
  national: "National",
  regional: "Regional",
  local: "Local",
  podcast: "Podcast",
  newsletter: "Newsletter",
  broadcast: "Broadcast",
  blog: "Blog",
};

/**
 * The recommended action is the single most decision-bearing field on an angle,
 * so it carries its own verb and its own tone. `tone` drives colour ONLY — the
 * machine value drives everything else, so a wording change can never move a
 * row into a different bucket.
 *
 * BACKEND FACT 1 shapes this copy. The producer only ever emits `pitch_now`
 * when an angle has no missing evidence, no outstanding proof requirement, no
 * contradiction and `evidence_quality >= 50`. Everything else arrives as
 * `develop_evidence` with `requires_human_review = true`. So "needs proof" is
 * the NORMAL state of a healthy account, and its copy must read as momentum.
 */
export const ACTION_COPY: Record<
  string,
  {
    label: string;
    verb: string;
    tone: "go" | "build" | "wait" | "ask" | "off";
    meaning: string;
  }
> = {
  pitch_now: {
    label: "Pitch now",
    verb: "Pitch this",
    tone: "go",
    meaning:
      "Nothing outstanding: no missing evidence, no unmet proof requirement, no contradiction. A journalist could be emailed today.",
  },
  develop_evidence: {
    label: "Building proof",
    verb: "Gather the proof",
    tone: "build",
    meaning:
      "The normal state of a live angle. The story is real; the evidence a reporter will demand is still being assembled.",
  },
  hold_for_timing: {
    label: "Hold for timing",
    verb: "Set a reminder",
    tone: "wait",
    meaning: "Good story, wrong week. It waits for its hook.",
  },
  needs_expert_input: {
    label: "Needs you",
    verb: "Answer the question",
    tone: "ask",
    meaning: "Blocked on your judgment. Nobody else in the system can answer it.",
  },
  park: {
    label: "Parked",
    verb: "Reopen",
    tone: "off",
    meaning: "Set aside on purpose. Still here when you want it.",
  },
};

export const ANGLE_STATUS_LABELS: Record<string, string> = {
  proposed: "Proposed",
  accepted: "Accepted",
  developing: "Developing",
  pitched: "Pitched",
  landed: "Landed",
  dismissed: "Dismissed",
};

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  new: "New",
  matched: "Matched",
  drafted: "Draft ready",
  submitted: "Submitted",
  won: "Won",
  passed: "Passed over",
  expired: "Expired",
};

/** What actually happened to a request that can no longer be answered. */
export const CLOSED_REQUEST_STORY: Record<string, string> = {
  expired: "The deadline passed before a response went out. Nothing was sent.",
  passed:
    "The journalist moved on — this query was closed without using a response from you.",
  submitted: "Your response is with the journalist. Nothing more to send.",
  won: "The journalist used your response. This one landed.",
};

export const PLATFORM_LABELS: Record<string, string> = {
  haro: "HARO",
  qwoted: "Qwoted",
  featured: "Featured",
  sourcebottle: "SourceBottle",
  source_of_sources: "Source of Sources",
  journorequest: "#JournoRequest",
  mentionmatch: "MentionMatch",
  responsesource: "ResponseSource",
  other: "Other",
};

/** Never print a raw machine value at a human. */
export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

// ─── jsonb[] readers ────────────────────────────────────────────────────────

/** Every reader returns this: what parsed, and how much did not. */
export interface ParsedList<T> {
  items: T[];
  /** Entries present in the column that this reader could not understand. */
  malformed: number;
}

export type ProofKind = "document" | "data" | "quote" | "third_party" | "metric";
export type GapOwner = "you" | "team" | "client" | "third_party";
export type GapEffort = "quick" | "medium" | "heavy";

/** One thing a journalist must be able to verify before they will run it. */
export interface ProofItem {
  key: string;
  label: string;
  /** What kind of artefact satisfies it — drives the icon, nothing else. */
  kind: ProofKind;
  note: string | null;
}

/** A proof we do NOT have yet. Carries its own path to being had. */
export interface MissingEvidenceItem {
  key: string;
  label: string;
  /** The concrete next move. This is what turns a gap into a to-do. */
  how_to_get: string;
  owner: GapOwner;
  effort: GapEffort;
}

/** A proof we DO have, with the thing that proves it. */
export interface EvidenceRef {
  key: string;
  label: string;
  source: string;
  url: string | null;
  captured_at: string | null;
}

export interface FactItem {
  statement: string;
  source_key: string | null;
}

export interface ContradictionItem {
  statement: string;
  detail: string | null;
}

export interface RequirementItem {
  label: string;
  met: boolean | null;
}

function asArray(value: Json): Json[] {
  return Array.isArray(value) ? value : [];
}

export function isJsonObject(value: Json): value is { [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * First present string field, in preference order. Tolerates the several key
 * spellings the analyzer and hand-entered rows both use in the wild.
 */
function str(
  record: { [key: string]: Json },
  ...keys: readonly string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function bool(record: { [key: string]: Json }, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function oneOf<T extends string>(
  record: { [key: string]: Json },
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = record[key];
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * The one loop every reader shares. An element that is a bare string is handed
 * to `read` as `{ label: <the string> }` — older rows and hand-entered rows do
 * write plain strings, and dropping them would hide real requirements.
 */
function readList<T>(
  column: Json,
  read: (record: { [key: string]: Json }, index: number) => T | null,
): ParsedList<T> {
  const items: T[] = [];
  let malformed = 0;
  for (const [index, entry] of asArray(column).entries()) {
    const record: { [key: string]: Json } | null =
      typeof entry === "string" && entry.trim() !== ""
        ? { label: entry }
        : isJsonObject(entry)
          ? entry
          : null;
    const parsed = record ? read(record, index) : null;
    if (parsed === null) malformed += 1;
    else items.push(parsed);
  }
  return { items, malformed };
}

export function readProofRequired(column: Json): ParsedList<ProofItem> {
  return readList(column, (record, index) => {
    const label = str(record, "label", "requirement", "claim", "title", "name", "text");
    if (!label) return null;
    return {
      key: str(record, "key", "id") ?? `proof_${index}`,
      label,
      kind: oneOf(
        record,
        "kind",
        ["document", "data", "quote", "third_party", "metric"] as const,
        "document",
      ),
      note: str(record, "note", "detail", "description", "why", "reason"),
    };
  });
}

export function readMissingEvidence(
  column: Json,
): ParsedList<MissingEvidenceItem> {
  return readList(column, (record, index) => {
    const label = str(record, "label", "requirement", "claim", "title", "name", "text");
    if (!label) return null;
    return {
      key: str(record, "key", "id") ?? `missing_${index}`,
      label,
      how_to_get:
        str(record, "how_to_get", "how", "next_step", "detail", "description") ??
        "No path recorded yet — the analysis did not say how to get this.",
      owner: oneOf(
        record,
        "owner",
        ["you", "team", "client", "third_party"] as const,
        "you",
      ),
      effort: oneOf(
        record,
        "effort",
        ["quick", "medium", "heavy"] as const,
        "medium",
      ),
    };
  });
}

export function readEvidenceRefs(column: Json): ParsedList<EvidenceRef> {
  return readList(column, (record, index) => {
    const label = str(record, "label", "claim", "requirement", "title", "name", "text");
    if (!label) return null;
    return {
      key: str(record, "key", "id") ?? `evidence_${index}`,
      label,
      source: str(record, "source", "source_label", "publisher", "outlet") ?? "Unattributed",
      url: str(record, "url", "href", "link", "source_url"),
      captured_at: str(record, "captured_at", "at", "date"),
    };
  });
}

export function readFacts(column: Json): ParsedList<FactItem> {
  return readList(column, (record) => {
    const statement = str(record, "statement", "label", "fact", "text");
    if (!statement) return null;
    return { statement, source_key: str(record, "source_key", "key") };
  });
}

export function readContradictions(column: Json): ParsedList<ContradictionItem> {
  return readList(column, (record) => {
    const statement = str(record, "statement", "label", "claim", "text");
    if (!statement) return null;
    return { statement, detail: str(record, "detail", "note", "why", "reason") };
  });
}

export function readRequirements(column: Json): ParsedList<RequirementItem> {
  return readList(column, (record) => {
    const label = str(record, "label", "text", "requirement");
    if (!label) return null;
    return { label, met: bool(record, "met") };
  });
}

/**
 * The Press Room — row types and the human vocabulary for `seo.story_angle`
 * and `seo.source_request`.
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
 */
export const ACTION_COPY: Record<
  string,
  { label: string; verb: string; tone: "go" | "build" | "wait" | "ask" | "off" }
> = {
  pitch_now: {
    label: "Pitch now",
    verb: "Pitch this",
    tone: "go",
  },
  develop_evidence: {
    label: "Needs proof",
    verb: "Gather the proof",
    tone: "build",
  },
  hold_for_timing: {
    label: "Hold for timing",
    verb: "Set a reminder",
    tone: "wait",
  },
  needs_expert_input: {
    label: "Needs your input",
    verb: "Answer the question",
    tone: "ask",
  },
  park: { label: "Parked", verb: "Reopen", tone: "off" },
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
  passed: "Passed",
  expired: "Expired",
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

/**
 * `proof_required`, `missing_evidence`, `evidence_refs`, `facts`, `inferences`
 * and `contradictions` are `jsonb[]` — they arrive as `Json` and each element
 * is a free-form object. These readers are the ONLY place that shape is
 * assumed, so a malformed row degrades to "nothing to show" instead of
 * throwing inside a render.
 */
export function jsonRecords(value: Json): Array<Record<string, Json>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, Json> =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
}

/** First present string field, in preference order. Never returns "". */
export function jsonText(
  record: Record<string, Json>,
  ...keys: readonly string[]
): string | null {
  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}

/** A proof item, normalised for rendering. */
export interface ProofItem {
  /** Stable key for React — the label itself, deduped by index. */
  key: string;
  label: string;
  detail: string | null;
  /** Who can close this gap: the expert, a document, or a system we can query. */
  owner: string | null;
}

export function readProofItems(value: Json, prefix: string): ProofItem[] {
  return jsonRecords(value).map((record, index) => ({
    key: `${prefix}-${index}`,
    label:
      jsonText(record, "label", "requirement", "claim", "name", "evidence") ??
      `Evidence item ${index + 1}`,
    detail: jsonText(record, "detail", "description", "note", "why", "reason"),
    owner: jsonText(record, "owner", "source", "responsible", "from"),
  }));
}

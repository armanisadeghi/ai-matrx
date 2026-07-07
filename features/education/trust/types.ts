// features/education/trust/types.ts
//
// ── THE TRUST ENVELOPE — P0 day-1 contract ──────────────────────────────────
//
// Every AI-generated study artifact in the education hub (flashcards, quiz
// items, tutor answers, audio segments, notes) carries ONE shape describing how
// grounded it is: which passages of the learner's OWN material it came from
// (`citations`), how confident the system is that it's grounded rather than
// invented (`confidence`), and against which corpus it was grounded
// (`groundedIn`). This is the market's #1 unmet want — "grounded in my material,
// cited, never confidently wrong" — surfaced as a product primitive instead of
// an implicit RAG detail.
//
// Consumers (P1 assessment, P2 tutor, P3 media, P4 notes, P9 ingest) do exactly
// ONE thing: pass `trust` through from the agent output to the render layer, and
// hand it to <SourceCitations/> / <ConfidenceBadge/>. They never re-derive it.
//
// This file is the SINGLE SOURCE OF TRUTH. The content-IR kind schemas mirror it
// (so it streams natively inside the same envelope the cards already use) and
// AGENT_SPECS.md documents the agent-side contract — but the TypeScript here is
// canonical. Do not fork a second citation/confidence shape anywhere.

/**
 * How grounded an AI output is in the learner's own material.
 *
 * - `grounded`        — every claim traces to a cited passage in the corpus.
 * - `inferred`        — reasoned FROM the material but not directly stated
 *                       (a synthesis, a worked example, a paraphrase).
 * - `not_in_material` — the answer is NOT supported by the corpus. This is the
 *                       honest-refusal signal: the surface must say so and offer
 *                       the general-knowledge escape hatch as an explicit choice,
 *                       never silently answer as if grounded.
 */
export type TrustConfidence = "grounded" | "inferred" | "not_in_material";

/** What kind of thing a citation points at (drives how the locator resolves). */
export type CitationSourceKind =
  | "document" // a processed document / uploaded file as a whole
  | "chunk" // a specific RAG / study_source_chunk passage
  | "section" // a study_structured_section
  | "file" // a raw file (file_id)
  | "url" // an external web source
  | "scope" // a scope value / context item the learner authored
  | "transcript" // a transcript segment (audio/video study source)
  | "web"; // general-knowledge / web (used only with confidence !== 'grounded')

/**
 * One resolvable pointer to the exact source passage an output was grounded in.
 *
 * `sourceId` + `sourceKind` identify WHAT; `locator` says WHERE inside it
 * (page, char range, timestamp, URL); `excerpt` is the verbatim passage so the
 * learner can tap a citation and read the exact text — and so "Verify against
 * source" can detect drift between the card and its cited passage.
 */
export interface SourceCitation {
  /** Stable id of the source: processed_document_id / chunk id / section id / file_id / url. */
  sourceId: string;
  sourceKind: CitationSourceKind;
  /** Human-resolvable position inside the source: "p. 12", "0:340-0:512", "12:04", a URL. */
  locator?: string;
  /** The verbatim passage the content was grounded in (drift-detection anchor). */
  excerpt?: string;
  /** Display label for the source (document/section title, page heading, site name). */
  title?: string;
}

/**
 * THE ENVELOPE. Attach as the `trust` field on any AI-generated education item
 * (per card, per quiz question, per tutor answer, per audio segment) and/or on
 * the containing set.
 *
 * Keep it cheap: consumers pass it through, they do not construct it — agents
 * emit it, this module's helpers coerce it, the UI renders it.
 */
export interface TrustEnvelope {
  /** The passages this output is grounded in. Empty ⇒ nothing cited (see confidence). */
  citations: SourceCitation[];
  confidence: TrustConfidence;
  /** Label of the corpus/scope the output was grounded against (e.g. deck/source title). */
  groundedIn?: string;
}

// ── Grade-on-meaning verdict ────────────────────────────────────────────────
//
// Grading judges MEANING, not exact strings. A paraphrase of the correct answer
// is correct; a synonym is correct; word order does not matter. Knowt is hated
// for exact-string grading — this shape is the antidote and P1 adopts it as the
// ONE grading path for typed/short-answer items.

/**
 * The typed result of grading a free-response / typed / spoken answer on meaning.
 *
 * - `correct`      — the answer conveys the required idea (paraphrase-tolerant).
 * - `partial`      — some but not all of the required idea is present.
 * - `misconception`— the NAMED wrong idea the learner appears to hold, if any
 *                    (drives targeted follow-up); null when there's no clear one.
 * - `explanation`  — why, in meaning terms — never "you didn't type the exact words".
 */
export interface GradeVerdict {
  correct: boolean;
  partial: boolean;
  misconception: string | null;
  explanation: string;
}

// ── Coercion helpers (never throw; narrow agent output → the contract) ───────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const asString = (v: unknown): string => (typeof v === "string" ? v : "");

const VALID_CONFIDENCE: readonly TrustConfidence[] = [
  "grounded",
  "inferred",
  "not_in_material",
];

const VALID_SOURCE_KIND: readonly CitationSourceKind[] = [
  "document",
  "chunk",
  "section",
  "file",
  "url",
  "scope",
  "transcript",
  "web",
];

function coerceCitation(raw: unknown): SourceCitation | null {
  if (!isRecord(raw)) return null;
  // Accept both canonical keys and common agent aliases (source_id, source_kind).
  const sourceId = asString(raw.sourceId ?? raw.source_id ?? raw.id);
  if (!sourceId) return null;
  const sourceKindRaw = asString(raw.sourceKind ?? raw.source_kind);
  const sourceKind: CitationSourceKind = VALID_SOURCE_KIND.includes(
    sourceKindRaw as CitationSourceKind,
  )
    ? (sourceKindRaw as CitationSourceKind)
    : "chunk";
  const locator = asString(raw.locator ?? raw.page ?? raw.position) || undefined;
  const excerpt = asString(raw.excerpt ?? raw.passage ?? raw.text) || undefined;
  const title = asString(raw.title ?? raw.source_title ?? raw.label) || undefined;
  return { sourceId, sourceKind, locator, excerpt, title };
}

/**
 * Narrow an unknown agent-emitted value to a TrustEnvelope. Returns null when
 * there's no trust data at all (so callers can distinguish "no envelope" from
 * "empty-but-present"). Tolerant of the field living inline or under `trust`.
 */
export function coerceTrustEnvelope(raw: unknown): TrustEnvelope | null {
  if (!isRecord(raw)) return null;
  const src = isRecord(raw.trust) ? raw.trust : raw;

  const confidenceRaw = asString(src.confidence);
  const hasConfidence = VALID_CONFIDENCE.includes(
    confidenceRaw as TrustConfidence,
  );

  const rawCitations = Array.isArray(src.citations) ? src.citations : [];
  const citations = rawCitations
    .map(coerceCitation)
    .filter((c): c is SourceCitation => c !== null);

  // No confidence AND no citations ⇒ this item simply has no envelope.
  if (!hasConfidence && citations.length === 0) return null;

  const confidence: TrustConfidence = hasConfidence
    ? (confidenceRaw as TrustConfidence)
    : citations.length > 0
      ? "grounded"
      : "inferred";

  const groundedIn =
    asString(src.groundedIn ?? src.grounded_in) || undefined;

  return { citations, confidence, groundedIn };
}

/** Narrow an unknown agent-emitted value to a GradeVerdict (never throws). */
export function coerceGradeVerdict(raw: unknown): GradeVerdict | null {
  if (!isRecord(raw)) return null;
  const hasSignal =
    "correct" in raw || "partial" in raw || "explanation" in raw;
  if (!hasSignal) return null;
  const correct = raw.correct === true;
  const partial = raw.partial === true;
  const misconceptionRaw = asString(raw.misconception);
  return {
    correct,
    partial: partial && !correct,
    misconception: misconceptionRaw ? misconceptionRaw : null,
    explanation: asString(raw.explanation ?? raw.feedback),
  };
}

// ── Convenience predicates for consumers ────────────────────────────────────

/** True when the surface must present the honest-refusal path + escape hatch. */
export const isRefusal = (e: TrustEnvelope | null | undefined): boolean =>
  e?.confidence === "not_in_material";

/** True when the output is fully traceable to cited passages. */
export const isGrounded = (e: TrustEnvelope | null | undefined): boolean =>
  e?.confidence === "grounded" && (e?.citations.length ?? 0) > 0;

/** The `__kind`-carried field name every education AI kind uses for the envelope. */
export const TRUST_FIELD = "trust" as const;

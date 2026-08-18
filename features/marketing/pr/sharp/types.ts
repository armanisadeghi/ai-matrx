/**
 * The Press Room — row types and jsonb readers.
 *
 * THE ROW TYPES ARE THE GENERATED DB ROW TYPES. Nothing here widens, narrows,
 * or re-declares a column: every component in this folder is a pure function of
 * `StoryAngleRow` / `SourceRequestRow` / `CoverageMentionRow`, so a real
 * Supabase select drops straight in where the fixture module is imported today.
 *
 * What this file DOES add is the read layer for the `jsonb[]` columns. Postgres
 * gives us `Json`, which is honest — the shape inside is a convention, not a
 * constraint — so every reader below is total: it never throws, it skips what it
 * cannot understand, and it REPORTS how many items it skipped. A malformed
 * evidence payload is a thing the UI must show, not swallow (ground-rules §1:
 * "what does a malformed payload look like?").
 */

import type { Database, Json } from "@/types/database.types";

export type StoryAngleRow = Database["seo"]["Tables"]["story_angle"]["Row"];
export type SourceRequestRow =
  Database["seo"]["Tables"]["source_request"]["Row"];
export type CoverageMentionRow =
  Database["seo"]["Tables"]["coverage_mention"]["Row"];

/* ── CHECK-constraint value sets, mirrored from the live constraints ──────── */

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

export const SOURCE_REQUEST_STATUSES = [
  "new",
  "matched",
  "drafted",
  "submitted",
  "won",
  "passed",
  "expired",
] as const;
export type SourceRequestStatus = (typeof SOURCE_REQUEST_STATUSES)[number];

export const SOURCE_PLATFORMS = [
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
export type SourcePlatform = (typeof SOURCE_PLATFORMS)[number];

/* ── jsonb item shapes ───────────────────────────────────────────────────── */

/** One thing a journalist must be able to verify before they will run it. */
export interface ProofItem {
  key: string;
  label: string;
  /** What kind of artefact satisfies it — drives the icon, nothing else. */
  kind: "document" | "data" | "quote" | "third_party" | "metric";
  note: string | null;
}

/** A proof we do NOT have yet. Carries its own path to being had. */
export interface MissingEvidenceItem {
  key: string;
  label: string;
  /** The concrete next move. This is what turns a gap into a to-do. */
  how_to_get: string;
  owner: "you" | "team" | "client" | "third_party";
  effort: "quick" | "medium" | "heavy";
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

export interface InferenceItem {
  statement: string;
  confidence: number | null;
}

export interface ContradictionItem {
  statement: string;
  detail: string | null;
}

export interface RequirementItem {
  label: string;
  met: boolean | null;
}

/** Every reader returns this: what parsed, and how much did not. */
export interface ParsedList<T> {
  items: T[];
  /** Entries present in the column that this reader could not understand. */
  malformed: number;
}

/* ── total, non-throwing readers ─────────────────────────────────────────── */

function asArray(value: Json): Json[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: Json): Record<string, Json> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : null;
}

function str(record: Record<string, Json>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function num(record: Record<string, Json>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(record: Record<string, Json>, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function oneOf<T extends string>(
  record: Record<string, Json>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = record[key];
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function readList<T>(
  column: Json,
  read: (record: Record<string, Json>, index: number) => T | null,
): ParsedList<T> {
  const items: T[] = [];
  let malformed = 0;
  for (const [index, entry] of asArray(column).entries()) {
    const record = asRecord(entry);
    const parsed = record ? read(record, index) : null;
    if (parsed === null) malformed += 1;
    else items.push(parsed);
  }
  return { items, malformed };
}

export function readProofRequired(column: Json): ParsedList<ProofItem> {
  return readList(column, (record, index) => {
    const label = str(record, "label");
    if (!label) return null;
    return {
      key: str(record, "key") ?? `proof_${index}`,
      label,
      kind: oneOf(
        record,
        "kind",
        ["document", "data", "quote", "third_party", "metric"] as const,
        "document",
      ),
      note: str(record, "note"),
    };
  });
}

export function readMissingEvidence(
  column: Json,
): ParsedList<MissingEvidenceItem> {
  return readList(column, (record, index) => {
    const label = str(record, "label");
    if (!label) return null;
    return {
      key: str(record, "key") ?? `missing_${index}`,
      label,
      how_to_get: str(record, "how_to_get") ?? "No path recorded yet.",
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
    const label = str(record, "label");
    if (!label) return null;
    return {
      key: str(record, "key") ?? `evidence_${index}`,
      label,
      source: str(record, "source") ?? "Unattributed",
      url: str(record, "url"),
      captured_at: str(record, "captured_at"),
    };
  });
}

export function readFacts(column: Json): ParsedList<FactItem> {
  return readList(column, (record) => {
    const statement = str(record, "statement");
    if (!statement) return null;
    return { statement, source_key: str(record, "source_key") };
  });
}

export function readInferences(column: Json): ParsedList<InferenceItem> {
  return readList(column, (record) => {
    const statement = str(record, "statement");
    if (!statement) return null;
    return { statement, confidence: num(record, "confidence") };
  });
}

export function readContradictions(column: Json): ParsedList<ContradictionItem> {
  return readList(column, (record) => {
    const statement = str(record, "statement");
    if (!statement) return null;
    return { statement, detail: str(record, "detail") };
  });
}

export function readRequirements(column: Json): ParsedList<RequirementItem> {
  return readList(column, (record) => {
    const label = str(record, "label");
    if (!label) return null;
    return { label, met: bool(record, "met") };
  });
}

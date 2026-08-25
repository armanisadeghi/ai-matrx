// features/education/library/types.ts
//
// The community library (P6 Phase C): browse public decks, the Certified tier,
// and the suggest-edit contribution flywheel.

import type { Database } from "@/types/database.types";
import type { ListScopeKind } from "@/lib/list-scope/types";

export type EducationLibraryRow =
  Database["public"]["Functions"]["edu_library_list_scoped"]["Returns"][number];

export type EducationLibraryKind =
  "fc_set" | "assessment" | "study_media" | "note";

export const EDUCATION_LIBRARY_SCOPES: ListScopeKind[] = [
  "mine",
  "shared",
  "public",
];

export const EDUCATION_LIBRARY_KIND_LABELS: Record<
  EducationLibraryKind,
  string
> = {
  fc_set: "Flashcards",
  assessment: "Assessment",
  study_media: "Study media",
  note: "Note",
};

export const EDUCATION_LIBRARY_SUBTYPE_LABELS: Record<string, string> = {
  flashcards: "Flashcards",
  quiz: "Quiz",
  practice_test: "Practice test",
  audio: "Audio study",
  summary: "Summary",
  mind_map: "Mind map",
  memory_aid: "Memory aid",
  notes: "Note",
};

export function educationLibraryHref(row: EducationLibraryRow): string {
  if (row.kind === "fc_set") return `/education/flashcards/${row.id}`;
  if (row.kind === "assessment") {
    return row.subtype === "practice_test"
      ? `/education/practice-tests/${row.id}`
      : `/education/quizzes/${row.id}`;
  }
  if (row.kind === "note") return `/education/notes/${row.id}`;
  if (row.subtype === "audio") return `/education/audio-study/${row.id}`;
  if (row.subtype === "summary") return `/education/summaries/${row.id}`;
  if (row.subtype === "mind_map") return `/education/mind-maps/${row.id}`;
  if (row.subtype === "memory_aid") return `/education/memory/${row.id}`;
  return `/education/media/${row.id}`;
}

/** One public deck row from `edu_public_decks` (card count + certified status). */
export interface PublicDeck {
  id: string;
  name: string;
  description: string | null;
  topic: string | null;
  difficulty: string | null;
  cardCount: number;
  /** A certification row exists. NOT the same as "a human checked it". */
  certified: boolean;
  certifiedNote: string | null;
  /**
   * A HUMAN expert signed off (`content_certification.human_verified_at`).
   * Only this may render the "Certified" mark — `certified` alone renders
   * "AI-built starter". Defaults to false everywhere; never infer it.
   */
  humanVerified: boolean;
  updatedAt: string;
}

/** Raw RPC row shape (snake_case) before mapping. */
export type PublicDeckRow =
  Database["public"]["Functions"]["edu_public_decks"]["Returns"][number];

export function mapPublicDeck(row: PublicDeckRow): PublicDeck {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    topic: row.topic,
    difficulty: row.difficulty,
    cardCount: Number(row.card_count ?? 0),
    certified: row.certified ?? false,
    certifiedNote: row.certified_note,
    humanVerified: row.human_verified ?? false,
    updatedAt: row.updated_at,
  };
}

/** A suggest-edit row (owner inbox / contributor view). */
export type DeckSuggestionRow =
  Database["education"]["Tables"]["deck_suggestion"]["Row"];

/**
 * The study-spine numbers a row carries, with HONEST nullability.
 *
 * `edu_library_list_scoped` returns these per page row, but Supabase's type
 * generator cannot express nullability for function result columns — it types
 * every one as non-null. Reading them raw would let `accuracy_pct` render as
 * "0%" for an artifact that has simply never been studied, which is a lie a
 * learner would act on. This is the ONE place that normalizes them; no surface
 * should touch the raw fields.
 */
export interface LibraryRowStats {
  /** Cards / questions in the artifact. Null for formats with no unit. */
  itemCount: number | null;
  /** How many of those items the learner has actually attempted. */
  studiedCount: number;
  /** Lifetime correct/attempts, 0–1. Null until at least one attempt. */
  accuracy: number | null;
  /** Items due for review right now. */
  dueCount: number;
  lastStudiedAt: string | null;
  topic: string | null;
  difficulty: string | null;
  durationSeconds: number | null;
  /** The material this was generated from — the kit's name. */
  sourceTitle: string | null;
  /** True once the learner has any attempt against this artifact. */
  hasProgress: boolean;
}

function nz(value: number | null | undefined): number | null {
  return value == null ? null : Number(value);
}

function sz(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function libraryRowStats(row: EducationLibraryRow): LibraryRowStats {
  const studiedCount = nz(row.studied_count) ?? 0;
  return {
    itemCount: nz(row.item_count),
    studiedCount,
    accuracy: nz(row.accuracy_pct),
    dueCount: nz(row.due_count) ?? 0,
    lastStudiedAt: sz(row.last_studied_at),
    topic: sz(row.topic),
    difficulty: sz(row.difficulty),
    durationSeconds: nz(row.duration_seconds),
    sourceTitle: sz(row.source_title),
    hasProgress: studiedCount > 0,
  };
}

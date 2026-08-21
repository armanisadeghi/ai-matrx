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

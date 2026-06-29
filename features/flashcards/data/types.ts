// features/flashcards/data/types.ts
//
// Canonical flashcard domain types, derived from the generated `education` schema
// (fc_set / fc_card / fc_detail). The shared study spine (study_session /
// study_attempt / item_mastery / study_goal) lives in `features/education/study/`,
// since it is mode-agnostic and reused by quizzes, practice tests, etc.
//
// Relationships (card↔set membership, card↔card hierarchy, card↔file media/lineage,
// card↔category themes) are NOT columns — they are `platform.associations` edges,
// reached through `associationsService`. See the role vocabulary in EDGE_ROLE.

import type { Database } from "@/types/database.types";

type Edu = Database["education"]["Tables"];

// ─── Row types ──────────────────────────────────────────────────────────────
export type FcSetRow = Edu["fc_set"]["Row"];
export type FcCardRow = Edu["fc_card"]["Row"];
export type FcDetailRow = Edu["fc_detail"]["Row"];
export type FcDetailInsert = Edu["fc_detail"]["Insert"];

// ─── Edge roles (platform.categories dimension `association_role`) ────────────
export const EDGE_ROLE = {
  member: "member", //              fc_card → fc_set (set membership, position = order)
  expandsInto: "expands_into", //   fc_card → fc_card (hierarchy: struggle → sub-cards)
  prerequisiteOf: "prerequisite_of",
  related: "related",
  source: "source", //              fc_card/fc_set → file (knowledge lineage)
  theme: "theme", //                fc_card → category (cross-set "string")
  illustration: "illustration", //  fc_card → file (media)
  diagram: "diagram",
  chart: "chart",
  photo: "photo",
  videoRef: "video_ref",
} as const;
export type EdgeRole = (typeof EDGE_ROLE)[keyof typeof EDGE_ROLE];

// ─── Authoring inputs (what a creator/agent supplies) ────────────────────────
export interface NewCardInput {
  front: string;
  back: string;
  card_kind?: string; //            defaults 'basic'
  difficulty?: string | null;
  topic?: string | null;
  lesson?: string | null;
  personal_notes?: string | null;
  /** Optional lineage: the source passage this card came from (§ from-source flow). */
  source?: { file_id: string; processed_document_id?: string; chunk_id?: string; page?: number };
}

export interface NewSetInput {
  name: string;
  description?: string | null;
  topic?: string | null;
  lesson?: string | null;
  difficulty?: string | null;
  /** Active-context org; if omitted the DB trigger falls back to the creator's personal org. */
  orgId?: string;
  metadata?: Record<string, unknown>;
}

// ─── Read/view shapes ────────────────────────────────────────────────────────
/** A card plus its owned detail rows (helper/example/spoken/...) and its order in the set. */
export interface CardWithDetails extends FcCardRow {
  position: number | null;
  details: FcDetailRow[];
}

export interface SetWithCards {
  set: FcSetRow;
  cards: CardWithDetails[];
}

// ─── Service result (supabase-style; services never throw) ───────────────────
export interface FcResult<T> {
  data: T | null;
  error: string | null;
}

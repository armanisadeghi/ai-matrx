/**
 * Flashcard Persistence Types
 *
 * Lightweight types for the user_flashcard_sets and user_flashcard_reviews tables.
 * These flashcard sets are auto-generated from chat and linked to cx_message/cx_conversation.
 */

import type { Database } from "@/types/database.types";
import type { GradeResult } from "@/features/education/trust/types";

// ============================================================================
// Card & Review primitives
// ============================================================================

export interface FlashcardCard {
  front: string;
  back: string;
}

/**
 * A card review outcome. Aliased to the canonical `GradeResult`
 * (features/education/trust) — the ONE shared result vocabulary; never a copy.
 */
export type ReviewResult = GradeResult;

// ============================================================================
// Database row types
// ============================================================================

export type FlashcardSetRow =
  Database["users"]["Tables"]["user_flashcard_sets"]["Row"];
export type FlashcardReviewRow =
  Database["users"]["Tables"]["user_flashcard_reviews"]["Row"];

// ============================================================================
// Insert types
// ============================================================================

export interface FlashcardSetInsert {
  conversation_id?: string;
  message_id?: string;
  title?: string;
  cards: FlashcardCard[];
  tags?: string[];
}

export interface FlashcardReviewInsert {
  set_id: string;
  card_index: number;
  result: ReviewResult;
}

// ============================================================================
// Aggregated card stats (computed from review log)
// ============================================================================

export interface CardReviewStats {
  cardIndex: number;
  correct: number;
  partial: number;
  incorrect: number;
  totalReviews: number;
  lastReviewedAt: string | null;
  lastResult: ReviewResult | null;
}

export interface FlashcardSetWithStats extends FlashcardSetRow {
  cardStats: CardReviewStats[];
  totalReviews: number;
  masteryPercent: number; // 0-100
}

// Spaced repetition lives in ONE place: the FSRS scheduler (`lib/srs/fsrs.ts`),
// persisted on `education.item_mastery` and driven by `features/flashcards/data/`.
// The 3-box Leitner scheduler that used to live in `features/flashcards/hooks/`
// (with its `LeitnerBox` / `CardStudyState` types) was a SECOND, competing SRS
// algorithm over the legacy `users.user_flashcard_*` tables. It had zero
// importers and was deleted 2026-08-17 (WP8). Do not reintroduce a second
// scheduler here — extend the FSRS one.

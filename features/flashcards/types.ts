/**
 * Flashcard Persistence Types
 *
 * Lightweight types for the user_flashcard_sets and user_flashcard_reviews tables.
 * These flashcard sets are auto-generated from chat and linked to cx_message/cx_conversation.
 */

import type { Database } from "@/types/database.types";

// ============================================================================
// Card & Review primitives
// ============================================================================

export interface FlashcardCard {
  front: string;
  back: string;
}

export type ReviewResult = "correct" | "partial" | "incorrect";

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

// ============================================================================
// Spaced repetition box assignment
// ============================================================================

export type LeitnerBox = 1 | 2 | 3;

export interface CardStudyState {
  cardIndex: number;
  box: LeitnerBox;
  isDue: boolean;
  lastReviewedAt: string | null;
  lastResult: ReviewResult | null;
}

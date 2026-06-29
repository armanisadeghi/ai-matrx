/**
 * Flashcard Persistence Service
 *
 * Client-side service for CRUD on user_flashcard_sets and user_flashcard_reviews.
 * Uses the browser Supabase client + Redux store userId.
 */

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { buildSearchOr } from "@/utils/supabase-search";
import type { Json } from "@/types/database.types";
import type {
  FlashcardSetRow,
  FlashcardSetInsert,
  FlashcardReviewRow,
  FlashcardReviewInsert,
  CardReviewStats,
  ReviewResult,
} from "../types";

// ============================================================================
// Sets
// ============================================================================

export const flashcardPersistenceService = {
  /**
   * Save a new flashcard set linked to a conversation/message.
   * If a set already exists for the same message_id, returns the existing one.
   */
  async saveSet(
    input: FlashcardSetInsert,
  ): Promise<{
    data: FlashcardSetRow | null;
    isExisting: boolean;
    error: unknown;
  }> {
    try {
      const userId = requireUserId();

      // Deduplicate by message_id if provided
      if (input.message_id) {
        const { data: existing } = await supabase
          .schema("users").from("user_flashcard_sets")
          .select("*")
          .eq("user_id", userId)
          .eq("message_id", input.message_id)
          .single();

        if (existing) {
          return { data: existing, isExisting: true, error: null };
        }
      }

      const cardsJson = input.cards as unknown as Json;
      const { data, error } = await supabase
        .schema("users").from("user_flashcard_sets")
        .insert({
          user_id: userId,
          organization_id: await ensureOrgId(undefined),
          conversation_id: input.conversation_id ?? null,
          message_id: input.message_id ?? null,
          title: input.title ?? "Flashcards",
          cards: cardsJson,
          card_count: input.cards.length,
          tags: input.tags ?? [],
        })
        .select()
        .single();

      return { data, isExisting: false, error };
    } catch (error) {
      return { data: null, isExisting: false, error };
    }
  },

  /**
   * List all flashcard sets for the current user.
   */
  async listSets(filters?: {
    conversation_id?: string;
    is_archived?: boolean;
    search?: string;
  }): Promise<{ data: FlashcardSetRow[] | null; error: unknown }> {
    try {
      const userId = requireUserId();
      let query = supabase
        .schema("users").from("user_flashcard_sets")
        .select("*")
        .eq("user_id", userId);

      if (filters?.conversation_id) {
        query = query.eq("conversation_id", filters.conversation_id);
      }
      if (filters?.is_archived !== undefined) {
        query = query.eq("is_archived", filters.is_archived);
      }
      if (filters?.search) {
        query = query.or(buildSearchOr(filters.search, ["title"]));
      }

      query = query.order("updated_at", { ascending: false });

      const { data, error } = await query;
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Get a single flashcard set by ID.
   */
  async getSet(
    setId: string,
  ): Promise<{ data: FlashcardSetRow | null; error: unknown }> {
    try {
      const userId = requireUserId();
      const { data, error } = await supabase
        .schema("users").from("user_flashcard_sets")
        .select("*")
        .eq("id", setId)
        .eq("user_id", userId)
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Find a set by message_id (useful when rendering flashcards in chat).
   */
  async getSetByMessageId(
    messageId: string,
  ): Promise<{ data: FlashcardSetRow | null; error: unknown }> {
    try {
      const userId = requireUserId();
      const { data, error } = await supabase
        .schema("users").from("user_flashcard_sets")
        .select("*")
        .eq("user_id", userId)
        .eq("message_id", messageId)
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Update set metadata (title, tags, archive).
   */
  async updateSet(
    setId: string,
    updates: { title?: string; tags?: string[]; is_archived?: boolean },
  ): Promise<{ data: FlashcardSetRow | null; error: unknown }> {
    try {
      const userId = requireUserId();
      const { data, error } = await supabase
        .schema("users").from("user_flashcard_sets")
        .update(updates)
        .eq("id", setId)
        .eq("user_id", userId)
        .select()
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Delete a flashcard set and all its reviews (cascade).
   */
  async deleteSet(setId: string): Promise<{ error: unknown }> {
    try {
      const userId = requireUserId();
      const { error } = await supabase
        .schema("users").from("user_flashcard_sets")
        .delete()
        .eq("id", setId)
        .eq("user_id", userId);

      return { error };
    } catch (error) {
      return { error };
    }
  },

  // ========================================================================
  // Reviews
  // ========================================================================

  /**
   * Submit a single card review.
   */
  async submitReview(
    input: FlashcardReviewInsert,
  ): Promise<{ data: FlashcardReviewRow | null; error: unknown }> {
    try {
      const userId = requireUserId();

      // Insert review
      const { data, error } = await supabase
        .schema("users").from("user_flashcard_reviews")
        .insert({
          user_id: userId,
          organization_id: await ensureOrgId(undefined),
          set_id: input.set_id,
          card_index: input.card_index,
          result: input.result,
        })
        .select()
        .single();

      // Also touch last_studied_at on the set
      if (!error) {
        await supabase
          .schema("users").from("user_flashcard_sets")
          .update({ last_studied_at: new Date().toISOString() })
          .eq("id", input.set_id)
          .eq("user_id", userId);
      }

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Get all reviews for a set (for computing stats and spaced repetition).
   */
  async getReviews(
    setId: string,
  ): Promise<{ data: FlashcardReviewRow[] | null; error: unknown }> {
    try {
      const userId = requireUserId();
      const { data, error } = await supabase
        .schema("users").from("user_flashcard_reviews")
        .select("*")
        .eq("user_id", userId)
        .eq("set_id", setId)
        .order("reviewed_at", { ascending: true });

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Compute per-card review stats from the review log.
   */
  async getCardStats(
    setId: string,
    cardCount: number,
  ): Promise<{ stats: CardReviewStats[]; error: unknown }> {
    const { data: reviews, error } = await this.getReviews(setId);

    if (error || !reviews) {
      // Return empty stats for each card
      const stats: CardReviewStats[] = Array.from(
        { length: cardCount },
        (_, i) => ({
          cardIndex: i,
          correct: 0,
          partial: 0,
          incorrect: 0,
          totalReviews: 0,
          lastReviewedAt: null,
          lastResult: null,
        }),
      );
      return { stats, error };
    }

    // Build stats map
    const statsMap = new Map<number, CardReviewStats>();
    for (let i = 0; i < cardCount; i++) {
      statsMap.set(i, {
        cardIndex: i,
        correct: 0,
        partial: 0,
        incorrect: 0,
        totalReviews: 0,
        lastReviewedAt: null,
        lastResult: null,
      });
    }

    for (const review of reviews) {
      const stat = statsMap.get(review.card_index);
      if (!stat) continue;

      stat[review.result as ReviewResult]++;
      stat.totalReviews++;
      stat.lastReviewedAt = review.reviewed_at;
      stat.lastResult = review.result as ReviewResult;
    }

    return { stats: Array.from(statsMap.values()), error: null };
  },

  /**
   * Reset all reviews for a set (start fresh).
   */
  async resetReviews(setId: string): Promise<{ error: unknown }> {
    try {
      const userId = requireUserId();
      const { error } = await supabase
        .schema("users").from("user_flashcard_reviews")
        .delete()
        .eq("set_id", setId)
        .eq("user_id", userId);

      return { error };
    } catch (error) {
      return { error };
    }
  },
};

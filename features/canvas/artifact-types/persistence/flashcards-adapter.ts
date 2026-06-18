/**
 * Flashcards persistence adapter for the artifact system.
 *
 * Domain table: user_flashcard_sets (set), user_flashcard_reviews (per-card log).
 * Link: { externalSystem: 'user_flashcard_sets', externalId: <set uuid> }
 *
 * onMaterialize: idempotent — dedupes on sourceMessageId via saveSet's built-in
 * message_id check (see flashcardPersistenceService.saveSet).
 *
 * State shape returned by loadState / consumed by saveState:
 *   FlashcardsArtifactState { setId, cardCount, stats: CardReviewStats[] }
 *
 * saveState is intentionally read-only here — individual card reviews are
 * submitted by the FlashcardsArtifact component via flashcardPersistenceService.submitReview
 * directly. saveState refreshes the cached stats from the review log so callers
 * always have a fresh view after a review round ends.
 */

import { flashcardPersistenceService } from "@/features/flashcards/services/flashcardPersistenceService";
import { parseFlashcards } from "@/components/mardown-display/blocks/flashcards/flashcard-parser";
import type { CardReviewStats } from "@/features/flashcards/types";
import type {
  ArtifactPersistenceAdapter,
  ArtifactLink,
  MaterializedArtifactInfo,
} from "./artifact-adapters";

// ── State shape ────────────────────────────────────────────────────────────────

export interface FlashcardsArtifactState extends Record<string, unknown> {
  /** The linked user_flashcard_sets.id (mirrors link.externalId). */
  setId: string;
  /** Number of cards in the set (from user_flashcard_sets.card_count). */
  cardCount: number;
  /** Per-card stats computed from the user_flashcard_reviews log. */
  stats: CardReviewStats[];
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const FLASHCARDS_ADAPTER: ArtifactPersistenceAdapter<FlashcardsArtifactState> =
  {
    /**
     * Called once when the render-block is materialized into canvas_items.
     * Deduplication: saveSet checks user_flashcard_sets.message_id and returns
     * the existing row if one is found — safe to call on every reconcile pass.
     *
     * rawContent is expected to be JSON with shape { title, cards: FlashcardCard[] }.
     * If parsing fails we fall back to an empty card array (the set will have
     * card_count = 0) — this is a gap: the adapter assumes the raw content is
     * already parsed flashcard JSON.
     */
    async onMaterialize(
      info: MaterializedArtifactInfo,
    ): Promise<ArtifactLink | void> {
      let cards: Array<{ front: string; back: string }> = [];
      const title = info.title || "Flashcards";
      const rc = typeof info.rawContent === "string" ? info.rawContent : "";

      // Flashcards content is MARKDOWN (`Front:` / `Back:`) — parse it with the
      // SAME canonical parser FlashcardsBlock uses, NOT JSON.
      if (rc.trim()) {
        try {
          cards = parseFlashcards(rc).flashcards.map((c) => ({
            front: c.front,
            back: c.back,
          }));
        } catch (e) {
          console.warn("[FLASHCARDS_ADAPTER.onMaterialize] parseFlashcards failed:", e);
        }
        // Defensive fallback: a source that ships JSON instead of markdown.
        if (cards.length === 0) {
          try {
            const j = JSON.parse(rc);
            const arr = Array.isArray(j)
              ? j
              : Array.isArray(j?.cards)
                ? j.cards
                : Array.isArray(j?.flashcards)
                  ? j.flashcards
                  : [];
            if (arr.length) cards = arr;
          } catch {
            /* not JSON — markdown parse already attempted */
          }
        }
      }

      if (cards.length === 0) {
        console.warn(
          "[FLASHCARDS_ADAPTER.onMaterialize] no cards parsed; set will have 0 cards",
        );
      }

      const { data, error } = await flashcardPersistenceService.saveSet({
        message_id: info.sourceMessageId,
        conversation_id: info.conversationId,
        title,
        cards,
      });

      if (error || !data) {
        console.error(
          "[FLASHCARDS_ADAPTER.onMaterialize] saveSet failed:",
          error,
        );
        return; // Caller will fall back to GENERIC_ADAPTER state.
      }

      return {
        externalSystem: "user_flashcard_sets",
        externalId: data.id,
      };
    },

    /**
     * Load the current user's review progress for a flashcard set.
     * Returns null if the link is missing or the set is not found.
     */
    async loadState(
      _artifactId: string,
      link?: ArtifactLink,
    ): Promise<FlashcardsArtifactState | null> {
      const setId = link?.externalId;
      if (!setId) {
        console.warn("[FLASHCARDS_ADAPTER.loadState] missing link.externalId");
        return null;
      }

      const { data: setRow, error: setErr } =
        await flashcardPersistenceService.getSet(setId);
      if (setErr || !setRow) {
        console.error(
          "[FLASHCARDS_ADAPTER.loadState] getSet error:",
          setErr,
        );
        return null;
      }

      const cardCount = setRow.card_count ?? 0;
      const { stats, error: statsErr } =
        await flashcardPersistenceService.getCardStats(setId, cardCount);

      if (statsErr) {
        console.error(
          "[FLASHCARDS_ADAPTER.loadState] getCardStats error:",
          statsErr,
        );
      }

      return { setId, cardCount, stats: stats ?? [] };
    },

    /**
     * Re-read stats from the review log (the patch is ignored — reviews are
     * written by the component, not by saveState, so we refresh rather than merge).
     *
     * Gap: this design means saveState does a full re-read from DB on every call.
     * If the component needs a write path (e.g. batch-submitting reviews from a
     * save-state flow), extend this to call submitReview on each card in patch.reviews.
     */
    async saveState(
      _artifactId: string,
      _patch: Partial<FlashcardsArtifactState>,
      link?: ArtifactLink,
    ): Promise<boolean> {
      const setId = link?.externalId;
      if (!setId) {
        console.warn("[FLASHCARDS_ADAPTER.saveState] missing link.externalId");
        return false;
      }
      // Touch last_studied_at to signal the set was recently accessed.
      const { error } = await flashcardPersistenceService.updateSet(setId, {});
      if (error) {
        console.error(
          "[FLASHCARDS_ADAPTER.saveState] updateSet (touch) error:",
          error,
        );
        return false;
      }
      return true;
    },
  };

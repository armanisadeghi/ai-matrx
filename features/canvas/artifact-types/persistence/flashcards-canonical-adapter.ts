/**
 * Flashcards persistence adapter — CANONICAL (education.fc_*).
 *
 * Replaces the legacy `flashcards-adapter.ts` (which wrote users.user_flashcard_sets).
 * On materialize it parses the rendered card markdown with the SAME canonical parser
 * the block uses, then creates an `fc_set` + `fc_card` rows + ordered `member` edges
 * via `fcService`, and links the canvas item to the set
 * (`externalSystem: 'fc_set'`). A simple chat-generated card thus becomes a fully
 * canonical, wired-up card with zero schema change between "simple" and "rich".
 *
 * Dedup: idempotent on `info.sourceMessageId`, stored in `fc_set.metadata.source_message_id`
 * — reconcile passes call onMaterialize again and must not create duplicate sets.
 */

import { supabase } from "@/utils/supabase/client";
import { parseFlashcards } from "@/components/mardown-display/blocks/flashcards/flashcard-parser";
import { fcService } from "@/features/flashcards/data/fcService";
import type {
  ArtifactPersistenceAdapter,
  ArtifactLink,
  MaterializedArtifactInfo,
} from "./artifact-adapters";

export interface FlashcardsCanonicalState extends Record<string, unknown> {
  /** The linked education.fc_set.id (mirrors link.externalId). */
  setId: string;
  /** Number of cards (member edges) in the set. */
  cardCount: number;
}

const EXTERNAL_SYSTEM = "fc_set";

export const FLASHCARDS_CANONICAL_ADAPTER: ArtifactPersistenceAdapter<FlashcardsCanonicalState> =
  {
    async onMaterialize(
      info: MaterializedArtifactInfo,
    ): Promise<ArtifactLink | void> {
      // 1) Dedup: a set already materialized for this message?
      const { data: existing } = await supabase
        .schema("education")
        .from("fc_set")
        .select("id")
        .eq("metadata->>source_message_id", info.sourceMessageId)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        return { externalSystem: EXTERNAL_SYSTEM, externalId: existing.id };
      }

      // 2) Parse the rendered card markdown (Front:/Back:) — identical to the block.
      const raw = typeof info.rawContent === "string" ? info.rawContent : "";
      let cards: Array<{ front: string; back: string }> = [];
      if (raw.trim()) {
        try {
          cards = parseFlashcards(raw).flashcards.map((c) => ({
            front: c.front,
            back: c.back,
          }));
        } catch (e) {
          console.warn(
            "[FLASHCARDS_CANONICAL_ADAPTER] parseFlashcards failed:",
            e,
          );
        }
      }
      if (cards.length === 0) {
        console.warn(
          "[FLASHCARDS_CANONICAL_ADAPTER] no cards parsed; creating empty set",
        );
      }

      // 3) Create the canonical set + cards + member edges.
      const res = await fcService.createSetWithCards(
        {
          name: info.title || "Flashcards",
          metadata: {
            source_message_id: info.sourceMessageId,
            conversation_id: info.conversationId,
            generation: "chat_render_block",
          },
        },
        cards,
      );
      if (!res.data) {
        console.error(
          "[FLASHCARDS_CANONICAL_ADAPTER] createSetWithCards failed:",
          res.error,
        );
        return; // caller falls back to GENERIC_ADAPTER
      }
      return { externalSystem: EXTERNAL_SYSTEM, externalId: res.data.set.id };
    },

    async loadState(
      _artifactId: string,
      link?: ArtifactLink,
    ): Promise<FlashcardsCanonicalState | null> {
      const setId = link?.externalId;
      if (!setId) return null;
      const res = await fcService.getSetWithCards(setId);
      if (!res.data) {
        console.error(
          "[FLASHCARDS_CANONICAL_ADAPTER.loadState]",
          res.error,
        );
        return null;
      }
      return { setId, cardCount: res.data.cards.length };
    },

    async saveState(
      _artifactId: string,
      _patch: Partial<FlashcardsCanonicalState>,
      link?: ArtifactLink,
    ): Promise<boolean> {
      // Per-card study progress is written by the study spine (study_record_attempt),
      // not here. Touch the set so "recently studied" ordering stays fresh.
      const setId = link?.externalId;
      if (!setId) return false;
      const { error } = await supabase
        .schema("education")
        .from("fc_set")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", setId);
      if (error) {
        console.error("[FLASHCARDS_CANONICAL_ADAPTER.saveState]", error);
        return false;
      }
      return true;
    },
  };

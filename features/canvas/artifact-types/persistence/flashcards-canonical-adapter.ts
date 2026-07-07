/**
 * Flashcards persistence adapter — CANONICAL (education.fc_*).
 *
 * Replaces the legacy `flashcards-adapter.ts` (which wrote users.user_flashcard_sets).
 * On materialize it maps the artifact payload to cards — the STRUCTURED
 * kind-IR value when present (Track 2B: `info.structured` or a rawContent
 * JSON root carrying `__kind: "flashcard_set"`), else the legacy Front:/Back:
 * markdown via the SAME canonical parser the block uses — then creates an
 * `fc_set` + `fc_card` rows + ordered `member` edges via `fcService`, and
 * links the canvas item to the set (`externalSystem: 'fc_set'`). A simple
 * chat-generated card thus becomes a fully canonical, wired-up card with zero
 * schema change between "simple" and "rich".
 *
 * Dedup (any-surface): idempotent on the materialization SOURCE — new sets
 * stamp `fc_set.metadata.source_system/source_id`; chat-era sets carried only
 * `metadata.source_message_id`, kept as a legacy fallback read so reconcile
 * passes never double-create pre-existing sets.
 */

import { supabase } from "@/utils/supabase/client";
import { parseFlashcards } from "@/components/mardown-display/blocks/flashcards/flashcard-parser";
import { readObjectKind } from "@/features/content-ir/core/kind-schema.types";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import { fcService } from "@/features/flashcards/data/fcService";
import type { NewCardInput } from "@/features/flashcards/data/types";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The structured kind-IR value, from info.structured or the rawContent JSON root. */
function structuredFlashcardSet(
  info: MaterializedArtifactInfo,
): Record<string, unknown> | null {
  let value: unknown = info.structured ?? null;
  if (!value) {
    const raw = typeof info.rawContent === "string" ? info.rawContent.trim() : "";
    if (!raw.startsWith("{") || !raw.endsWith("}")) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isRecord(value)) return null;
  return readObjectKind(value) === "flashcard_set" ? value : null;
}

/**
 * Map a structured flashcard_set value to NewCardInputs. Dedicated columns
 * (front/back/card_kind/difficulty/topic) map directly; `tags` goes into
 * fc_card.metadata jsonb — fc_card has NO tags column, so metadata is where
 * they survive (zero data loss).
 */
function cardsFromStructured(set: Record<string, unknown>): NewCardInput[] {
  const rawCards = Array.isArray(set.cards) ? set.cards : [];
  const cards: NewCardInput[] = [];
  for (const raw of rawCards) {
    if (!isRecord(raw)) continue;
    const front = optionalString(raw.front) ?? "";
    const back = optionalString(raw.back) ?? "";
    if (!front && !back) continue; // unusable entry — skip, never throw

    const metadata: Record<string, unknown> = {};
    if (Array.isArray(raw.tags) && raw.tags.length > 0) metadata.tags = raw.tags;

    cards.push({
      front,
      back,
      card_kind: optionalString(raw.card_kind) ?? "basic",
      difficulty: optionalString(raw.difficulty),
      topic: optionalString(raw.topic),
      // P0 Trust — a chat/canvas-materialized deck keeps its grounding (citations
      // + confidence) exactly like the from-source path; persisted on
      // fc_card.metadata.trust by fcService.addCards.
      trust: coerceTrustEnvelope(raw) ?? undefined,
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    });
  }
  return cards;
}

export const FLASHCARDS_CANONICAL_ADAPTER: ArtifactPersistenceAdapter<FlashcardsCanonicalState> =
  {
    async onMaterialize(
      info: MaterializedArtifactInfo,
    ): Promise<ArtifactLink | void> {
      // 1) Dedup: a set already materialized from this source?
      const { data: existing } = await supabase
        .schema("education")
        .from("fc_set")
        .select("id")
        .eq("metadata->>source_system", info.source.system)
        .eq("metadata->>source_id", info.source.id)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        return { externalSystem: EXTERNAL_SYSTEM, externalId: existing.id };
      }
      // Legacy fallback: chat-era sets carry only metadata.source_message_id.
      if (info.source.system === "cx_message") {
        const { data: legacy } = await supabase
          .schema("education")
          .from("fc_set")
          .select("id")
          .eq("metadata->>source_message_id", info.source.id)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle();
        if (legacy?.id) {
          return { externalSystem: EXTERNAL_SYSTEM, externalId: legacy.id };
        }
      }

      // 2) Map the payload to cards. Structured kind-IR value first (zero
      //    reprocessing — front/back/card_kind/difficulty/topic map directly,
      //    tags ride card metadata); else the legacy Front:/Back: markdown
      //    parse — identical to the block.
      let cards: NewCardInput[] = [];
      const structured = structuredFlashcardSet(info);
      if (structured) {
        cards = cardsFromStructured(structured);
      } else {
        const raw = typeof info.rawContent === "string" ? info.rawContent : "";
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
      }
      if (cards.length === 0) {
        console.warn(
          "[FLASHCARDS_CANONICAL_ADAPTER] no cards parsed; creating empty set",
        );
      }

      // 3) Create the canonical set + cards + member edges. Source identity is
      //    the dedupe key; source_message_id kept for chat rows so older
      //    readers/queries keep working.
      const res = await fcService.createSetWithCards(
        {
          name: info.title || "Flashcards",
          metadata: {
            source_system: info.source.system,
            source_id: info.source.id,
            ...(info.source.system === "cx_message"
              ? { source_message_id: info.source.id }
              : {}),
            ...(info.conversationId
              ? { conversation_id: info.conversationId }
              : {}),
            generation:
              info.source.system === "cx_message"
                ? "chat_render_block"
                : "render_block",
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

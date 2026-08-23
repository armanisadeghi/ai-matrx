// features/flashcards/data/coerce-card.ts
//
// THE ONE reader for an agent-emitted flashcard (the `flashcard` item kind
// inside a `flashcard_set`). Every generation consumer — topic generation,
// from-source generation, the kit deck generator, the "add more cards" top-up,
// and the content-ir envelope save path — narrows raw card JSON through this
// function, so the card shape can never drift between surfaces again (it was
// copied three times before the agent-manifest wave, 2026-08-22).
//
// Tolerant by design: the parser-injected `__kind` discriminators and any
// keys a future agent version adds are ignored, never fatal; an entry with
// neither front nor back is dropped (null), everything else floors to safe
// defaults.

import { coerceTrustEnvelope } from "@/features/education/trust/types";
import type { NewCardInput } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export interface CoerceCardOptions {
  /**
   * The durable cld_file id every card's lineage should point at (the kit
   * deck generator / top-up know it; the agent never does). When set, every
   * card gets a `source` so fcService writes the card -> file edge; when
   * omitted, `source` exists only if the agent echoed one, with `file_id`
   * left blank for the caller to backfill before persisting.
   */
  anchorFileId?: string;
  /** Fallback processed_document_id when the agent did not echo one. */
  docId?: string;
}

/**
 * Recover the per-card lineage the from-source agent echoes
 * (`source: { processed_document_id, chunk_id, page }`).
 */
function sourceFromRaw(
  raw: Record<string, unknown>,
  opts: CoerceCardOptions,
): NewCardInput["source"] {
  const rawSource = isRecord(raw.source) ? raw.source : null;
  if (!rawSource && !opts.anchorFileId) return undefined;
  const processedDocumentId =
    rawSource && typeof rawSource.processed_document_id === "string"
      ? rawSource.processed_document_id
      : opts.anchorFileId
        ? opts.docId || undefined
        : undefined;
  return {
    file_id: opts.anchorFileId ?? "",
    processed_document_id: processedDocumentId,
    chunk_id:
      rawSource && typeof rawSource.chunk_id === "string"
        ? rawSource.chunk_id
        : undefined,
    page:
      rawSource && typeof rawSource.page === "number" ? rawSource.page : undefined,
  };
}

/**
 * Coerce one raw card object (unknown JSON from the model) into a
 * NewCardInput. Returns null for an unusable entry (no front AND no back).
 */
export function coerceCard(
  raw: unknown,
  opts: CoerceCardOptions = {},
): NewCardInput | null {
  if (!isRecord(raw)) return null;
  const front = typeof raw.front === "string" ? raw.front.trim() : "";
  const back = typeof raw.back === "string" ? raw.back.trim() : "";
  if (!front && !back) return null;

  return {
    front,
    back,
    card_kind: optionalString(raw.card_kind) ?? "basic",
    difficulty: optionalString(raw.difficulty),
    topic: optionalString(raw.topic),
    source: sourceFromRaw(raw, opts),
    // P0 TrustEnvelope — citations + confidence the agent grounded this card
    // in (undefined when the agent produced no envelope; topic-gen omits it).
    trust: coerceTrustEnvelope(raw) ?? undefined,
  };
}

/**
 * The cards list of a raw `flashcard_set` payload — the canonical `cards`
 * key, the `flashcards` drift key, or a bare array — as raw entries.
 */
export function rawCardsOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  if (Array.isArray(value.cards)) return value.cards;
  if (Array.isArray(value.flashcards)) return value.flashcards;
  return [];
}

/** The set title a raw `flashcard_set` payload carries ("" when none). */
export function setTitleOf(value: unknown): string {
  return (isRecord(value) && optionalString(value.title)) || "";
}

/** All usable cards of a raw `flashcard_set` payload, coerced. */
export function coerceCards(
  value: unknown,
  opts: CoerceCardOptions = {},
): NewCardInput[] {
  return rawCardsOf(value)
    .map((c) => coerceCard(c, opts))
    .filter((c): c is NewCardInput => c !== null);
}

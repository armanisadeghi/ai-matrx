// features/education/convert/generators/deck.ts
//
// Converter generator: source text → a flashcard deck (fc_set + fc_card). Wraps
// the flashcards "from source" agent + fcService.createSetWithCards (the single
// deck writer) and links a set-level `source` lineage edge to the ingest anchor
// file so the kit results page can trace provenance.
//
// NOTE: the raw-JSON card coercion here intentionally mirrors
// features/flashcards/data/useGenerateCards.ts#coerceCard (that helper is not
// exported). If the flashcards feature exports it, collapse to that — do not let
// the two drift on card shape.

import { fcService } from "@/features/flashcards/data/fcService";
import { FC_AGENTS } from "@/features/flashcards/data/agents";
import { EDGE_ROLE } from "@/features/flashcards/data/types";
import type { NewCardInput } from "@/features/flashcards/data/types";
import { associationsService } from "@/features/scopes/service/associationsService";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import { runAgentExtraction } from "../runAgentExtraction";
import { mergeTrustEnvelopes } from "../trustMerge";
import type {
  ConvertContext,
  ConvertGenerator,
  ConvertRequest,
  ConvertResult,
} from "../types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Coerce one raw agent card object → NewCardInput (drops unusable entries). */
function coerceCard(raw: unknown, docId: string): NewCardInput | null {
  if (!isRecord(raw)) return null;
  const str = (k: string) =>
    typeof raw[k] === "string" ? (raw[k] as string).trim() : "";
  const front = str("front");
  const back = str("back");
  if (!front && !back) return null;
  const optional = (k: string): string | null => {
    const v = raw[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const rawSource = raw.source;
  const source = isRecord(rawSource)
    ? {
        file_id: "",
        processed_document_id:
          typeof rawSource.processed_document_id === "string"
            ? rawSource.processed_document_id
            : docId || undefined,
        chunk_id:
          typeof rawSource.chunk_id === "string"
            ? rawSource.chunk_id
            : undefined,
        page: typeof rawSource.page === "number" ? rawSource.page : undefined,
      }
    : undefined;

  return {
    front,
    back,
    card_kind: optional("card_kind") ?? "basic",
    difficulty: optional("difficulty"),
    topic: optional("topic"),
    source,
    trust: coerceTrustEnvelope(raw) ?? undefined,
  };
}

function coerceCards(value: unknown, docId: string): {
  title: string;
  cards: NewCardInput[];
} {
  const obj = isRecord(value) ? value : {};
  const title =
    (typeof obj.title === "string" && obj.title.trim()) ||
    (typeof obj.set_title === "string" && obj.set_title.trim()) ||
    "";
  const rawCards = Array.isArray(obj.cards)
    ? obj.cards
    : Array.isArray(obj.flashcards)
      ? obj.flashcards
      : Array.isArray(value)
        ? (value as unknown[])
        : [];
  const cards = rawCards
    .map((c) => coerceCard(c, docId))
    .filter((c): c is NewCardInput => c !== null);
  return { title, cards };
}

async function run(
  request: ConvertRequest,
  ctx: ConvertContext,
): Promise<ConvertResult> {
  const { source, options } = request;
  const docId = source.ref?.processedDocumentId ?? "";

  const extracted = await runAgentExtraction(ctx.dispatch, ctx.store, {
    agentId: FC_AGENTS.generateFromSource,
    surfaceKey: "education-ingest-deck",
    sourceFeature: "education-ingest",
    variables: {
      source_content: source.text,
      document_id: docId,
      count: String(options?.count ?? 15),
      difficulty: options?.difficulty ?? "Mixed",
    },
    onRequestId: ctx.onRequestId,
  });

  const { title, cards } = coerceCards(extracted.value, docId);
  if (cards.length === 0) {
    throw new Error("The deck generator returned no usable cards");
  }

  const setName = title || source.title || "Study deck";
  const created = await fcService.createSetWithCards(
    {
      name: setName,
      description: source.title ? `Generated from ${source.title}` : null,
      orgId: ctx.orgId,
    },
    cards,
  );
  if (created.error || !created.data) {
    throw new Error(
      typeof created.error === "string"
        ? created.error
        : "Failed to save the generated deck",
    );
  }
  const setId = created.data.set.id;

  // Set-level lineage edge → the ingest anchor file (kit provenance).
  if (source.ref?.fileId) {
    const edge = await associationsService.add({
      sourceType: "fc_set",
      sourceId: setId,
      targetType: "file",
      targetId: source.ref.fileId,
      role: EDGE_ROLE.source,
      orgId: ctx.orgId,
    });
    if (!edge.ok) console.error("[convert/deck] source edge failed:", edge);
  }

  const trust = mergeTrustEnvelopes(cards.map((c) => c.trust));
  return {
    targetKind: "deck",
    artifactId: setId,
    resourceType: "fc_set",
    href: `/education/flashcards/${setId}`,
    title: setName,
    trust,
    detail: `${cards.length} card${cards.length === 1 ? "" : "s"}`,
  };
}

export const deckGenerator: ConvertGenerator = {
  targetKind: "deck",
  label: "Flashcard deck",
  available: true,
  capability: "education.generate_cards",
  run,
};

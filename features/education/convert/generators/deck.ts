// features/education/convert/generators/deck.ts
//
// Converter generator: source text -> a flashcard deck (fc_set + fc_card). Wraps
// the flashcards "from source" mandate + fcService (the single deck writer) and
// links a set-level `source` lineage edge to the ingest anchor file so the kit
// results page can trace provenance.
//
// COVERAGE (2026-08-21): this generator used to send the whole source in ONE
// call asking for 15 cards, and a 77-slide chemistry deck came back as 10 cards
// drawn from the first few slides. It now runs through `segmentedGenerate`: the
// source is planned into coverage sections and each section gets its own call
// with its own share of the cards, so slide 62 gets asked about too. See
// `../coverage.ts` for the law and the knobs.
//
// NOTE: the raw-JSON card coercion here intentionally mirrors
// features/flashcards/data/useGenerateCards.ts#coerceCard (that helper is not
// exported). If the flashcards feature exports it, collapse to that — do not let
// the two drift on card shape.

import { fcService } from "@/features/flashcards/data/fcService";
import type { NewCardInput } from "@/features/flashcards/data/types";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import { CONVERT_MANDATES } from "../mandates";
import { recordSourceLineage } from "../recordSourceLineage";
import { looseKey, segmentedGenerate } from "../segmentedGenerate";
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

/** Coerce one raw agent card object -> NewCardInput (drops unusable entries). */
function coerceCard(
  raw: unknown,
  docId: string,
  anchorFileId: string,
): NewCardInput | null {
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
  // Per-card lineage points at the ingest anchor file (fcService writes a
  // card->file `source` edge when file_id is set), keeping the agent-echoed
  // chunk/page for the citation locator.
  const source = anchorFileId
    ? {
        file_id: anchorFileId,
        processed_document_id:
          isRecord(rawSource) &&
          typeof rawSource.processed_document_id === "string"
            ? rawSource.processed_document_id
            : docId || undefined,
        chunk_id:
          isRecord(rawSource) && typeof rawSource.chunk_id === "string"
            ? rawSource.chunk_id
            : undefined,
        page:
          isRecord(rawSource) && typeof rawSource.page === "number"
            ? rawSource.page
            : undefined,
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

function rawCardsOf(value: unknown): unknown[] {
  const obj = isRecord(value) ? value : {};
  if (Array.isArray(obj.cards)) return obj.cards;
  if (Array.isArray(obj.flashcards)) return obj.flashcards;
  return Array.isArray(value) ? (value as unknown[]) : [];
}

function agentTitle(value: unknown): string {
  const obj = isRecord(value) ? value : {};
  if (typeof obj.title === "string" && obj.title.trim()) return obj.title.trim();
  return "";
}

async function run(
  request: ConvertRequest,
  ctx: ConvertContext,
): Promise<ConvertResult> {
  const { source, options } = request;
  const anchorFileId = source.ref?.fileId ?? "";
  // The agent grounds cards against chunk markers + echoes document_id back.
  const docId = (source.ref?.processedDocumentId ?? anchorFileId) || "ingest";
  const baseTitle = source.title ?? "Study material";

  const covered = await segmentedGenerate<NewCardInput>({
    ctx,
    source,
    targetKind: "deck",
    options,
    mandateKey: CONVERT_MANDATES.deckFromSource,
    surfaceKey: "education-ingest-deck",
    sourceFeature: "education-ingest",
    variables: (segment, plan) => ({
      source_content: segment.text,
      // The section name rides in the title the agent already declares, so a
      // multi-section run needs no new agent variable and the model still knows
      // which part of the document it is covering.
      title:
        plan.segments.length > 1
          ? `${baseTitle} - section ${segment.index} of ${segment.total}: ${segment.label}`
          : baseTitle,
      count: String(segment.items),
      difficulty: options?.difficulty ?? "Mixed",
      focus: options?.focus ?? "",
    }),
    extract: (value) =>
      rawCardsOf(value)
        .map((c) => coerceCard(c, docId, anchorFileId))
        .filter((c): c is NewCardInput => c !== null),
    // Two sections that both define the same term produce the same card; ship
    // it once.
    identity: (card) => looseKey(card.front),
  });

  const cards = covered.items;
  if (cards.length === 0) {
    throw new Error("The deck generator returned no usable cards");
  }

  // On a multi-section run the agent's per-section title names a section, not
  // the deck, so the source's own title wins.
  const setName = covered.plan.singlePass
    ? agentTitle(covered.firstValue) || source.title || "Study deck"
    : source.title || agentTitle(covered.firstValue) || "Study deck";

  // Single-writer contract (D-WP3): a single-pass run's stream also materializes
  // its flashcard render block via the canonical adapter, so it goes through the
  // conversation-scoped dedupe path and exactly ONE fc_set exists. A segmented
  // run is background by construction (no render block to race), so it creates
  // the set directly.
  const created = await fcService.createGeneratedSetForConversation(
    covered.conversationId,
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

  const trust = mergeTrustEnvelopes(cards.map((c) => c.trust));
  const detail = `${cards.length} card${cards.length === 1 ? "" : "s"}`;
  const result: ConvertResult = {
    targetKind: "deck",
    artifactId: setId,
    resourceType: "fc_set",
    href: `/education/flashcards/${setId}`,
    title: setName,
    trust,
    // A gap is never swallowed: the student is told which sections are missing
    // and that "Add more" fills them.
    detail: covered.gapNote ? `${detail} - ${covered.gapNote}` : detail,
  };

  // Set-level lineage edge -> the origin (ingest anchor file OR entity source).
  await recordSourceLineage(result, source, ctx.orgId);

  return result;
}

export const deckGenerator: ConvertGenerator = {
  targetKind: "deck",
  label: "Flashcard deck",
  available: true,
  capability: "education.generate_cards",
  run,
};

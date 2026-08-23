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
// Card coercion is THE ONE reader in features/flashcards/data/coerce-card.ts
// (per-card lineage points at the ingest anchor file so fcService writes the
// card -> file `source` edge; the agent-echoed chunk/page stays for citations).

import { fcService } from "@/features/flashcards/data/fcService";
import type { NewCardInput } from "@/features/flashcards/data/types";
import {
  coerceCards,
  setTitleOf,
} from "@/features/flashcards/data/coerce-card";
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
    // The provision's full offer (flashcards.generate_from_source) — the same
    // superset every from-source caller sends.
    variables: (segment, plan) => ({
      source_content: segment.text,
      document_id: docId,
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
    extract: (value) => coerceCards(value, { anchorFileId, docId }),
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
    ? setTitleOf(covered.firstValue) || source.title || "Study deck"
    : source.title || setTitleOf(covered.firstValue) || "Study deck";

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

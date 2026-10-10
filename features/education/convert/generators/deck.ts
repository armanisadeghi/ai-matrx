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
import {
  isNearDuplicateQA,
  looseKey,
  segmentedGenerate,
} from "../segmentedGenerate";
import { mergeTrustEnvelopes } from "../trustMerge";
import { groundKitTrust } from "../groundKitCitations";
import type {
  ConvertContext,
  ConvertGenerator,
  ConvertRequest,
  ConvertResult,
} from "../types";
import { sectionRunTitle } from "../coverage";
import { DEFAULT_DECK_CARD_COUNT, foldSteer, outlineRunCount, steeredSectionIds } from "../steering";
import { dropRepeats, readExistingKitItems, type ExistingItem } from "../existingItems";
import { readOutlineGroups } from "@/features/education/kits/outline/outlineService";
import { OUTLINE_SECTION_KEY } from "@/features/education/kits/outline/types";

async function run(
  request: ConvertRequest,
  ctx: ConvertContext,
): Promise<ConvertResult> {
  const { source, options } = request;
  const anchorFileId = source.ref?.fileId ?? "";
  // The agent grounds cards against chunk markers + echoes document_id back.
  const docId = (source.ref?.processedDocumentId ?? anchorFileId) || "ingest";
  const baseTitle = source.title ?? "Study material";
  const steer = options?.steer;
  const kitId = source.ref?.kitId;

  // A KIT run (living-kit W2): never repeat a card any deck of the kit holds,
  // and when the kit has an outline, run per outline section (decision 4) —
  // each section's cited text + key facts is one group, so every card knows
  // its section and coverage counts it by id.
  const existing: ExistingItem[] = kitId ? await readExistingKitItems(kitId, "cards") : [];
  const outline = kitId ? await readOutlineGroups(kitId, steeredSectionIds(steer)) : null;
  const focus = foldSteer(
    { ...(steer ?? {}), existing: existing.map((e) => e.text) },
    "cards",
    options?.focus,
  );
  const runSource = outline
    ? { ...source, text: outline.groups.map((g) => g.text).join("\n\n") }
    : source;

  const covered = await segmentedGenerate<NewCardInput>({
    ctx,
    source: runSource,
    groups: outline?.groups,
    targetKind: "deck",
    options: { ...options, count: outlineRunCount(options?.count, Boolean(outline), DEFAULT_DECK_CARD_COUNT) },
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
          ? sectionRunTitle(baseTitle, segment)
          : baseTitle,
      count: String(segment.items),
      difficulty: options?.difficulty ?? "Mixed",
      focus,
    }),
    extract: (value) =>
      dropRepeats(
        coerceCards(value, { anchorFileId, docId }).map((card) => ({
          ...card,
          trust: groundKitTrust(card.trust, source.ref?.kitSources),
        })),
        existing,
        (card) => ({ text: card.front, answer: card.back }),
      ),
    // Two sections that both define the same term produce the same card; ship
    // it once.
    identity: (card) => looseKey(card.front),
    // "What is osmosis?" written twice by two sections is one card.
    sameAs: (a, b) =>
      isNearDuplicateQA(
        { question: a.front, answer: a.back },
        { question: b.front, answer: b.back },
      ),
  });

  // Every card made from an outline section carries it (topic + section id).
  const cards = outline
    ? covered.items.map((card) => {
        const g = covered.groupOf(card);
        const section = g === undefined ? undefined : outline.sections[g];
        if (!section) return card;
        return {
          ...card,
          topic: section.title,
          metadata: { ...(card.metadata ?? {}), [OUTLINE_SECTION_KEY]: section.id },
        };
      })
    : covered.items;
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
    { runKey: covered.runKey },
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
  result.lineage = await recordSourceLineage(result, source, ctx.orgId);

  return result;
}

export const deckGenerator: ConvertGenerator = {
  targetKind: "deck",
  label: "Flashcard deck",
  available: true,
  capability: "education.generate_cards",
  run,
};

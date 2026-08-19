// features/flashcards/utils/deckPrintData.ts
//
// DB-backed deck → the canonical flashcards printer's data shape.
//
// The printer (components/mardown-display/blocks/flashcards/flashcards-printer.ts)
// speaks the markdown-lane `Flashcard` shape. A DB deck is `CardWithDetails[]`,
// so ONE mapper owns the translation — and it reuses the shared primitives
// rather than re-deriving anything:
//   - faces  → `studyFaces` (cloze cards print occluded/revealed, never raw
//              `{{c1::}}` markup; formula cards print their rendered back)
//   - images → `getCardImages` (the ONE image adapter)
//
// IMAGE RULE: a print window is a fresh, unauthenticated document — it can load
// exactly what any browser can fetch anonymously. So only the durable
// `image_url` travels; a `file_id`-only image is SKIPPED (same constraint the
// anon public-deck lane lives under — see features/flashcards/FEATURE.md
// § Images). `skippedImageCount` lets the caller say so out loud instead of
// silently printing a deck with holes in it.

import type { Flashcard } from "@/components/mardown-display/blocks/flashcards/flashcard-parser";
import type { CardWithDetails, FcSetRow } from "../data/types";
import { studyFaces } from "./cardVariants";
import { getCardImages } from "../components/study/cardImages";

export interface DeckPrintData {
  title: string;
  cards: Flashcard[];
  /** Face images that exist but can't reach the print window (stored file, no durable URL). */
  skippedImageCount: number;
}

export function buildDeckPrintData(
  set: Pick<FcSetRow, "name">,
  cards: CardWithDetails[],
): DeckPrintData {
  let skippedImageCount = 0;

  const printCards: Flashcard[] = cards.map((card) => {
    const faces = studyFaces(card);
    const images = getCardImages(card);

    const durable = (face: "front" | "back") => {
      const img = images[face];
      if (!img) return { url: undefined, alt: undefined };
      if (!img.url) {
        skippedImageCount += 1;
        return { url: undefined, alt: undefined };
      }
      return { url: img.url, alt: img.alt };
    };

    const front = durable("front");
    const back = durable("back");

    return {
      front: faces.front,
      back: faces.back,
      frontImageUrl: front.url ?? null,
      frontImageAlt: front.alt ?? null,
      backImageUrl: back.url ?? null,
      backImageAlt: back.alt ?? null,
    };
  });

  return {
    title: set.name?.trim() || "Flashcards",
    cards: printCards,
    skippedImageCount,
  };
}

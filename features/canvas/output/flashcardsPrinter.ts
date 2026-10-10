/**
 * The flashcards print adapter: `@ai-matrx/print`'s deck printer, fed every
 * stored shape of a deck. A deck is stored (and arrives from a message) as
 * `Front:/Back:` markdown — in a message block's body, or as a canvas row's
 * `{ data }` — and as `{ cards }` / `flashcard_set` values. The printer reads
 * only cards, so markdown goes through the block's OWN parser
 * (`flashcard-parser`) first; a shape nothing can read is handed on untouched
 * and the printer answers null (the composer's default path), never "no cards".
 */

import type { BlockPrinter } from "@ai-matrx/print/core";
// The lazy pair: label/variants/settings are static, the renderer (deck layouts + KaTeX) loads on first print.
import { flashcardsPrinterLazy } from "@ai-matrx/print/flashcards-lazy";
import { parseFlashcards } from "@/components/mardown-display/blocks/flashcards/flashcard-parser";

const MAX_DEPTH = 3;

/** The `{ title?, cards }` the printer reads, from any stored deck shape; the input itself when unreadable. */
export function flashcardsPrintData(data: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return data;
  if (typeof data === "string") {
    const parsed = parseFlashcards(data);
    if (parsed.flashcards.length > 0) {
      return { ...(parsed.title ? { title: parsed.title } : {}), cards: parsed.flashcards };
    }
    const text = data.trim();
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        return flashcardsPrintData(JSON.parse(text), depth + 1);
      } catch {
        return data;
      }
    }
    return data;
  }
  if (data && typeof data === "object" && !Array.isArray(data) && !("cards" in data)) {
    const wrapped = (data as { data?: unknown; content?: unknown }).data ?? (data as { content?: unknown }).content;
    if (typeof wrapped === "string" || (wrapped && typeof wrapped === "object")) {
      const inner = flashcardsPrintData(wrapped, depth + 1);
      if (inner !== wrapped) {
        const title = (data as { title?: unknown }).title;
        return typeof title === "string" && inner && typeof inner === "object" && !("title" in inner)
          ? { ...(inner as object), title }
          : inner;
      }
    }
  }
  return data;
}

export const flashcardsAdapterPrinter: BlockPrinter = {
  ...flashcardsPrinterLazy,
  print: (data, variantId, settings) => flashcardsPrinterLazy.print(flashcardsPrintData(data), variantId, settings),
  toPrintHtml: (data, context) => flashcardsPrinterLazy.toPrintHtml!(flashcardsPrintData(data), context),
};

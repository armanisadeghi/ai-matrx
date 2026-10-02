/**
 * convertibleContent — gate for the "Convert to flashcards / quiz" message
 * action (the ratified click-to-convert pattern's chat affordance).
 *
 * A message is convertible when its markdown carries enumerable structure the
 * study generators can chew on: a markdown table, or a real list (3+ items).
 * Plain prose stays generic — the convert action hides rather than offering a
 * conversion that would produce junk. Fenced code blocks are stripped first so
 * a code sample containing `|` pipes or `- ` lines never false-positives.
 *
 * Pure module — unit-tested in `__tests__/convertibleContent.test.ts`.
 */

import { replaceFences } from "@/lib/markdown/code-ranges";
import { tableStartsAt } from "@/components/mardown-display/markdown-classification/processors/utils/gfm-table-lines";

/** A bullet or ordered list item with real content. */
const LIST_ITEM = /^\s*(?:[-*+]|\d{1,3}[.)])\s+\S/;

const MIN_LIST_ITEMS = 3;

/** Drop fenced code blocks (``` / ~~~) so their contents can't false-match. */
function stripCodeFences(content: string): string {
  return replaceFences(content, () => ""); // THE one code-range rule
}

/**
 * True when the markdown contains a table (a row line followed by a
 * separator line) or a list of at least `MIN_LIST_ITEMS` items.
 */
export function hasConvertibleContent(content: string): boolean {
  if (!content || content.trim().length === 0) return false;
  const lines = stripCodeFences(content).split("\n");

  let listItems = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A table by THE GFM rule (gfm-table-lines): a header — edge pipes
    // optional — over its delimiter row.
    if (tableStartsAt(lines, i)) {
      return true;
    }
    if (LIST_ITEM.test(line)) {
      listItems += 1;
      if (listItems >= MIN_LIST_ITEMS) return true;
    }
  }
  return false;
}

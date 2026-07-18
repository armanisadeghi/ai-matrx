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

/** A table row: `| a | b |` (leading pipe required, at least two cells). */
const TABLE_ROW = /^\s*\|.*\|\s*$/;
/** The header separator row: `| --- | :---: |` variants. */
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;
/** A bullet or ordered list item with real content. */
const LIST_ITEM = /^\s*(?:[-*+]|\d{1,3}[.)])\s+\S/;

const MIN_LIST_ITEMS = 3;

/** Drop fenced code blocks (``` / ~~~) so their contents can't false-match. */
function stripCodeFences(content: string): string {
  return content.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1\s*$/gm, "");
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
    if (
      TABLE_ROW.test(line) &&
      i + 1 < lines.length &&
      TABLE_SEPARATOR.test(lines[i + 1])
    ) {
      return true;
    }
    if (LIST_ITEM.test(line)) {
      listItems += 1;
      if (listItems >= MIN_LIST_ITEMS) return true;
    }
  }
  return false;
}

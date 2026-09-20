// features/masterwork/components/detail/__tests__/n12-masterworks-freshness-wraps.test.ts
//
// N12 (cold-walk-13, common-docs/projects/masterwork-methods-census/
// jobs-bar-2026-09-16/cold-walk-13/README.md): at 390x844 the Rulebook home's
// Masterworks block read "Every Masterwork is usi…" with no way to read the
// rest of the sentence — `masterworkFreshnessLine` was rendered inside a
// `truncate` span (white-space: nowrap; overflow: hidden; text-overflow:
// ellipsis) fighting a fixed-width percentage badge for one line.
//
// This repo has no React testing library and jsdom computes no layout (see
// the rule-row-squeeze Playwright guard next door for the real-browser
// pattern), so — following the convention already used for this same
// component family in ../../archivedItemsLaw.test.ts — this is a SOURCE-TEXT
// forcing function: it fails the moment the freshness-line span goes back to
// a single-line `truncate` class, and passes only when the line is free to
// wrap onto a second line on narrow widths.

import { readFileSync } from "node:fs";
import path from "node:path";

const SOURCE_PATH = path.join(__dirname, "..", "RulebookKpiStrip.tsx");

function readSource(): string {
  return readFileSync(SOURCE_PATH, "utf8");
}

/** Isolates the freshness-line row: the flex row immediately followed by the
 * `{freshnessLine}` span and the "% on your current rules" badge. */
function freshnessRowBlock(source: string): string {
  const anchor = source.indexOf("{freshnessLine}");
  if (anchor === -1) {
    throw new Error(
      "masterworkFreshnessLine's rendered {freshnessLine} span was not found — RulebookKpiStrip.tsx changed shape.",
    );
  }
  return source.slice(Math.max(0, anchor - 300), anchor + 200);
}

describe("N12 — Masterworks freshness line wraps on narrow widths", () => {
  it("does not render the sentence in a single-line truncated span", () => {
    const block = freshnessRowBlock(readSource());
    // The exact regression: `<span className="truncate">{freshnessLine}</span>`
    // clips the sentence with an ellipsis and gives the Expert no way to read
    // the rest of it on a narrow phone.
    expect(block).not.toMatch(/className="truncate">\s*\{freshnessLine\}/);
  });

  it("lets the sentence wrap instead of forcing one line", () => {
    const block = freshnessRowBlock(readSource());
    // `break-words` (or an equivalent wrap-permitting class) on the span
    // itself is what makes the sentence readable in full once the parent row
    // is also allowed to grow past one line.
    expect(block).toMatch(/\{freshnessLine\}/);
    const spanMatch = block.match(/<span className="([^"]*)">\{freshnessLine\}/);
    expect(spanMatch).not.toBeNull();
    const spanClassName = spanMatch![1];
    expect(spanClassName).not.toContain("truncate");
  });

  it("lets the row grow to a second line instead of clipping its children", () => {
    const block = freshnessRowBlock(readSource());
    const rowMatch = block.match(/<div className="([^"]*)">/);
    expect(rowMatch).not.toBeNull();
    const rowClassName = rowMatch![1];
    // `flex-wrap` (not a bare `flex`) is what lets the percentage badge drop
    // to its own line instead of squeezing the sentence into an ellipsis.
    expect(rowClassName).toContain("flex-wrap");
  });
});

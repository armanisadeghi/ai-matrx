/**
 * RC-B11 — the passage identity and the ONE resolver.
 *
 * Real use case: a dental-hygiene study guide on periodontal charting, where
 * a student highlights "chart it in red 🦷" — an emoji (a surrogate pair in
 * JavaScript, one code point in Postgres) and a phrase that also appears
 * elsewhere, so first-match would bind the wrong one.
 *
 * WHAT BREAKS EACH TEST: offsets emitted in UTF-16 instead of code points;
 * a resolver that picks the first similar phrase; a resolver that paints a
 * changed passage instead of orphaning it; an anchor carried through an edit
 * that touched it; a suggestion that rewrites bytes outside its block.
 */

import { spliceSave, tokenizeSource, blockEdit } from "@ai-matrx/content-ir/source";
import { anchorHoldsIn, buildTextAnchor, codePointLength, textAnchorProblem } from "../anchor";
import { bestContextMatch, mapAnchorThroughChanges, resolveAnchor } from "../resolve";
import { applySuggestion, SuggestionApplyError } from "../suggestion";

const GUIDE =
  "# Periodontal charting\n\n" +
  "Record six probing depths per tooth. A pocket deeper than 4 mm on bleeding points to active " +
  "disease — chart it in red 🦷 and re-probe at the next recall.\n\n" +
  "## Recall visit\n\n" +
  "At the recall, compare with the last chart. If it grew, chart it in red 🦷 again and refer.";

const QUOTE = "chart it in red 🦷";

function anchorAt(body: string, quote: string, occurrence = 0, version = 1) {
  let at = -1;
  for (let i = 0; i <= occurrence; i += 1) at = body.indexOf(quote, at + 1);
  return buildTextAnchor(body, at, at + quote.length, version);
}

describe("text_anchor", () => {
  it("measures in Unicode code points, never UTF-16", () => {
    const a = anchorAt(GUIDE, QUOTE);
    expect(a.end - a.start).toBe(codePointLength(QUOTE));
    expect(a.end - a.start).not.toBe(QUOTE.length); // the emoji is 2 UTF-16 units
    expect(textAnchorProblem(a)).toBeNull();
    expect(anchorHoldsIn(a, GUIDE)).toBe(true);
    // the offsets index the body exactly as Postgres substr() would
    expect([...GUIDE].slice(a.start, a.end).join("")).toBe(QUOTE);
  });

  it("refuses the transitional UTF-16 shape the database refuses", () => {
    const a = anchorAt(GUIDE, QUOTE);
    expect(textAnchorProblem({ ...a, end: a.start + QUOTE.length })).toMatch(/code-point length/);
    expect(textAnchorProblem({ ...a, content_version: 0 })).toMatch(/content_version/);
    expect(textAnchorProblem({ ...a, color: "red" })).toMatch(/no field "color"/);
  });
});

describe("resolveAnchor — exact → mapped → context → orphaned, never first-match", () => {
  it("is exact at the captured version", () => {
    const a = anchorAt(GUIDE, QUOTE, 1);
    const r = resolveAnchor({ anchor: a, body: GUIDE, contentVersion: 1 });
    expect(r.status).toBe("exact");
    expect(GUIDE.slice(r.start16, r.end16)).toBe(QUOTE);
    expect(r.start16).toBe(GUIDE.lastIndexOf(QUOTE));
  });

  it("maps the SECOND occurrence through an edit above it (never the first)", () => {
    const a = anchorAt(GUIDE, QUOTE, 1);
    const edited = GUIDE.replace("Record six probing depths", "Record all six probing depths carefully");
    const r = resolveAnchor({ anchor: a, body: edited, contentVersion: 2, capturedBody: GUIDE });
    expect(r.status).toBe("mapped");
    expect(r.start16).toBe(edited.lastIndexOf(QUOTE));
  });

  it("uses prefix AND suffix to pick the right repeat when no old body is readable", () => {
    const a = anchorAt(GUIDE, QUOTE, 1);
    // the passage moved (a paragraph inserted above), no version store to diff
    const moved = GUIDE.replace("## Recall visit", "## Recall visit\n\nBring the X-rays.");
    const r = resolveAnchor({ anchor: a, body: moved, contentVersion: 5 });
    expect(r.status).toBe("context");
    expect(r.start16).toBe(moved.lastIndexOf(QUOTE));
  });

  it("orphans an ambiguous repeat instead of guessing", () => {
    const a = { ...anchorAt(GUIDE, QUOTE, 0), prefix: undefined, suffix: undefined };
    delete a.prefix;
    delete a.suffix;
    const shifted = `Intro line.\n${GUIDE}`;
    const hit = bestContextMatch({ ...a, start: 99999 }, shifted);
    expect(hit.kind).toBe("ambiguous");
    const r = resolveAnchor({ anchor: { ...a, start: 99999, end: 99999 + (a.end - a.start) }, body: shifted, contentVersion: 9 });
    expect(r.status).toBe("orphaned");
    expect(r.reason).toMatch(/more than one place/);
  });

  it("orphans a passage whose words were changed, with an honest reason", () => {
    const a = anchorAt(GUIDE, QUOTE, 0);
    const changed = GUIDE.replaceAll(QUOTE, "mark it in red");
    const r = resolveAnchor({ anchor: a, body: changed, contentVersion: 2, capturedBody: GUIDE });
    expect(r.status).toBe("orphaned");
    expect(r.reason).toMatch(/changed or removed/);
  });
});

describe("mapAnchorThroughChanges — the editor's splice carries anchors exactly", () => {
  it("shifts an anchor below the edited block and drops one the edit touched", () => {
    const blocks = tokenizeSource(GUIDE);
    const first = blocks.find((b) => b.raw.startsWith("Record six"))!;
    const splice = spliceSave(GUIDE, [blockEdit(first, first.raw.replace("six", "all six"))]);
    const below = anchorAt(GUIDE, QUOTE, 1);
    const inside = anchorAt(GUIDE, QUOTE, 0);
    const movedBelow = mapAnchorThroughChanges(below, splice.changes, splice.text, 2);
    expect(movedBelow).not.toBeNull();
    expect(movedBelow!.content_version).toBe(2);
    expect(anchorHoldsIn(movedBelow!, splice.text)).toBe(true);
    // the edit changed "six" in the same paragraph but not the quote itself → still carried
    const carried = mapAnchorThroughChanges(inside, splice.changes, splice.text, 2);
    expect(carried && anchorHoldsIn(carried, splice.text)).toBe(true);
    // an edit INSIDE the passage is never silently carried
    const b2 = tokenizeSource(GUIDE).find((b) => b.raw.startsWith("Record six"))!;
    const s2 = spliceSave(GUIDE, [blockEdit(b2, b2.raw.replace("chart it in red", "chart it in blue"))]);
    expect(mapAnchorThroughChanges(inside, s2.changes, s2.text, 2)).toBeNull();
  });
});

describe("applySuggestion — accept splices only the touched block", () => {
  it("changes exactly the passage and keeps every other byte", () => {
    const a = anchorAt(GUIDE, QUOTE, 1);
    const { nextBody, splice } = applySuggestion(GUIDE, 1, a, "chart it in red and photograph it");
    expect(nextBody).toBe(GUIDE.slice(0, GUIDE.lastIndexOf(QUOTE)) + "chart it in red and photograph it" + GUIDE.slice(GUIDE.lastIndexOf(QUOTE) + QUOTE.length));
    expect(splice.integrity.ok).toBe(true);
    // the first occurrence (another block) is untouched
    expect(nextBody.indexOf(QUOTE)).toBe(GUIDE.indexOf(QUOTE));
  });

  it("refuses to apply to a passage that has since changed", () => {
    const a = anchorAt(GUIDE, QUOTE, 1);
    const changed = GUIDE.replaceAll(QUOTE, "note it");
    expect(() => applySuggestion(changed, 2, a, "x")).toThrow(SuggestionApplyError);
  });
});

/**
 * @jest-environment jsdom
 *
 * A projection outlives the DOM it was taken from: the reader re-renders (a
 * live note, a streamed reply) and the MutationObserver re-projects only after
 * a debounce. In that window every consumer used the old map — a text node
 * that got shorter threw IndexSizeError from Range.comparePoint, a node React
 * removed threw WrongDocumentError, and the selection toolbar's `eligible`
 * check for Comment crashed (alchemy:actions, 2026-10-03).
 *
 * WHAT BREAKS EACH TEST: projection functions that trust a mapped node's
 * recorded length or tree membership instead of re-checking the live node.
 */

import { projectSource, projectionIsCurrent, rangeToSource, sourceOffsetAtPoint, sourceToRanges } from "../projection";

const SOURCE = "First paragraph of the note.\n\nSecond paragraph, which the editor will shorten.";

function render(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = "<p>First paragraph of the note.</p><p>Second paragraph, which the editor will shorten.</p>";
  document.body.appendChild(root);
  return root;
}

/** A selection that ends on an element boundary (the probe path). */
function selectAll(root: HTMLElement): Range {
  const range = document.createRange();
  range.setStart(root.querySelector("p")!.firstChild!, 0);
  range.setEnd(root, root.childNodes.length);
  return range;
}

describe("projection — stale map after the DOM changed", () => {
  it("a shortened text node never throws IndexSizeError", () => {
    const root = render();
    const p = projectSource(root, SOURCE);
    (root.querySelectorAll("p")[1].firstChild as Text).data = "Second.";
    expect(projectionIsCurrent(p, root)).toBe(false);
    expect(() => rangeToSource(p, selectAll(root))).not.toThrow();
    expect(() => sourceToRanges(p, 0, SOURCE.length)).not.toThrow();
  });

  it("a removed text node never throws WrongDocumentError", () => {
    const root = render();
    const p = projectSource(root, SOURCE);
    root.querySelectorAll("p")[1].remove();
    expect(projectionIsCurrent(p, root)).toBe(false);
    expect(() => rangeToSource(p, selectAll(root))).not.toThrow();
    const mapped = rangeToSource(p, selectAll(root))!;
    expect(SOURCE.slice(mapped.start, mapped.end)).toBe("First paragraph of the note.");
  });

  it("a stale node is never painted or hit", () => {
    const root = render();
    const p = projectSource(root, SOURCE);
    const second = root.querySelectorAll("p")[1].firstChild as Text;
    second.data = "Second.";
    const ranges = sourceToRanges(p, SOURCE.indexOf("Second"), SOURCE.length);
    expect(ranges).toHaveLength(0);
    expect(sourceOffsetAtPoint(p, document, 0, 0)).toBeNull();
  });

  it("an untouched DOM keeps its projection current", () => {
    const root = render();
    const p = projectSource(root, SOURCE);
    expect(projectionIsCurrent(p, root)).toBe(true);
    const mapped = rangeToSource(p, selectAll(root))!;
    expect(SOURCE.slice(mapped.start, mapped.end)).toBe(SOURCE);
  });
});

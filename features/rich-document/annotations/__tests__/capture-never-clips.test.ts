/**
 * @jest-environment jsdom
 *
 * A drag over a whole paragraph stored only its last line ("r reordered." —
 * mid-word) as the quote. Cause: a start boundary inside a rendered text node
 * the projection does not hold snaps FORWARD to the next mapped text, so the
 * quote silently shrinks to the tail. The guard is `unmappedSelectedChars`:
 * capture re-maps once and refuses when selected prose still has no place in
 * the source.
 *
 * WHAT BREAKS EACH TEST: dropping the unmapped-coverage check (the clip
 * returns, count is 0), or counting nodes outside the selection.
 */

import { projectSource, rangeToSource, unmappedSelectedChars } from "../projection";

const SOURCE = "Let me know if this one renders correctly on your end, and feel free to flag any other items you'd like added or reordered.";

function rootWith(...parts: string[]): HTMLElement {
  const root = document.createElement("div");
  const p = document.createElement("p");
  for (const part of parts) p.appendChild(document.createTextNode(part));
  root.appendChild(p);
  document.body.appendChild(root);
  return root;
}

function wholeParagraph(root: HTMLElement): Range {
  const nodes = [...root.querySelector("p")!.childNodes];
  const range = document.createRange();
  range.setStart(nodes[0], 0);
  range.setEnd(nodes[nodes.length - 1], (nodes[nodes.length - 1] as Text).data.length);
  return range;
}

describe("capture never stores less than was selected", () => {
  it("a head node that is not in the source clips to the tail — and is counted", () => {
    // Curly apostrophe: the head does not occur verbatim in the source.
    const root = rootWith("Let me know if this one renders correctly on your end, and feel free to flag any other items you’d like added o", "r reordered.");
    const projection = projectSource(root, SOURCE);
    const range = wholeParagraph(root);
    const mapped = rangeToSource(projection, range)!;
    expect(SOURCE.slice(mapped.start, mapped.end)).toBe("r reordered."); // the clip itself
    expect(unmappedSelectedChars(projection, root, range)).toBeGreaterThan(0); // the guard sees it
  });

  it("a node added after the map was taken is counted until the map is retaken", () => {
    const root = rootWith("Let me know if this one renders correctly on your end, ");
    const stale = projectSource(root, SOURCE);
    root.querySelector("p")!.appendChild(document.createTextNode("and feel free to flag any other items you'd like added or reordered."));
    const range = wholeParagraph(root);
    expect(unmappedSelectedChars(stale, root, range)).toBeGreaterThan(0);
    expect(unmappedSelectedChars(projectSource(root, SOURCE), root, range)).toBe(0);
  });

  it("a fully mapped paragraph split mid-word counts zero and captures all of it", () => {
    const root = rootWith(SOURCE.slice(0, SOURCE.length - 12), SOURCE.slice(-12));
    const projection = projectSource(root, SOURCE);
    const range = wholeParagraph(root);
    expect(unmappedSelectedChars(projection, root, range)).toBe(0);
    const mapped = rangeToSource(projection, range)!;
    expect(SOURCE.slice(mapped.start, mapped.end)).toBe(SOURCE);
  });

  it("an unmapped node the selection does not touch is not counted", () => {
    const root = rootWith("Not in the source at all, ", SOURCE);
    const projection = projectSource(root, SOURCE);
    const range = document.createRange();
    const second = root.querySelector("p")!.childNodes[1] as Text;
    range.setStart(second, 0);
    range.setEnd(second, second.data.length);
    expect(unmappedSelectedChars(projection, root, range)).toBe(0);
  });
});

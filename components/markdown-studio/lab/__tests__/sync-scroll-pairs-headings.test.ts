/**
 * FORCING FUNCTION: scroll sync pairs source headings with RENDERED headings,
 * whose text carries the anchor link ("Fleet inventory#").
 *
 * THE DEFECT (verifier round 1, row 20): scrolling the preview to 50% moved the
 * source 195 px of 46,751 — the rendered heading text ended in the anchor "#",
 * never equalled the source heading, so nothing paired and the sync fell back
 * to a proportional guess that drifted by whole sections.
 */
import { buildPairedCheckpoints, normalizeHeading } from "../sync-scroll";

const SOURCE = [
  "# Q3 report", // 0
  "",
  "Intro.",
  "",
  "## Fleet inventory", // 4
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "## Step 10: prepare (go)", // 10
  "",
  "Body.",
].join("\n");

function preview(headings: Array<[string, number]>): HTMLElement {
  const root = document.createElement("div");
  for (const [text, top] of headings) {
    const h = document.createElement("h2");
    h.textContent = text;
    h.getBoundingClientRect = () => ({ top, left: 0, right: 0, bottom: top + 20, width: 0, height: 20, x: 0, y: top, toJSON: () => ({}) });
    root.appendChild(h);
  }
  root.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) });
  return root;
}

it("a rendered heading's anchor never stops it pairing with its source line", () => {
  expect(normalizeHeading("Fleet inventory#")).toBe(normalizeHeading("Fleet inventory"));
  const paired = buildPairedCheckpoints(
    SOURCE,
    preview([
      ["Q3 report#", 0],
      ["Fleet inventory#", 900],
      ["Step 10: prepare (go)#", 2400],
    ]),
  );
  expect(paired).toEqual({ lines: [0, 4, 10], renderPx: [0, 900, 2400] });
});

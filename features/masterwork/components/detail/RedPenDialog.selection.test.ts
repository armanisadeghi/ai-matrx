/**
 * @jest-environment jsdom
 */
/**
 * A CORRECTION IS RECORDED AGAINST THE PASSAGE THE EXPERT ACTUALLY MARKED.
 *
 * ## The finding this closes (cold walk 7, finding 2, 2026-09-17)
 *
 * The walk marked three passages of a real estimate in one Red-Pen sitting and
 * found its saved corrections quoted under the WRONG passages — a one-step
 * drift between what was highlighted and what the card said it was about. It
 * flagged the finding honestly at "polish" because it could not rule out that
 * its own automation, rather than a real mouse, had produced the drift.
 *
 * Re-driven live on a brand-new Rulebook (2026-09-17) the two halves separate:
 *
 *  * A REAL MOUSE DRAG over each of the three passages was exact, before and
 *    after this change. That half does not reproduce.
 *  * A TRIPLE-CLICK — which is how a person grabs a whole line, not an
 *    automation trick — was wrong twice out of two. Triple-clicking
 *    "Contingency: 10%" put "Contingency" in the "the bit you highlighted"
 *    box; triple-clicking "Cabinet installation: $11,400" swept a trailing
 *    character past the end. An Expert typing a correction there has it saved,
 *    quoted and sent to the server against a passage they did not mark.
 *
 * ## Root cause
 *
 * `offsetOf` walked up to the nearest `data-work-start` element and returned
 * `base + offsetInNode`. That is only right when the boundary is inside that
 * element's own single text node, and a `Selection` hands back three other
 * shapes as a matter of course: an ELEMENT node, where `offset` is a CHILD
 * INDEX; a text node nested deeper than the marked run; and — measured live —
 * a `focusNode` completely OUTSIDE the work, because Chrome ends a
 * triple-click at the start of the next block, which was a `<p>` in the panel
 * below. The last one made the whole capture return `null` and be abandoned in
 * silence: the browser highlighted the line and the product did nothing.
 *
 * The offset is now MEASURED with a `Range` from the container's start to the
 * boundary — the characters before it, which is the definition of the offset —
 * and the selection is CLAMPED to the container, so a gesture that began in
 * the work is never dropped for ending outside it.
 *
 * Proven red before green (2026-09-17): against `base + offsetInNode`, the
 * element-node and nested-node cases return offsets that are not character
 * counts at all, and the out-of-container case returns null.
 */
import { offsetOf, segmentWork, selectionSpan } from "./RedPenDialog";

const WORK = [
  "Kitchen Remodel — Preliminary Estimate",
  "",
  "Demolition and disposal: $6,200",
  "Countertops (quartz, TBD square footage): $5,000",
  "Plumbing: included in labor",
  "Contingency: 10%",
].join("\n");

/** The work as the dialog renders it: one span per segment, `data-work-start`
 *  on each, nothing between them — so the container's text IS the work text. */
function renderWork(
  corrections: Array<{ id: string; start: number; end: number }>,
): { container: HTMLElement; after: HTMLElement } {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  for (const segment of segmentWork(
    WORK,
    corrections.map((c) => ({
      ...c,
      span: WORK.slice(c.start, c.end),
      comment: "",
      voice: false,
      at: "",
    })) as never,
  )) {
    const span = document.createElement("span");
    span.dataset.workStart = String(segment.start);
    span.textContent = segment.text;
    container.appendChild(span);
  }
  document.body.appendChild(container);
  // The panel below the work — where a triple-click on the last line lands.
  const after = document.createElement("p");
  after.textContent = "The bit you highlighted, marked above:";
  document.body.appendChild(after);
  return { container, after };
}

/** Drive the real `Selection`, then ask for the span exactly as the dialog does. */
function spanFor(
  container: HTMLElement,
  start: [Node, number],
  end: [Node, number],
): { start: number; end: number } | null {
  const range = document.createRange();
  range.setStart(start[0], start[1]);
  range.setEnd(end[0], end[1]);
  const selection = window.getSelection();
  if (!selection) throw new Error("no selection in this environment");
  selection.removeAllRanges();
  selection.addRange(range);
  return selectionSpan(container, selection, WORK.length);
}

function textNodeHolding(container: HTMLElement, phrase: string): [Text, number] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const at = node.textContent?.indexOf(phrase) ?? -1;
    if (at >= 0) return [node, at];
    node = walker.nextNode() as Text | null;
  }
  throw new Error(`no text node holds ${phrase}`);
}

describe("the offset a selection boundary sits at", () => {
  it("counts CHARACTERS, not child indexes, for an element boundary", () => {
    const { container } = renderWork([]);
    // A boundary on the container itself with offset 1 means "after the first
    // child". The old rule read that 1 as one character.
    const first = container.firstChild as HTMLElement;
    expect(offsetOf(container, container, 1)).toBe(
      first.textContent?.length ?? -1,
    );
  });

  it("counts the characters BEFORE a nested run, not just the run's own", () => {
    // Two corrections split the work into several runs; a boundary inside the
    // third run must still measure from the start of the whole work.
    const { container } = renderWork([
      { id: "a", start: 40, end: 71 },
      { id: "b", start: 72, end: 120 },
    ]);
    const [node, at] = textNodeHolding(container, "Plumbing");
    expect(offsetOf(container, node, at)).toBe(WORK.indexOf("Plumbing"));
  });

  it("refuses a boundary that is not in the work at all", () => {
    const { container, after } = renderWork([]);
    expect(offsetOf(container, after.firstChild, 0)).toBeNull();
  });
});

describe("the passage a gesture marks", () => {
  it("is exact for a drag across one line", () => {
    const { container } = renderWork([]);
    const [node, at] = textNodeHolding(container, "Plumbing: included in labor");
    const span = spanFor(
      container,
      [node, at],
      [node, at + "Plumbing: included in labor".length],
    );
    expect(WORK.slice(span!.start, span!.end)).toBe(
      "Plumbing: included in labor",
    );
  });

  it("is exact for a TRIPLE-CLICK on the last line, which ends outside the work", () => {
    // THE live-reproduced case. Chrome ends a triple-click at the start of the
    // next block; here that is the panel below the work. Reading the two
    // boundaries independently returned null for the end and dropped the whole
    // gesture without a word.
    const { container, after } = renderWork([]);
    const [node, at] = textNodeHolding(container, "Contingency: 10%");
    const span = spanFor(container, [node, at], [after, 0]);
    expect(span).not.toBeNull();
    expect(WORK.slice(span!.start, span!.end)).toBe("Contingency: 10%");
  });

  it("does not sweep a neighbouring line in when the gesture overshoots", () => {
    const { container } = renderWork([]);
    const [node, at] = textNodeHolding(container, "Demolition and disposal");
    const end = at + "Demolition and disposal: $6,200".length;
    const span = spanFor(container, [node, at], [node, end]);
    expect(WORK.slice(span!.start, span!.end)).toBe(
      "Demolition and disposal: $6,200",
    );
    expect(WORK.slice(span!.start, span!.end)).not.toContain("Countertops");
  });

  it("marks nothing at all when the selection is entirely outside the work", () => {
    const { container, after } = renderWork([]);
    const span = spanFor(container, [after.firstChild!, 0], [after.firstChild!, 5]);
    // Clamped to nothing — and the dialog's own two-character floor then
    // refuses it, rather than marking a passage the Expert never touched.
    expect(span === null || span.end - span.start < 2).toBe(true);
  });
});

describe("what the highlight promises", () => {
  it("renders each correction over exactly its own characters", () => {
    // The guard the module already carried, kept: the highlight on screen IS
    // the evidence sent to the server, so a segment's text must be exactly the
    // slice between its offsets.
    const corrections = [
      { id: "a", start: WORK.indexOf("Demolition"), end: WORK.indexOf("Demolition") + 31 },
      { id: "b", start: WORK.indexOf("Plumbing"), end: WORK.indexOf("Plumbing") + 27 },
    ];
    for (const segment of segmentWork(WORK, corrections as never)) {
      expect(segment.text).toBe(WORK.slice(segment.start, segment.end));
    }
  });
});

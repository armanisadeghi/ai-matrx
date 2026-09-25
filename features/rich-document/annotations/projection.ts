// features/rich-document/annotations/projection.ts
//
// SOURCE ⇄ RENDERED TEXT. The anchor names the canonical SOURCE body (the
// markdown the store holds); the reader selects RENDERED text. This module
// aligns the two without touching either:
//
//   - every rendered text node that is a literal run of the source is located
//     in the source, in order, from a moving cursor (a text node between
//     formatting marks IS a contiguous substring of the markdown);
//   - text the renderer invented (KaTeX output, callout titles, copy-button
//     labels, footnote numbers) does not occur at the cursor and is left
//     UNMAPPED — it can be neither captured nor painted, and it never drags
//     the cursor forward (short runs may only match close to the cursor);
//   - explicit non-content chrome is skipped outright: elements marked
//     `data-annotation-skip`, buttons, inputs, `aria-hidden`, KaTeX MathML.
//
// Capture maps a DOM Range to a source range; paint maps a source range back
// to DOM Ranges for the CSS Custom Highlight API. The DOM is only READ.

export interface MappedTextNode {
  node: Text;
  /** UTF-16 offset in the source where this node's text begins. */
  sourceStart: number;
  length: number;
}

export interface SourceProjection {
  nodes: MappedTextNode[];
  /** Rendered characters that could not be placed in the source. */
  unmappedChars: number;
}

export const CONTENT_CHROME_ATTR = "data-content-chrome";

/**
 * THE ONE MARKER: the renderer puts `data-content-chrome` on every element whose
 * text it invents (heading anchors, default callout titles, "Figure 1." prefixes,
 * the table of contents, wikilink/embed/cross-reference labels, code-block
 * language labels). Besides it, only structure no renderer file of ours emits:
 * controls, hidden text, KaTeX output (a formula's text is never its TeX source),
 * and remark-gfm's footnote numbers.
 */
const SKIP_SELECTOR = [
  `[${CONTENT_CHROME_ATTR}]`,
  "[data-annotation-skip]",
  "button", "input", "textarea", "select", "[role=tab]", "[role=menuitem]",
  "[aria-hidden='true']", ".sr-only", ".katex",
  "[data-footnote-ref]", "[data-footnote-backref]", "#footnote-label",
  "script", "style",
].join(",");

/** A run with no letters or digits (a stray "#", "·", "?") may only match right at the cursor. */
const PUNCTUATION_ONLY = /^[^\p{L}\p{N}]+$/u;
const PUNCTUATION_WINDOW = 4;

/** How far ahead of the cursor a run may match, by its length (anti-drift). */
function windowFor(length: number): number {
  if (length >= 24) return Number.POSITIVE_INFINITY;
  if (length >= 8) return 4000;
  return 400;
}

export function collectTextNodes(root: Node): Text[] {
  const out: Text[] = [];
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent) return 2; // FILTER_REJECT
      if (parent.closest(SKIP_SELECTOR)) return 2;
      if (!(node as Text).data) return 2;
      return 1; // FILTER_ACCEPT
    },
  });
  let n = walker.nextNode();
  while (n) {
    out.push(n as Text);
    n = walker.nextNode();
  }
  return out;
}

/** Align rendered text nodes under `root` with `source`. Pure read. */
export function projectSource(root: Node, source: string): SourceProjection {
  const nodes: MappedTextNode[] = [];
  let cursor = 0;
  let unmappedChars = 0;
  for (const node of collectTextNodes(root)) {
    const text = node.data;
    if (!text.trim()) {
      // Whitespace-only nodes between blocks: map only if they sit at the cursor.
      if (source.startsWith(text, cursor)) {
        nodes.push({ node, sourceStart: cursor, length: text.length });
        cursor += text.length;
      }
      continue;
    }
    const at = source.indexOf(text, cursor);
    const limit = PUNCTUATION_ONLY.test(text) ? PUNCTUATION_WINDOW : windowFor(text.length);
    if (at >= 0 && at - cursor <= limit) {
      nodes.push({ node, sourceStart: at, length: text.length });
      cursor = at + text.length;
    } else {
      unmappedChars += text.length;
    }
  }
  return { nodes, unmappedChars };
}

function findMapped(projection: SourceProjection, node: Node): MappedTextNode | undefined {
  return projection.nodes.find((m) => m.node === node);
}

/**
 * Resolve a DOM boundary (container, offset) to a source offset, snapping a
 * boundary inside unmapped/element positions to the nearest mapped text in
 * `direction` (forward for a start, backward for an end).
 */
function boundaryToSource(
  projection: SourceProjection,
  container: Node,
  offset: number,
  direction: "forward" | "backward",
): number | null {
  if (container.nodeType === 3) {
    const hit = findMapped(projection, container);
    if (hit) return hit.sourceStart + Math.min(offset, hit.length);
  }
  // Order mapped nodes relative to the boundary.
  const doc = container.ownerDocument;
  if (!doc) return null;
  const probe = doc.createRange();
  try {
    probe.setStart(container, offset);
  } catch {
    return null;
  }
  const list = projection.nodes;
  if (direction === "forward") {
    for (const m of list) {
      if (probe.comparePoint(m.node, 0) >= 0) return m.sourceStart;
    }
    return null;
  }
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const m = list[i];
    if (probe.comparePoint(m.node, m.length) <= 0) return m.sourceStart + m.length;
  }
  return null;
}

/** A DOM selection range → UTF-16 source range, or null when nothing mapped. */
export function rangeToSource(
  projection: SourceProjection,
  range: Range,
): { start: number; end: number } | null {
  const start = boundaryToSource(projection, range.startContainer, range.startOffset, "forward");
  const end = boundaryToSource(projection, range.endContainer, range.endOffset, "backward");
  if (start == null || end == null || end <= start) return null;
  return { start, end };
}

/**
 * A UTF-16 source range → DOM Ranges over the rendered text it covers. The
 * markup characters inside the range (e.g. `**`) have no rendered node and
 * are simply not painted. Empty when nothing of it is rendered.
 */
export function sourceToRanges(
  projection: SourceProjection,
  start: number,
  end: number,
): Range[] {
  const out: Range[] = [];
  for (const m of projection.nodes) {
    const a = Math.max(start, m.sourceStart);
    const b = Math.min(end, m.sourceStart + m.length);
    if (b <= a) continue;
    const doc = m.node.ownerDocument;
    const r = doc.createRange();
    r.setStart(m.node, a - m.sourceStart);
    r.setEnd(m.node, b - m.sourceStart);
    out.push(r);
  }
  return out;
}

/** The source offset under a point, via the caret APIs; null when none. */
export function sourceOffsetAtPoint(
  projection: SourceProjection,
  doc: Document,
  x: number,
  y: number,
): number | null {
  type CaretDoc = Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const d = doc as CaretDoc;
  let node: Node | null = null;
  let offset = 0;
  if (typeof d.caretPositionFromPoint === "function") {
    const pos = d.caretPositionFromPoint(x, y);
    if (pos) {
      node = pos.offsetNode;
      offset = pos.offset;
    }
  } else if (typeof d.caretRangeFromPoint === "function") {
    const r = d.caretRangeFromPoint(x, y);
    if (r) {
      node = r.startContainer;
      offset = r.startOffset;
    }
  }
  if (!node || node.nodeType !== 3) return null;
  const hit = findMapped(projection, node);
  return hit ? hit.sourceStart + Math.min(offset, hit.length) : null;
}

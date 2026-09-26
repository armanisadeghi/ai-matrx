import { fenceLineKinds } from "@ai-matrx/content-ir/source";
import { findTableEnd, tableStartsAt } from "@/components/mardown-display/markdown-classification/processors/utils/gfm-table-lines";
// components/markdown-studio/lab/sync-scroll.ts
//
// Block-paired scroll sync between a raw markdown textarea and its rendered
// preview: raw text is split into structural segments, paired with the
// rendered top-level blocks, and scroll positions map piecewise-linearly
// between the checkpoints (proportional fallback when they cannot pair).
// Extracted from the admin Markdown Tester (2026-09-23, RC-B1) so the
// Markdown Studio gets the same sync instead of a cruder proportional one.

/**
 * Structural segment from raw markdown text.
 * Each segment covers a contiguous range of lines that map to
 * a single rendered block (paragraph, heading, code block, list, etc.).
 */
export interface TextSegment {
  startLine: number;
  endLine: number;
  type:
    | "heading"
    | "code"
    | "hr"
    | "list"
    | "blockquote"
    | "table"
    | "paragraph"
    | "blank";
}

/**
 * Parses raw markdown into structural segments. Each segment represents
 * one "rendered block" — the unit that will become a single top-level
 * DOM element in the preview.
 */
export function parseTextSegments(text: string): TextSegment[] {
  const lines = text.split("\n");
  // Fenced code by THE one code-range rule (@ai-matrx/content-ir/source).
  const kinds = fenceLineKinds(text);
  const segments: TextSegment[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Blank lines
    if (trimmed === "") {
      const start = i;
      while (i < lines.length && lines[i].trim() === "") i++;
      segments.push({ startLine: start, endLine: i, type: "blank" });
      continue;
    }

    // Fenced code block
    if (kinds[i] === "open") {
      const start = i;
      i++;
      while (i < lines.length && (kinds[i] === "body" || kinds[i] === "close")) {
        const closes = kinds[i] === "close";
        i++;
        if (closes) break;
      }
      segments.push({ startLine: start, endLine: i, type: "code" });
      continue;
    }

    // Heading
    if (/^#{1,6}\s/.test(trimmed)) {
      segments.push({ startLine: i, endLine: i + 1, type: "heading" });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      segments.push({ startLine: i, endLine: i + 1, type: "hr" });
      i++;
      continue;
    }

    // List item (unordered or ordered) — consume the entire list
    if (/^[-*+]\s|^\d+[.)]\s/.test(trimmed)) {
      const start = i;
      i++;
      while (i < lines.length) {
        const lt = lines[i].trim();
        if (lt === "") {
          i++;
          break;
        }
        i++;
      }
      segments.push({ startLine: start, endLine: i, type: "list" });
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      const start = i;
      i++;
      while (
        i < lines.length &&
        (lines[i].trim().startsWith(">") ||
          (lines[i].trim() !== "" && lines[i - 1]?.trim().startsWith(">")))
      )
        i++;
      segments.push({ startLine: start, endLine: i, type: "blockquote" });
      continue;
    }

    // Table (line with pipes)
    // THE GFM table rule (gfm-table-lines): a header over its delimiter row.
    if (tableStartsAt(lines, i)) {
      const start = i;
      i = findTableEnd(lines, i);
      segments.push({ startLine: start, endLine: i, type: "table" });
      continue;
    }

    // Paragraph — consecutive non-blank, non-special lines
    {
      const start = i;
      i++;
      while (i < lines.length) {
        const lt = lines[i].trim();
        if (
          lt === "" ||
          /^#{1,6}\s/.test(lt) ||
          kinds[i] === "open" ||
          /^(-{3,}|\*{3,}|_{3,})$/.test(lt) ||
          /^[-*+]\s|^\d+[.)]\s/.test(lt) ||
          lt.startsWith(">") ||
          // A GFM table interrupts a paragraph (THE rule, gfm-table-lines).
          (tableStartsAt(lines, i))
        )
          break;
        i++;
      }
      segments.push({ startLine: start, endLine: i, type: "paragraph" });
    }
  }

  return segments;
}

/**
 * Heading text as a reader sees it: no markup, no `{#id}`, no rendered anchor
 * link (`Fleet inventory#`), lower-case, one space.
 */
export function normalizeHeading(text: string): string {
  return text
    .replace(/\{#[^}]*\}\s*$/, "")
    .replace(/\s*#+\s*$/, "")
    .replace(/[*_`~[\]]/g, "")
    .replace(/\(([^)]*)\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Builds paired checkpoints between the raw text (in LINES) and the rendered
 * preview (in scroll pixels).
 *
 * Strategy (2026-09-26, verifier round 1 row 20): HEADINGS are the anchors. The
 * k-th source heading is paired with the rendered heading of the same text, in
 * order, and positions interpolate between those pairs. The previous pairing
 * matched the i-th source segment with the i-th rendered element — but a table,
 * code block or list renders many matched elements, so the pairs drifted and
 * half-way down the preview mapped to the first screen of the source. The
 * source side is measured in lines, not pixels, because CodeMirror only knows
 * the pixel height of lines it has drawn; everything else is an estimate that
 * moves the moment it is drawn. Without headings the caller maps proportionally.
 */
export function buildPairedCheckpoints(
  text: string,
  scrollContainer: HTMLElement,
): { lines: number[]; renderPx: number[] } | null {
  const textLines = text.split("\n");
  const sourceHeadings = parseTextSegments(text)
    .filter((s) => s.type === "heading")
    .map((s) => ({ line: s.startLine, key: normalizeHeading((textLines[s.startLine] ?? "").replace(/^\s*#{1,6}\s+/, "")) }));
  const containerRect = scrollContainer.getBoundingClientRect();
  const scrollY = scrollContainer.scrollTop;
  const renderedHeadings = Array.from(scrollContainer.querySelectorAll("h1, h2, h3, h4, h5, h6"))
    .filter((el) => !el.closest("pre, code, table"))
    .map((el) => ({ top: el.getBoundingClientRect().top - containerRect.top + scrollY, key: normalizeHeading(el.textContent ?? "") }));
  if (sourceHeadings.length === 0 || renderedHeadings.length === 0) return null;

  const lines: number[] = [0];
  const renderPx: number[] = [0];
  let r = 0;
  for (const h of sourceHeadings) {
    let j = r;
    while (j < renderedHeadings.length && renderedHeadings[j]!.key !== h.key) j++;
    if (j >= renderedHeadings.length) continue; // not rendered (yet) — skip, keep order
    const px = renderedHeadings[j]!.top;
    // Keep the pairs strictly increasing on both sides.
    if (h.line > lines[lines.length - 1]! && px > renderPx[renderPx.length - 1]!) {
      lines.push(h.line);
      renderPx.push(px);
    }
    r = j + 1;
  }
  return lines.length >= 2 ? { lines, renderPx } : null;
}

/**
 * Maps a scroll position from source checkpoints to target checkpoints
 * using piecewise linear interpolation. Falls back to proportional
 * mapping when checkpoints are insufficient.
 */
export function mapScroll(
  scrollTop: number,
  srcPoints: number[],
  tgtPoints: number[],
  srcMax: number,
  tgtMax: number,
): number {
  if (srcPoints.length < 2 || tgtPoints.length < 2 || srcMax <= 0) {
    return tgtMax > 0 && srcMax > 0 ? (scrollTop / srcMax) * tgtMax : 0;
  }

  // Before first checkpoint
  if (scrollTop <= srcPoints[0]) {
    return tgtPoints[0];
  }

  // Between checkpoints — piecewise interpolation
  for (let i = 0; i < srcPoints.length - 1; i++) {
    if (scrollTop >= srcPoints[i] && scrollTop <= srcPoints[i + 1]) {
      const segLen = srcPoints[i + 1] - srcPoints[i];
      const frac = segLen > 0 ? (scrollTop - srcPoints[i]) / segLen : 0;
      return tgtPoints[i] + frac * (tgtPoints[i + 1] - tgtPoints[i]);
    }
  }

  // Past last checkpoint — proportional for the remainder
  const lastSrc = srcPoints[srcPoints.length - 1];
  const lastTgt = tgtPoints[tgtPoints.length - 1];
  const remaining = srcMax - lastSrc;
  const tgtRemaining = tgtMax - lastTgt;
  if (remaining <= 0) return lastTgt;
  const frac = (scrollTop - lastSrc) / remaining;
  return lastTgt + frac * tgtRemaining;
}

/**
 * Which pane is the person driving? The one under the pointer, else the one
 * holding focus. A scroll event from the other pane is the sync's own write
 * landing (a frame or a re-measure later) and must not be mirrored back — that
 * ping-pong is what snapped a scrolled pane back (verifier round 1, row 20).
 * With neither signal (a script, a touch fling) the event leads.
 */
export function paneLeads(mine: HTMLElement, other: HTMLElement): boolean {
  if (mine.matches(":hover")) return true;
  if (other.matches(":hover")) return false;
  const active = typeof document === "undefined" ? null : document.activeElement;
  if (active && mine.contains(active)) return true;
  if (active && other.contains(active)) return false;
  return true;
}

/**
 * The editor side of the sync, in LINES (0-based, fractional inside a wrapped
 * line): which line sits at the top of the viewport, and how to put a line
 * there. The Markdown Studio's source is THE rich editor's Source view
 * (CodeMirror, which measures lines only once drawn); a plain textarea is the
 * fixed-line-height case.
 */
export interface SyncSource {
  el: HTMLElement;
  lineCount: number;
  topLine: () => number;
  scrollToLine: (line: number) => void;
}

export function textareaSyncSource(ta: HTMLTextAreaElement): SyncSource {
  const lineHeight = parseFloat(window.getComputedStyle(ta).lineHeight) || 20;
  return {
    el: ta,
    lineCount: ta.value.split("\n").length,
    topLine: () => ta.scrollTop / lineHeight,
    scrollToLine: (line) => {
      ta.scrollTop = line * lineHeight;
    },
  };
}

/**
 * Checkpoints are expensive on a big document (a re-parse of the whole text
 * plus a layout read of every rendered heading) and scroll events fire at frame
 * rate — so they are computed ONCE per (text, preview height) and reused until
 * the text changes or the preview re-lays out (a diagram drawing, a block
 * mounting).
 */
const checkpointCache = new WeakMap<
  HTMLElement,
  { text: string; scrollHeight: number; paired: ReturnType<typeof buildPairedCheckpoints> }
>();

function cachedCheckpoints(text: string, preview: HTMLElement) {
  const hit = checkpointCache.get(preview);
  if (hit && hit.text === text && hit.scrollHeight === preview.scrollHeight) return hit.paired;
  const paired = buildPairedCheckpoints(text, preview);
  checkpointCache.set(preview, { text, scrollHeight: preview.scrollHeight, paired });
  return paired;
}

/**
 * Map the scrolling pane's position onto the other pane, heading-paired when
 * the raw text and rendered DOM share headings, proportional otherwise.
 * `direction` says which pane is scrolling.
 */
export function syncPaneScroll(args: {
  text: string;
  source: SyncSource;
  preview: HTMLElement;
  direction: "text-to-preview" | "preview-to-text";
}): void {
  const { text, source, preview, direction } = args;
  const lastLine = Math.max(1, source.lineCount - 1);
  const pvMax = preview.scrollHeight - preview.clientHeight;
  const paired = cachedCheckpoints(text, preview);
  if (direction === "text-to-preview") {
    const line = source.topLine();
    preview.scrollTop = paired
      ? Math.max(0, mapScroll(line, paired.lines, paired.renderPx, lastLine, pvMax))
      : (line / lastLine) * pvMax;
  } else {
    const line = paired
      ? Math.max(0, mapScroll(preview.scrollTop, paired.renderPx, paired.lines, pvMax, lastLine))
      : pvMax > 0
        ? (preview.scrollTop / pvMax) * lastLine
        : 0;
    source.scrollToLine(line);
  }
}

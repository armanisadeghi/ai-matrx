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

/** Heading text as a reader sees it: no markup, no `{#id}`, lower-case, one space. */
function normalizeHeading(text: string): string {
  return text
    .replace(/\{#[^}]*\}\s*$/, "")
    .replace(/[*_`~[\]]/g, "")
    .replace(/\(([^)]*)\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Builds paired checkpoints between raw text and rendered preview.
 *
 * Strategy (2026-09-26, verifier round 1 row 20): HEADINGS are the anchors. The
 * k-th source heading is paired with the rendered heading of the same text, in
 * order, and scroll positions interpolate between those pairs. The previous
 * pairing matched the i-th source segment with the i-th rendered element —
 * but a table, code block or list renders many matched elements, so the pairs
 * drifted and half-way down the preview mapped to the first screen of the
 * source. Heading text is the same on both sides, so a pair is never wrong;
 * without headings the caller falls back to proportional mapping.
 */
export function buildPairedCheckpoints(
  text: string,
  lineTop: (lineIndex: number) => number,
  scrollContainer: HTMLElement,
): { textPx: number[]; renderPx: number[] } | null {
  const lines = text.split("\n");
  const sourceHeadings = parseTextSegments(text)
    .filter((s) => s.type === "heading")
    .map((s) => ({ line: s.startLine, key: normalizeHeading((lines[s.startLine] ?? "").replace(/^\s*#{1,6}\s+/, "")) }));
  const containerRect = scrollContainer.getBoundingClientRect();
  const scrollY = scrollContainer.scrollTop;
  const renderedHeadings = Array.from(scrollContainer.querySelectorAll("h1, h2, h3, h4, h5, h6"))
    .filter((el) => !el.closest("pre, code, table"))
    .map((el) => ({ top: el.getBoundingClientRect().top - containerRect.top + scrollY, key: normalizeHeading(el.textContent ?? "") }));
  if (sourceHeadings.length === 0 || renderedHeadings.length === 0) return null;

  const textPx: number[] = [0];
  const renderPx: number[] = [0];
  let r = 0;
  for (const h of sourceHeadings) {
    let j = r;
    while (j < renderedHeadings.length && renderedHeadings[j]!.key !== h.key) j++;
    if (j >= renderedHeadings.length) continue; // not rendered (yet) — skip, keep order
    const t = lineTop(h.line);
    const px = renderedHeadings[j]!.top;
    // Keep the pairs strictly increasing on both sides.
    if (t > textPx[textPx.length - 1]! && px > renderPx[renderPx.length - 1]!) {
      textPx.push(t);
      renderPx.push(px);
    }
    r = j + 1;
  }
  return textPx.length >= 2 ? { textPx, renderPx } : null;
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
 * The editor side of the sync: its scroll container, and where a source line
 * (0-based) sits in that container's scroll coordinates. The Markdown Studio's
 * source is THE rich editor's Source view (CodeMirror, wrapped lines, measured
 * per line); a plain textarea is the fixed-line-height case.
 */
export interface SyncSource {
  el: HTMLElement;
  lineTop: (lineIndex: number) => number;
}

export function textareaSyncSource(ta: HTMLTextAreaElement): SyncSource {
  const lineHeight = parseFloat(window.getComputedStyle(ta).lineHeight) || 20;
  return { el: ta, lineTop: (line) => line * lineHeight };
}

/**
 * Checkpoints are expensive on a big document (a re-parse of the whole text
 * plus a layout read of every rendered block) and scroll events fire at frame
 * rate — so they are computed ONCE per (text, both panes' heights) and reused
 * until the text changes or either pane re-lays out.
 */
const checkpointCache = new WeakMap<
  HTMLElement,
  { text: string; sourceHeight: number; scrollHeight: number; paired: ReturnType<typeof buildPairedCheckpoints> }
>();

function cachedCheckpoints(text: string, source: SyncSource, preview: HTMLElement) {
  const hit = checkpointCache.get(preview);
  if (hit && hit.text === text && hit.sourceHeight === source.el.scrollHeight && hit.scrollHeight === preview.scrollHeight) {
    return hit.paired;
  }
  const paired = buildPairedCheckpoints(text, source.lineTop, preview);
  checkpointCache.set(preview, { text, sourceHeight: source.el.scrollHeight, scrollHeight: preview.scrollHeight, paired });
  return paired;
}

/**
 * Map a source scroll position onto the target pane, block-paired when the
 * raw text and rendered DOM can be paired, proportional otherwise.
 * `direction` says which pane is scrolling.
 */
export function syncPaneScroll(args: {
  text: string;
  source: SyncSource;
  preview: HTMLElement;
  direction: "text-to-preview" | "preview-to-text";
}): void {
  const { text, source, preview, direction } = args;
  const ta = source.el;
  const taMax = ta.scrollHeight - ta.clientHeight;
  const pvMax = preview.scrollHeight - preview.clientHeight;
  const paired = cachedCheckpoints(text, source, preview);
  if (direction === "text-to-preview") {
    preview.scrollTop =
      paired && paired.textPx.length >= 2
        ? Math.max(0, mapScroll(ta.scrollTop, paired.textPx, paired.renderPx, taMax, pvMax))
        : taMax > 0
          ? (ta.scrollTop / taMax) * pvMax
          : 0;
  } else {
    ta.scrollTop =
      paired && paired.renderPx.length >= 2
        ? Math.max(0, mapScroll(preview.scrollTop, paired.renderPx, paired.textPx, pvMax, taMax))
        : pvMax > 0
          ? (preview.scrollTop / pvMax) * taMax
          : 0;
  }
}

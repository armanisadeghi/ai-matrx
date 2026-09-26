import { fenceLineKinds } from "@ai-matrx/content-ir/source";
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
    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(lines[i + 1]?.trim())
    ) {
      const start = i;
      i++;
      while (
        i < lines.length &&
        lines[i].trim().includes("|") &&
        lines[i].trim() !== ""
      )
        i++;
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
          lt.startsWith(">")
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
 * Finds rendered block elements and returns their offset and height
 * relative to the scroll container. Skips nested elements to avoid
 * double-counting (e.g. a <pre> inside a <div data-block-type>).
 */
export function getRenderedBlocks(
  scrollContainer: HTMLElement,
): Array<{ top: number; height: number }> {
  const blockSelectors =
    "p, h1, h2, h3, h4, h5, h6, pre, ul, ol, table, hr, blockquote, [data-block-type]";
  const allBlocks = scrollContainer.querySelectorAll(blockSelectors);
  const containerRect = scrollContainer.getBoundingClientRect();
  const scrollY = scrollContainer.scrollTop;

  const seen = new Set<Element>();
  const result: Array<{ top: number; height: number }> = [];

  allBlocks.forEach((el) => {
    // Skip if this element is nested inside another matched element
    let parent = el.parentElement;
    let isNested = false;
    while (parent && parent !== scrollContainer) {
      if (seen.has(parent)) {
        isNested = true;
        break;
      }
      parent = parent.parentElement;
    }
    if (isNested) return;

    seen.add(el);
    const rect = el.getBoundingClientRect();
    result.push({
      top: rect.top - containerRect.top + scrollY,
      height: rect.height,
    });
  });

  return result;
}

/**
 * Builds paired checkpoints between raw text and rendered preview.
 *
 * Strategy: parse the raw text into N non-blank segments, find N rendered
 * blocks, and create (segment-line-offset → rendered-pixel-offset) pairs.
 * If counts don't match, falls back to proportional scroll mapping.
 */
export function buildPairedCheckpoints(
  text: string,
  lineHeight: number,
  scrollContainer: HTMLElement,
): { textPx: number[]; renderPx: number[] } | null {
  const segments = parseTextSegments(text).filter((s) => s.type !== "blank");
  const renderedBlocks = getRenderedBlocks(scrollContainer);

  if (segments.length === 0 || renderedBlocks.length === 0) return null;

  // Build pairs: for each segment, map start line → rendered block top
  const count = Math.min(segments.length, renderedBlocks.length);
  const textPx: number[] = [0];
  const renderPx: number[] = [0];

  for (let i = 0; i < count; i++) {
    const textOffset = segments[i].startLine * lineHeight;
    const renderOffset = renderedBlocks[i].top;

    if (textOffset > 0) textPx.push(textOffset);
    if (renderOffset > 0) renderPx.push(renderOffset);

    // Also add end-of-segment checkpoints for large blocks (code, tables)
    if (
      segments[i].type === "code" ||
      segments[i].type === "table" ||
      segments[i].type === "list"
    ) {
      const textEnd = segments[i].endLine * lineHeight;
      const renderEnd = renderedBlocks[i].top + renderedBlocks[i].height;
      textPx.push(textEnd);
      renderPx.push(renderEnd);
    }
  }

  // Deduplicate and sort
  const uniqueText = [...new Set(textPx)].sort((a, b) => a - b);
  const uniqueRender = [...new Set(renderPx)].sort((a, b) => a - b);

  // Ensure same length by trimming to shorter
  const len = Math.min(uniqueText.length, uniqueRender.length);
  return {
    textPx: uniqueText.slice(0, len),
    renderPx: uniqueRender.slice(0, len),
  };
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
 * Map a source scroll position onto the target pane, block-paired when the
 * raw text and rendered DOM can be paired, proportional otherwise.
 * `direction` says which pane is scrolling.
 */
export function syncPaneScroll(args: {
  text: string;
  textarea: HTMLTextAreaElement;
  preview: HTMLElement;
  direction: "text-to-preview" | "preview-to-text";
}): void {
  const { text, textarea: ta, preview, direction } = args;
  const taMax = ta.scrollHeight - ta.clientHeight;
  const pvMax = preview.scrollHeight - preview.clientHeight;
  const lineHeight =
    parseFloat(window.getComputedStyle(ta).lineHeight) || 20;
  const paired = buildPairedCheckpoints(text, lineHeight, preview);
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

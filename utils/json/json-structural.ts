import { fenceParts, findCodeRanges } from "@ai-matrx/content-ir/source";
/**
 * Layer 0 — Structural Primitives
 *
 * Pure character-level utilities that every higher layer depends on.
 * No JSON.parse calls live here — only scanning, balancing, and fence detection.
 */

// =============================================================================
// Brace / Bracket Balancing
// =============================================================================

export interface BalanceResult {
  endIndex: number;
  isComplete: boolean;
}

/**
 * Starting *after* the opening character at `startIndex`, walk the string
 * tracking depth, string literals, and escape sequences. Returns the index
 * of the matching close character or the end of the string if incomplete.
 *
 * `startIndex` must point at the opening `{` or `[`.
 */
export function findBalancedEnd(
  text: string,
  startIndex: number,
  openChar: "{" | "[",
  closeChar: "}" | "]",
): BalanceResult {
  let depth = 1;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex + 1; i < text.length; i++) {
    const ch = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === "\\") {
      if (inString) escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return { endIndex: i, isComplete: true };
      }
    }
  }

  return { endIndex: text.length - 1, isComplete: false };
}

/**
 * Count how many unclosed openers remain in a partial JSON string.
 * Returns the sequence of close characters needed (e.g. `"]}"` ).
 *
 * Handles string literals and escape sequences correctly.
 */
export function computeClosingSequence(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === "\\") {
      if (inString) escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  return stack.reverse().join("");
}

// =============================================================================
// Fence Detection
// =============================================================================

export interface FencedBlock {
  content: string;
  language: string;
  fenceStart: number;
  contentStart: number;
  fenceEnd: number;
  isComplete: boolean;
}

/**
 * Every fenced block in `text`, in document order — THE one code-range rule
 * (@ai-matrx/content-ir/source): a fence opens only where a line starts with
 * it (never a mid-sentence ```), closes by the renderer's closer, and an
 * unclosed fence runs to the end (`isComplete: false`).
 */
export function findAllFencedBlocks(text: string): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  for (const range of findCodeRanges(text)) {
    if (range.kind !== "fence") continue;
    const parts = fenceParts(text.slice(range.start, range.end));
    const openerEnd = text.indexOf("\n", range.start);
    const contentStart = openerEnd === -1 || openerEnd >= range.end ? range.end : openerEnd + 1;
    blocks.push({
      content: parts?.body ?? text.slice(contentStart, range.end),
      language: (parts?.opener.lang ?? "").toLowerCase(),
      fenceStart: range.start,
      contentStart,
      fenceEnd: range.end,
      isComplete: parts?.closed ?? false,
    });
  }
  return blocks;
}

// =============================================================================
// Bare JSON Scanning
// =============================================================================

export interface BareJsonCandidate {
  startIndex: number;
  endIndex: number;
  openChar: "{" | "[";
  isComplete: boolean;
}

/**
 * Scan `text` for top-level `{` or `[` characters that are NOT inside
 * a fenced block. Returns all candidates with balanced-end info.
 *
 * `excludeRanges` is an array of [start, end) index pairs to skip
 * (typically the ranges covered by fenced blocks).
 */
export function findBareJsonCandidates(
  text: string,
  excludeRanges: Array<[number, number]> = [],
): BareJsonCandidate[] {
  const candidates: BareJsonCandidate[] = [];
  let inString = false;
  let escapeNext = false;

  const isExcluded = (idx: number): boolean =>
    excludeRanges.some(([s, e]) => idx >= s && idx < e);

  for (let i = 0; i < text.length; i++) {
    if (isExcluded(i)) continue;

    const ch = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === "\\") {
      if (inString) escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{" || ch === "[") {
      const closeChar = ch === "{" ? "}" : "]";
      const result = findBalancedEnd(text, i, ch, closeChar);
      candidates.push({
        startIndex: i,
        endIndex: result.endIndex,
        openChar: ch,
        isComplete: result.isComplete,
      });
      if (result.isComplete) {
        i = result.endIndex;
      } else {
        break;
      }
    }
  }

  return candidates;
}

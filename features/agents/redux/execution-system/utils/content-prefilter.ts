/**
 * Content Pre-Filter — Fast-reject layers for splitContentIntoBlocksV2
 *
 * Designed to run BEFORE any regex, JSON parsing, or XML extraction.
 * Returns a set of candidate categories for a given line so the main
 * parser can skip entire detection branches.
 *
 * Layer 0: Single-character scan (nanoseconds)
 * Layer 1: Cheap secondary validation (tens of nanoseconds)
 *
 * If no candidates are found → the line is guaranteed to be plain text.
 */

import { OUR_FILE_URL_MARKERS } from "@/lib/media/our-file-sources";

// ============================================================================
// CANDIDATE CATEGORIES
// ============================================================================

/**
 * Bit flags — a line can be a candidate for multiple categories simultaneously.
 * Using bits so the main parser can do `if (candidates & Candidate.CODE)`.
 */
export const Candidate = {
  NONE: 0,
  TEXT: 0, // No special block detected — plain text
  CODE: 1 << 0, // ``` fenced code block
  XML_SIMPLE: 1 << 1, // <thinking>, <flashcards>, etc.
  XML_ATTR: 1 << 2, // <decision prompt="...">, <artifact ...>
  TABLE: 1 << 3, // | col | col |
  IMAGE: 1 << 4, // ![alt](url) or [Image URL: ...]
  VIDEO: 1 << 5, // [Video URL: ...]
  MATRX: 1 << 6, // <<<MATRX_START>>>...<<<MATRX_END>>>
  DIVIDER: 1 << 7, // *** or # ===
  TREE: 1 << 8, // Box-drawing / ASCII tree characters
  BARE_JSON: 1 << 9, // { "key": ... } JSON object without code fences
  AUDIO: 1 << 10, // [Audio URL: ...] or a standalone …/clip.mp3 link
  MATRX_FILE: 1 << 11, // link/URL to one of OUR files (signed S3 / CDN / public / share)
} as const;

/**
 * Audio file extensions recognized when a standalone markdown/bare link points
 * at a clip. Optional `?query` tail keeps signed S3 URLs matching. Mirrors
 * AUDIO_URL_EXT + extractAudioLink in content-splitter-v2.ts — kept inline so
 * this fast-path prefilter stays dependency-free (same pattern as the XML tag
 * sets duplicated across the prefilter, accumulator, and splitter).
 */
const AUDIO_EXT_RE =
  /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|weba|webm)(\?[^\s)]*)?$/i;

function isStandaloneAudioLink(trimmed: string): boolean {
  const link = trimmed.match(/^!?\[.*?\]\((https?:\/\/[^\s)]+)\)$/);
  if (link) return AUDIO_EXT_RE.test(link[1]);
  if (/^https?:\/\/[^\s)]+$/.test(trimmed)) return AUDIO_EXT_RE.test(trimmed);
  return false;
}

/**
 * Cheap substring gate: does the line carry one of our file-host markers?
 * Reuses `OUR_FILE_URL_MARKERS` (imported at top) so it can't drift from the
 * real `recognizeOurFileUrl`. The gate only flags a CANDIDATE; the
 * splitter/accumulator confirm with the full recognizer.
 */
function mightBeOurFile(trimmed: string): boolean {
  for (let mi = 0; mi < OUR_FILE_URL_MARKERS.length; mi++) {
    if (trimmed.includes(OUR_FILE_URL_MARKERS[mi])) return true;
  }
  return false;
}

export type CandidateFlags = number;

// ============================================================================
// KNOWN XML TAG NAMES (for Layer 1 validation)
// ============================================================================

/**
 * Simple XML tags (no attributes). Sorted by frequency if you want,
 * but Set.has() is O(1) regardless.
 */
const SIMPLE_XML_TAGS = new Set([
  "thinking",
  "think",
  "reasoning",
  "info",
  "task",
  "database",
  "private",
  "plan",
  "event",
  "tool",
  "questionnaire",
  "flashcards",
  "cooking_recipe",
  "timeline",
  "progress_tracker",
  "troubleshooting",
  "resources",
  "research",
]);

/** Attribute-bearing XML tags */
const ATTR_XML_TAGS = new Set([
  "decision",
  "artifact",
  // Editor pill tags — carry attributes (file, line, severity, language, …)
  // so they're classified as ATTR. The chat-markdown renderer parses them
  // back into chips on load.
  "editor_error",
  "editor_code_snippet",
]);

/** All known XML tag names combined (for quick "is this one of ours?" check) */
const ALL_XML_TAGS = new Set([...SIMPLE_XML_TAGS, ...ATTR_XML_TAGS]);

// ============================================================================
// BOX-DRAWING CHARACTER SET (for tree detection)
// ============================================================================

/** Fast lookup for Unicode box-drawing characters */
const TREE_CHARS = new Set([
  "├",
  "└",
  "│",
  "┌",
  "┐",
  "┘",
  "┬",
  "┴",
  "┤",
  "┼",
  "─",
]);

// ============================================================================
// LAYER 0 + LAYER 1 COMBINED
// ============================================================================

/**
 * Scans a line and returns a bitmask of candidate categories.
 *
 * This scans the FULL line (not just the start) to support inline blocks
 * like "Hello <decision prompt="...">". The scan is still cheap because
 * we only look at individual characters — no regex, no string splitting.
 *
 * @param line     The raw line (before MATRX removal or trimming)
 * @param trimmed  The line after MATRX removal + trim (caller already has this)
 * @returns        Bitmask of Candidate flags
 */
export function classifyLine(line: string, trimmed: string): CandidateFlags {
  let flags: CandidateFlags = Candidate.NONE;

  // ── MATRX: check for `<<<` anywhere in the raw line ──────────────────
  // The full pattern is <<<MATRX_START>>>...<<<MATRX_END>>>
  // `<<<` is an extremely rare 3-char sequence, so this is nearly free.
  if (line.length >= 3) {
    const ltIdx = line.indexOf("<");
    if (
      ltIdx !== -1 &&
      ltIdx + 2 < line.length &&
      line[ltIdx + 1] === "<" &&
      line[ltIdx + 2] === "<"
    ) {
      // Layer 1: verify it's actually "<<<M" (MATRX_START begins with M)
      if (ltIdx + 3 < line.length && line[ltIdx + 3] === "M") {
        flags |= Candidate.MATRX;
      }
    }
  }

  // ── Scan trimmed line character-by-character ──────────────────────────
  // We track what we've found so we can bail early once all possible
  // candidates have been flagged.

  const len = trimmed.length;
  if (len === 0) return flags;

  // Fast checks based on first character of trimmed line
  const first = trimmed[0];

  // CODE: line starts with ` — need at least ```
  if (first === "`") {
    if (len >= 3 && trimmed[1] === "`" && trimmed[2] === "`") {
      flags |= Candidate.CODE;
    }
  }

  // BARE_JSON: line starts with { — potential JSON object without code fences
  if (first === "{") {
    flags |= Candidate.BARE_JSON;
  }

  // TABLE: line starts with |
  if (first === "|") {
    // Layer 1: must have a second | somewhere after position 0
    if (trimmed.indexOf("|", 1) !== -1) {
      flags |= Candidate.TABLE;
    }
  }

  // IMAGE: starts with ! — need ![
  if (first === "!" && len >= 2 && trimmed[1] === "[") {
    flags |= Candidate.IMAGE;
  }

  // DIVIDER: * * * or # ===
  if (first === "*" || first === "#") {
    if (first === "*") {
      // Quick check: does the trimmed line consist only of * and spaces?
      // Instead of regex, just verify no other chars exist
      if (isStarDivider(trimmed)) {
        flags |= Candidate.DIVIDER;
      }
    } else {
      // # followed by = signs
      if (len >= 4 && trimmed.indexOf("=") !== -1) {
        flags |= Candidate.DIVIDER;
      }
    }
  }

  // TREE: first char is a box-drawing character
  if (TREE_CHARS.has(first)) {
    flags |= Candidate.TREE;
  }

  // ── Inline scan: look for < | [ | ├└+ anywhere in the line ───────────
  // This catches inline XML tags, [Video URL:...], [Image URL:...],
  // and mid-line tree characters.
  //
  // We only enter this loop if we haven't already found everything.
  // For pure text lines (no special chars), indexOf('<') returns -1
  // and we skip the loop entirely.

  // XML tags (simple + attribute-bearing): scan for '<' then validate
  let searchFrom = 0;
  while (searchFrom < len) {
    const ltPos = trimmed.indexOf("<", searchFrom);
    if (ltPos === -1) break;

    // Skip if this is part of a <<< MATRX sequence (already handled above)
    if (
      ltPos + 2 < len &&
      trimmed[ltPos + 1] === "<" &&
      trimmed[ltPos + 2] === "<"
    ) {
      searchFrom = ltPos + 3;
      continue;
    }

    // Layer 1: character after < must be a letter (opening tag) or / (closing tag)
    if (ltPos + 1 < len) {
      const next = trimmed[ltPos + 1];
      if (isLetter(next)) {
        // Extract the tag name: read until space, >, or /
        const tagName = extractTagName(trimmed, ltPos + 1);
        if (tagName) {
          if (SIMPLE_XML_TAGS.has(tagName)) {
            flags |= Candidate.XML_SIMPLE;
          }
          if (ATTR_XML_TAGS.has(tagName)) {
            flags |= Candidate.XML_ATTR;
          }
        }
      }
      // Closing tags (</tagname>) — we don't need to flag these as candidates
      // for NEW blocks, but we could use them for state tracking later.
    }

    searchFrom = ltPos + 1;
  }

  // [Video URL: ...] or [Image URL: ...] or [Audio URL: ...] — inline brackets
  if (
    !(flags & Candidate.IMAGE) ||
    !(flags & Candidate.VIDEO) ||
    !(flags & Candidate.AUDIO)
  ) {
    const bracketIdx = trimmed.indexOf("[");
    if (bracketIdx !== -1) {
      // Layer 1: check the next few characters cheaply
      // [Image URL: / [Video URL: / [Audio URL: (all 10 chars)
      if (bracketIdx + 10 < len) {
        const after = trimmed[bracketIdx + 1];
        if (
          after === "I" &&
          trimmed.substring(bracketIdx + 1, bracketIdx + 11) === "Image URL:"
        ) {
          flags |= Candidate.IMAGE;
        } else if (
          after === "V" &&
          trimmed.substring(bracketIdx + 1, bracketIdx + 11) === "Video URL:"
        ) {
          flags |= Candidate.VIDEO;
        } else if (
          after === "A" &&
          trimmed.substring(bracketIdx + 1, bracketIdx + 11) === "Audio URL:"
        ) {
          flags |= Candidate.AUDIO;
        }
      }
    }
  }

  // Standalone audio link: `[label](…/clip.mp3)`, `![…](…)`, or a bare audio
  // URL occupying the whole line. Gated on a cheap first-char check so plain
  // text never pays for the regex.
  if (
    !(flags & Candidate.AUDIO) &&
    (first === "[" || first === "!" || first === "h") &&
    isStandaloneAudioLink(trimmed)
  ) {
    flags |= Candidate.AUDIO;
  }

  // Inline table: | somewhere not at start (rare, but you want inline support)
  if (!(flags & Candidate.TABLE) && first !== "|") {
    // Only check if | exists at all
    if (trimmed.indexOf("|") !== -1) {
      // For inline tables we'd need | ... | pattern — at least two pipes
      const firstPipe = trimmed.indexOf("|");
      if (firstPipe !== -1 && trimmed.indexOf("|", firstPipe + 1) !== -1) {
        flags |= Candidate.TABLE;
      }
    }
  }

  // Inline tree characters (not at start)
  if (!(flags & Candidate.TREE)) {
    for (let ci = 1; ci < len; ci++) {
      if (TREE_CHARS.has(trimmed[ci])) {
        flags |= Candidate.TREE;
        break;
      }
    }
  }

  // ASCII tree patterns: lines starting with whitespace/│ followed by ├└+|
  if (
    !(flags & Candidate.TREE) &&
    (first === " " ||
      first === "\t" ||
      first === "│" ||
      first === "|" ||
      first === "+")
  ) {
    if (looksLikeAsciiTree(trimmed)) {
      flags |= Candidate.TREE;
    }
  }

  // Our-own-file link: a markdown link or bare URL pointing at a file we
  // generated and stored. Cheap substring gate; the splitter/accumulator
  // confirm with the full `recognizeOurFileUrl`.
  if (!(flags & Candidate.MATRX_FILE) && mightBeOurFile(trimmed)) {
    flags |= Candidate.MATRX_FILE;
  }

  return flags;
}

// ============================================================================
// LAYER 1 HELPERS (all inlined / no regex)
// ============================================================================

/** Check if a character is a-z or A-Z */
function isLetter(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

/**
 * Starting at `start` (the character after '<'), reads lowercase letters,
 * underscores, and digits to extract a tag name. Returns null if no valid
 * tag name found.
 */
function extractTagName(str: string, start: number): string | null {
  let end = start;
  while (end < str.length) {
    const c = str.charCodeAt(end);
    // a-z, A-Z, 0-9, _ (underscore = 95)
    if (
      (c >= 97 && c <= 122) ||
      (c >= 65 && c <= 90) ||
      (c >= 48 && c <= 57) ||
      c === 95
    ) {
      end++;
    } else {
      break;
    }
  }
  if (end === start) return null;
  return str.substring(start, end).toLowerCase();
}

/** Checks if trimmed line is a * * * style divider (only * and spaces) */
function isStarDivider(trimmed: string): boolean {
  let starCount = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "*") {
      starCount++;
    } else if (ch !== " ") {
      return false;
    }
  }
  return starCount >= 3;
}

/** Cheap heuristic for ASCII tree lines like "  ├── foo" or "  +-- bar" */
function looksLikeAsciiTree(trimmed: string): boolean {
  // Skip leading whitespace, │, |
  let i = 0;
  while (i < trimmed.length) {
    const ch = trimmed[i];
    if (ch === " " || ch === "\t" || ch === "│" || ch === "|") {
      i++;
    } else {
      break;
    }
  }
  if (i >= trimmed.length) return false;
  const ch = trimmed[i];
  // Must hit a connector character: ├ └ +
  return ch === "├" || ch === "└" || ch === "+";
}

// ============================================================================
// CONVENIENCE: check if a line is guaranteed plain text
// ============================================================================

export function isPlainText(flags: CandidateFlags): boolean {
  return flags === Candidate.NONE;
}

/**
 * Quick check for whether flags include a specific candidate.
 * Usage: `if (hasCandidate(flags, Candidate.CODE)) { ... }`
 */
export function hasCandidate(
  flags: CandidateFlags,
  candidate: number,
): boolean {
  return (flags & candidate) !== 0;
}

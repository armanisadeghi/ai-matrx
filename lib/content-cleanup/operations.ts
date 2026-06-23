// lib/content-cleanup/operations.ts
//
// The cleanup operation registry. Each operation is a pure string transform
// run ONLY on the cleanable (unprotected) text — the orchestrator masks
// protected regions out before applying these. Operations are listed in the
// canonical run order; the orchestrator runs them in array order, skipping any
// the user disabled. `changes` is a best-effort count of discrete edits, shown
// to the user for full transparency.
//
// Targets that match invisible / whitespace / look-alike characters are built
// from explicit numeric code points (below) so the SOURCE stays pure ASCII —
// no invisible glyphs hiding in a regex literal, fully reviewable.

import type {
  CleanupOperationId,
  CleanupOperationMeta,
  OperationRunResult,
} from "./types";

export interface CleanupOperationDef extends CleanupOperationMeta {
  run(text: string): OperationRunResult;
}

/** Build a regex character-class body from code points (each point -> its char). */
function chars(...codePoints: number[]): string {
  return codePoints.map((c) => String.fromCodePoint(c)).join("");
}

// Zero-width / invisible junk frequently pasted from the web and word processors.
const INVISIBLES = new RegExp(
  `[${chars(
    0x200b, // zero-width space
    0x200c, // zero-width non-joiner
    0x200d, // zero-width joiner
    0x2060, // word joiner
    0xfeff, // BOM / zero-width no-break space
    0x00ad, // soft hyphen
    0x180e, // Mongolian vowel separator
  )}]`,
  "g",
);

// Unicode spaces that should normalize to a plain ASCII space.
const UNICODE_SPACES = new RegExp(
  `[${chars(
    0x00a0, // no-break space
    0x1680, // ogham space mark
    0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008,
    0x2009, 0x200a, // en quad .. hair space
    0x202f, // narrow no-break space
    0x205f, // medium mathematical space
    0x3000, // ideographic space
  )}]`,
  "g",
);

// Curly double quotes / ditto / double prime.
const SMART_DOUBLE_QUOTES = new RegExp(
  `[${chars(0x201c, 0x201d, 0x201e, 0x201f, 0x2033)}]`,
  "g",
);
// Curly single quotes / apostrophes / prime.
const SMART_SINGLE_QUOTES = new RegExp(
  `[${chars(0x2018, 0x2019, 0x201a, 0x201b, 0x2032)}]`,
  "g",
);
// Horizontal ellipsis.
const ELLIPSIS = new RegExp(chars(0x2026), "g");
// Bullet glyphs commonly pasted from Word / web at the start of a list item.
const BULLET_GLYPHS = new RegExp(
  `^(\\s*)[${chars(
    0x2022, // bullet
    0x2023, // triangular bullet
    0x25e6, // white bullet
    0x2043, // hyphen bullet
    0x2219, // bullet operator
    0x25aa, // black small square
    0x25cf, // black circle
    0x00b7, // middle dot
  )}]\\s+`,
  "gm",
);

function countMatches(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

export const CLEANUP_OPERATIONS: CleanupOperationDef[] = [
  {
    id: "normalize-line-endings",
    label: "Normalize line endings",
    description: "Convert Windows/Mac line endings (CRLF, CR) to LF.",
    defaultEnabled: true,
    group: "recommended",
    run(text) {
      const re = /\r\n?/g;
      return { text: text.replace(re, "\n"), changes: countMatches(text, re) };
    },
  },
  {
    id: "remove-invisibles",
    label: "Remove invisible characters",
    description:
      "Strip zero-width spaces, BOM, soft hyphens and other invisible junk.",
    defaultEnabled: true,
    group: "recommended",
    run(text) {
      return {
        text: text.replace(INVISIBLES, ""),
        changes: countMatches(text, INVISIBLES),
      };
    },
  },
  {
    id: "normalize-unicode-whitespace",
    label: "Normalize exotic spaces",
    description:
      "Convert non-breaking and other Unicode spaces to a normal space.",
    defaultEnabled: true,
    group: "recommended",
    run(text) {
      return {
        text: text.replace(UNICODE_SPACES, " "),
        changes: countMatches(text, UNICODE_SPACES),
      };
    },
  },
  {
    id: "normalize-quotes",
    label: "Straighten smart quotes",
    description:
      "Curly quotes and apostrophes become straight ASCII; ellipsis becomes three dots. (Dashes left as-is.)",
    defaultEnabled: false,
    group: "extra",
    run(text) {
      let out = text;
      let changes = 0;
      const subs: Array<[RegExp, string]> = [
        [SMART_DOUBLE_QUOTES, '"'],
        [SMART_SINGLE_QUOTES, "'"],
        [ELLIPSIS, "..."],
      ];
      for (const [re, rep] of subs) {
        changes += countMatches(out, re);
        out = out.replace(re, rep);
      }
      return { text: out, changes };
    },
  },
  {
    id: "normalize-bullets",
    label: "Normalize pasted bullets",
    description:
      "Convert bullet glyphs at the start of a line to a markdown dash.",
    defaultEnabled: false,
    group: "extra",
    run(text) {
      return {
        text: text.replace(BULLET_GLYPHS, "$1- "),
        changes: countMatches(text, BULLET_GLYPHS),
      };
    },
  },
  {
    id: "collapse-spaces",
    label: "Collapse repeated spaces",
    description:
      "Collapse runs of 2+ spaces inside a line to one, preserving leading indentation.",
    defaultEnabled: false,
    group: "extra",
    run(text) {
      const re = /(\S) {2,}/g;
      return { text: text.replace(re, "$1 "), changes: countMatches(text, re) };
    },
  },
  {
    id: "trim-trailing-whitespace",
    label: "Trim trailing whitespace",
    description: "Remove spaces and tabs at the end of every line.",
    defaultEnabled: true,
    group: "recommended",
    run(text) {
      const re = /[ \t]+$/gm;
      return { text: text.replace(re, ""), changes: countMatches(text, re) };
    },
  },
  {
    id: "collapse-blank-lines",
    label: "Collapse extra blank lines",
    description:
      "Collapse 2+ consecutive blank lines into a single blank line (the copy-paste fix).",
    defaultEnabled: true,
    group: "recommended",
    run(text) {
      const re = /\n{3,}/g;
      return { text: text.replace(re, "\n\n"), changes: countMatches(text, re) };
    },
  },
  {
    id: "trim-document-edges",
    label: "Trim leading/trailing blank lines",
    description: "Remove blank lines and whitespace at the very top and bottom.",
    defaultEnabled: true,
    group: "recommended",
    run(text) {
      const trimmed = text.replace(/^\s+/, "").replace(/\s+$/, "");
      return { text: trimmed, changes: trimmed === text ? 0 : 1 };
    },
  },
];

export const CLEANUP_OPERATION_META: CleanupOperationMeta[] =
  CLEANUP_OPERATIONS.map(({ id, label, description, defaultEnabled, group }) => ({
    id,
    label,
    description,
    defaultEnabled,
    group,
  }));

/** Ids enabled by default — the one-click "great result" set. */
export const DEFAULT_ENABLED_OPERATIONS: CleanupOperationId[] =
  CLEANUP_OPERATIONS.filter((op) => op.defaultEnabled).map((op) => op.id);

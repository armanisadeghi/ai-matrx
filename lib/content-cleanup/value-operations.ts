// lib/content-cleanup/value-operations.ts
//
// The VALUE cleanup registry — the scalar sibling of `operations.ts`.
//
// `operations.ts` cleans a DOCUMENT: prose with structure worth protecting, so
// code/JSON/tables are masked out and only the surrounding text is touched.
// A table cell is not a document. It is one scalar value, and the most common
// damage agents do to it is WRAPPING the whole value in markup that was only
// ever meant for prose: `` `parent_id` ``, `**planning workflow:**`, `"quoted"`,
// `- bulleted`. Inside a cell that markup is noise; the value IS the content.
//
// So these operations take a whole value and return a whole value. The
// distinction that makes them safe is WHOLE-VALUE vs INTERIOR:
//
//     column = "`parent_id`"                  -> unwrapped to  parent_id
//     notes  = "The id, e.g. `a.b.c`. Stable" -> untouched (interior markup)
//
// An unwrap op fires ONLY when the marker encloses the entire trimmed value and
// the interior contains no further occurrence of that marker — so a cell whose
// content genuinely spans two code spans is never silently merged into one.
//
// Every non-ASCII target is built from explicit code points so the SOURCE stays
// pure ASCII — no invisible glyphs hiding in a regex literal (same rule as
// `operations.ts`).

import type {
  ValueCleanupOperationDef,
  ValueCleanupOperationId,
  ValueCleanupOperationMeta,
} from "./value-types";

/** Build a regex character-class body from code points (each point -> its char). */
function chars(...codePoints: number[]): string {
  return codePoints.map((c) => String.fromCodePoint(c)).join("");
}

const INVISIBLES = new RegExp(
  `[${chars(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x00ad, 0x180e)}]`,
  "g",
);
const UNICODE_SPACES = new RegExp(
  `[${chars(
    0x00a0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
    0x2007, 0x2008, 0x2009, 0x200a, 0x202f, 0x205f, 0x3000,
  )}]`,
  "g",
);
const SMART_DOUBLE_QUOTES = new RegExp(
  `[${chars(0x201c, 0x201d, 0x201e, 0x201f, 0x2033)}]`,
  "g",
);
const SMART_SINGLE_QUOTES = new RegExp(
  `[${chars(0x2018, 0x2019, 0x201a, 0x201b, 0x2032)}]`,
  "g",
);
const ELLIPSIS = new RegExp(chars(0x2026), "g");

/** Curly + straight double quotes usable as a wrapping pair. */
const OPEN_DQUOTES = chars(0x201c, 0x201e, 0x201f) + '"';
const CLOSE_DQUOTES = chars(0x201d, 0x201c, 0x201f) + '"';
/** Bullet glyphs that show up as a pasted list marker. */
const BULLET_CHARS = chars(0x2022, 0x2023, 0x25e6, 0x2043, 0x2219, 0x25aa, 0x25cf, 0x00b7);

/**
 * Strip a symmetric wrapper (`marker` … `marker`) from a value, but only when
 * it encloses everything and nothing of the marker survives inside.
 *
 * Returns `null` when the op does not apply — the caller treats that as
 * "no change", which is what keeps interior markup safe.
 */
function unwrapSymmetric(value: string, marker: string): string | null {
  const t = value.trim();
  if (t.length < marker.length * 2 + 1) return null;
  if (!t.startsWith(marker) || !t.endsWith(marker)) return null;
  const inner = t.slice(marker.length, t.length - marker.length);
  if (inner.length === 0) return null;
  // A marker surviving inside means this was NOT one wrapped value (e.g.
  // "`a` and `b`") — refuse rather than silently merge two spans.
  if (inner.includes(marker)) return null;
  return inner;
}

/** Strip a wrapper whose open/close chars differ (quote pairs). */
function unwrapPair(value: string, opens: string, closes: string): string | null {
  const t = value.trim();
  if (t.length < 3) return null;
  const first = t[0];
  const last = t[t.length - 1];
  if (!first || !last) return null;
  if (!opens.includes(first) || !closes.includes(last)) return null;
  const inner = t.slice(1, -1);
  if (inner.length === 0) return null;
  // Any further quote char inside means the wrapper is not the whole story.
  for (const ch of inner) {
    if (opens.includes(ch) || closes.includes(ch)) return null;
  }
  return inner;
}

/** HTML entity table used by `decode-html`. Deliberately small and explicit. */
const HTML_ENTITIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/<br\s*\/?>/gi, "\n"],
  [/&nbsp;/gi, " "],
  [/&lt;/gi, "<"],
  [/&gt;/gi, ">"],
  [/&quot;/gi, '"'],
  [/&#39;/gi, "'"],
  [/&apos;/gi, "'"],
  // `&amp;` LAST so "&amp;lt;" decodes to "&lt;" and stops there, not to "<".
  [/&amp;/gi, "&"],
];

/**
 * The registry, in canonical run order.
 *
 * Order matters and is load-bearing:
 *   1. structural repair (line endings, invisibles, HTML) first, so later
 *      wrapper detection sees the real first/last characters;
 *   2. wrapper unwrapping next, outermost-most-common first;
 *   3. whitespace normalization last, so it tidies whatever the unwrappers left.
 */
export const VALUE_CLEANUP_OPERATIONS: ValueCleanupOperationDef[] = [
  {
    id: "normalize-line-endings",
    label: "Normalize line endings",
    description: "Convert Windows/Mac line endings (CRLF, CR) to LF.",
    human: "Fixed inconsistent line breaks",
    defaultEnabled: true,
    group: "recommended",
    run: (v) => {
      const out = v.replace(/\r\n?/g, "\n");
      return out === v ? null : out;
    },
  },
  {
    id: "remove-invisibles",
    label: "Remove invisible characters",
    description:
      "Strip zero-width spaces, BOM, soft hyphens and other invisible junk.",
    human: "Removed hidden/invisible characters",
    defaultEnabled: true,
    group: "recommended",
    run: (v) => {
      const out = v.replace(INVISIBLES, "");
      return out === v ? null : out;
    },
  },
  {
    id: "normalize-unicode-whitespace",
    label: "Normalize exotic spaces",
    description:
      "Convert non-breaking and other Unicode spaces to a normal space.",
    human: "Replaced unusual spaces with normal ones",
    defaultEnabled: true,
    group: "recommended",
    run: (v) => {
      const out = v.replace(UNICODE_SPACES, " ");
      return out === v ? null : out;
    },
  },
  {
    id: "decode-html",
    label: "Decode HTML",
    description:
      "Turn <br> into line breaks, decode &amp;-style entities, and drop leftover tags.",
    human: "Decoded HTML markup",
    defaultEnabled: true,
    group: "recommended",
    run: (v) => {
      let out = v;
      for (const [re, replacement] of HTML_ENTITIES) {
        out = out.replace(re, replacement);
      }
      out = out.replace(/<[^>]*>/g, "");
      return out === v ? null : out;
    },
  },
  {
    id: "unwrap-code-ticks",
    label: "Unwrap code ticks",
    description:
      "A value that is entirely wrapped in backticks (`like_this`) loses the ticks. Interior code spans are left alone.",
    human: "Removed backticks wrapping the whole value",
    defaultEnabled: true,
    group: "recommended",
    run: (v) =>
      // Triple first: ```x``` must not be read as `` + `x` + ``.
      unwrapSymmetric(v, "```") ??
      unwrapSymmetric(v, "``") ??
      unwrapSymmetric(v, "`"),
  },
  {
    id: "unwrap-bold",
    label: "Unwrap bold markers",
    description:
      "A value that is entirely **bold** or __bold__ loses the markers.",
    human: "Removed bold markers wrapping the whole value",
    defaultEnabled: true,
    group: "recommended",
    run: (v) => unwrapSymmetric(v, "**") ?? unwrapSymmetric(v, "__"),
  },
  {
    id: "unwrap-italic",
    label: "Unwrap italic markers",
    description: "A value that is entirely *italic* or _italic_ loses the markers.",
    human: "Removed italic markers wrapping the whole value",
    defaultEnabled: false,
    group: "extra",
    run: (v) => unwrapSymmetric(v, "*") ?? unwrapSymmetric(v, "_"),
  },
  {
    id: "unwrap-quotes",
    label: "Unwrap surrounding quotes",
    description:
      'A value that is entirely wrapped in quotes ("like this") loses them.',
    human: "Removed quotes wrapping the whole value",
    defaultEnabled: false,
    group: "extra",
    run: (v) =>
      unwrapPair(v, OPEN_DQUOTES, CLOSE_DQUOTES) ??
      unwrapPair(v, "'" + chars(0x2018), "'" + chars(0x2019)),
  },
  {
    id: "strip-list-marker",
    label: "Strip list markers",
    description:
      "Remove a leading bullet or numbered-list marker (- , * , 1. ) from the value.",
    human: "Removed a leading list marker",
    defaultEnabled: false,
    group: "extra",
    run: (v) => {
      const re = new RegExp(`^\\s*(?:[-*+${BULLET_CHARS}]|\\d{1,3}[.)])\\s+`);
      const out = v.replace(re, "");
      return out === v ? null : out;
    },
  },
  {
    id: "strip-heading-marker",
    label: "Strip heading markers",
    description: "Remove a leading markdown heading marker (#, ##, ###) from the value.",
    human: "Removed a leading heading marker",
    defaultEnabled: false,
    group: "extra",
    run: (v) => {
      const out = v.replace(/^\s*#{1,6}\s+/, "");
      return out === v ? null : out;
    },
  },
  {
    id: "normalize-quotes",
    label: "Straighten smart quotes",
    description:
      "Curly quotes and apostrophes become straight ASCII; ellipsis becomes three dots.",
    human: "Straightened curly quotes",
    defaultEnabled: false,
    group: "extra",
    run: (v) => {
      const out = v
        .replace(SMART_DOUBLE_QUOTES, '"')
        .replace(SMART_SINGLE_QUOTES, "'")
        .replace(ELLIPSIS, "...");
      return out === v ? null : out;
    },
  },
  {
    id: "collapse-spaces",
    label: "Collapse repeated spaces",
    description: "Collapse runs of 2+ spaces inside a line to a single space.",
    human: "Removed extra spaces between words",
    defaultEnabled: true,
    group: "recommended",
    run: (v) => {
      const out = v.replace(/(\S) {2,}/g, "$1 ");
      return out === v ? null : out;
    },
  },
  {
    id: "collapse-blank-lines",
    label: "Collapse extra blank lines",
    description: "Collapse 2+ consecutive blank lines into a single blank line.",
    human: "Removed extra blank lines",
    defaultEnabled: true,
    group: "recommended",
    run: (v) => {
      const out = v.replace(/\n{3,}/g, "\n\n");
      return out === v ? null : out;
    },
  },
  {
    id: "trim-edges",
    label: "Trim leading/trailing whitespace",
    description: "Remove whitespace at the very start and end of the value.",
    human: "Removed whitespace at the start and end",
    defaultEnabled: true,
    group: "recommended",
    run: (v) => {
      const out = v.trim();
      return out === v ? null : out;
    },
  },
  {
    id: "blank-to-empty",
    label: "Blank out whitespace-only values",
    description:
      "A value made only of whitespace becomes empty, so it reads as missing instead of present-but-blank.",
    human: "Emptied whitespace-only values",
    defaultEnabled: false,
    group: "extra",
    run: (v) => {
      if (v.length === 0) return null;
      return v.trim().length === 0 ? "" : null;
    },
  },
];

export const VALUE_CLEANUP_OPERATION_META: ValueCleanupOperationMeta[] =
  VALUE_CLEANUP_OPERATIONS.map(
    ({ id, label, description, defaultEnabled, group }) => ({
      id,
      label,
      description,
      defaultEnabled,
      group,
    }),
  );

/** Plain-language phrase for an operation id (review headlines). */
export const VALUE_OPERATION_HUMAN: Record<ValueCleanupOperationId, string> =
  VALUE_CLEANUP_OPERATIONS.reduce(
    (acc, op) => {
      acc[op.id] = op.human;
      return acc;
    },
    {} as Record<ValueCleanupOperationId, string>,
  );

/** Ids enabled by default — the one-click "great result" set. */
export const DEFAULT_ENABLED_VALUE_OPERATIONS: ValueCleanupOperationId[] =
  VALUE_CLEANUP_OPERATIONS.filter((op) => op.defaultEnabled).map((op) => op.id);

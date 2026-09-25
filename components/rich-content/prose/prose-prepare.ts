// ─────────────────────────────────────────────────────────────────────────
// THE PROSE PREPARATION PASS — shared by every rich-content level.
//
// Moved verbatim out of BasicMarkdownContent (2026-09-23, RC-B2) so the
// `inline` level (card faces, titles, cells) and the `standard` / `full`
// levels prepare prose IDENTICALLY — one source of truth for how model prose
// is massaged before the ONE core (MarkdownCore, preset "chat") parses it.
// Never fork this for a new surface; add a rule here and every level gets it.
// ─────────────────────────────────────────────────────────────────────────

import { ALLOWED_RAW_HTML_TAGS } from "@/components/mardown-display/chat-markdown/rehypeSafeRawHtml";
import { splitFrontmatter } from "@/components/markdown-core/syntax/frontmatter";

/** Private-use sentinel for a standalone `===` line. The `p` renderer swaps a
 *  paragraph whose only child is this token for a thick blue rule. */
export const THICK_HR_SENTINEL = "\uE000THICK_HR\uE000";

/**
 * Turn standalone `===` lines into their own sentinel paragraphs, leaving
 * fenced code untouched so a sample of `===` stays `===`.
 *
 * A blank line is forced on both sides. The one before stops CommonMark from
 * reading the previous line as a setext heading. The one after is required
 * because remark-breaks turns a single newline into a `<br>` inside the same
 * paragraph, and the rule only replaces a paragraph whose only child is the
 * sentinel. Without that break the token is painted as text.
 */
export function isolateThickHorizontalRules(source: string): string {
  const lines = source.split("\n");
  let fenceMarker: string | null = null;
  const out: string[] = [];
  for (const line of lines) {
    const opened = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMarker === null && opened?.[1]) {
      fenceMarker = opened[1];
      out.push(line);
      continue;
    }
    if (fenceMarker !== null) {
      const trimmed = line.trim();
      if (
        trimmed.startsWith(fenceMarker) &&
        trimmed.slice(fenceMarker.length).trim() === ""
      ) {
        fenceMarker = null;
      }
      out.push(line);
      continue;
    }
    out.push(/^[ \t]*={3,}[ \t]*$/.test(line) ? THICK_HR_SENTINEL : line);
  }
  return out
    .join("\n")
    .replace(
      new RegExp(`([^\\n])\\n+(${THICK_HR_SENTINEL})`, "g"),
      "$1\n\n$2",
    )
    .replace(
      new RegExp(`(${THICK_HR_SENTINEL})\\n+([^\\n])`, "g"),
      "$1\n\n$2",
    );
}

// Detect text direction utility
export const detectTextDirection = (text: string): "rtl" | "ltr" => {
  // RTL Unicode ranges for Arabic, Hebrew, Persian, Urdu, etc.
  const rtlRanges = [
    /[\u0590-\u05FF]/, // Hebrew
    /[\u0600-\u06FF]/, // Arabic
    /[\u0750-\u077F]/, // Arabic Supplement
    /[\u08A0-\u08FF]/, // Arabic Extended-A
    /[\uFB50-\uFDFF]/, // Arabic Presentation Forms-A
    /[\uFE70-\uFEFF]/, // Arabic Presentation Forms-B
    /[\u200F]/, // Right-to-Left Mark
    /[\u202E]/, // Right-to-Left Override
  ];

  // Count RTL and LTR characters
  let rtlCount = 0;
  let ltrCount = 0;

  for (const char of text) {
    if (rtlRanges.some((range) => range.test(char))) {
      rtlCount++;
    } else if (/[a-zA-Z]/.test(char)) {
      ltrCount++;
    }
  }

  // If RTL characters are more than 10% of alphabetic characters, consider it RTL
  // Lowered from 30% to 10% to catch mixed content better
  const totalAlphabetic = rtlCount + ltrCount;
  if (totalAlphabetic === 0) return "ltr";

  const direction = rtlCount / totalAlphabetic > 0.1 ? "rtl" : "ltr";

  return direction;
};

// Get direction classes based on text direction
export const getDirectionClasses = (direction: "rtl" | "ltr") => {
  return direction === "rtl" ? "text-right rtl" : "text-left ltr";
};

// Get font size based on text direction
export const getDirectionFontSize = (direction: "rtl" | "ltr") => {
  return direction === "rtl"
    ? "text-base" // Bigger for RTL (Arabic/Persian)
    : "text-sm"; // Smaller for LTR (English)
};

/**
 * Massage raw model prose into the markdown the core parses: escape non-HTML
 * angle-bracket tokens, keep indentation, normalize list/bold spacing, turn
 * `===` into the thick rule sentinel and extra blank lines into spacers.
 * Math is NOT touched here — the core's math normalizer owns it.
 */
export function preprocessProse(rawContent: string): string {
  // Front matter (YAML/TOML properties at the very top) is data, not prose:
  // it passes through byte for byte (the core hides it and exposes it as
  // document properties) — indentation and `---` rules must not be massaged.
  const frontmatter = splitFrontmatter(rawContent);
  if (frontmatter) return frontmatter.raw + preprocessProse(frontmatter.body);

  let processed = rawContent;

  // Pre-escape XML/HTML-style angle-bracket tokens.
  //
  // Without this, CommonMark treats `<tag>` at the start of a line as the
  // start of an HTML block (spec types 6 and 7). The block extends until the
  // next blank line, and the parser emits the entire region as a single text
  // node with embedded raw newlines — which collapse visually because they
  // never reach `remark-breaks`. The result: multi-line bare XML like
  //   <tools>
  //     <tool name="db_insert">...</tool>
  //     <tool name="db_query">...</tool>
  //   </tools>
  // renders as one wrapped paragraph instead of preserving its structure.
  //
  // Escaping `<` and `>` to entities prevents HTML-block detection, so the
  // content stays as ordinary paragraph text. `remark-breaks` then turns each
  // single newline into a <br>, preserving the visual structure. CommonMark
  // decodes `&lt;` and `&gt;` back to `<` and `>` in text, so inline
  // references like <Admin> or <Resource> still render as the literal
  // characters on screen.
  // Escape XML/HTML-style angle-bracket tokens, but SKIP content inside
  // backtick code spans — HTML entities are not decoded inside code spans,
  // so escaping there causes literal "&lt;" to appear on screen.
  //
  // EXCEPTION: a curated allow-list of real HTML tags (`<img>`, `<table>` and
  // friends — see ALLOWED_RAW_HTML_TAGS) is left un-escaped so it survives as
  // a raw-HTML node that `rehypeSafeRawHtml` parses + sanitizes into real
  // elements. Every other tag (`<tools>`, `<Admin>`, `<Resource>`…) is still
  // escaped to literal text, preserving the bare-XML behavior below.
  processed = processed.replace(
    /(`+)([\s\S]*?)\1|<(\/?[\w][\w-]*)([^>]*?)>/g,
    (match, backticks, _codeContent, tagName, tagAttrs) => {
      if (backticks !== undefined) return match; // preserve code spans verbatim
      const bareTag = String(tagName).replace(/^\//, "").toLowerCase();
      if (ALLOWED_RAW_HTML_TAGS.has(bareTag)) return match; // render as HTML
      return `&lt;${tagName}${tagAttrs}&gt;`; // escape tags outside code spans
    },
  );

  // Replace leading spaces on each line with non-breaking spaces so HTML
  // doesn't collapse them — this preserves indentation visually.
  // EXCEPTION: never touch indented list items. Markdown relies on real
  // leading spaces to detect nesting; converting them to nbsp flattens
  // nested bullets/numbers into literal "- " / "1." text. So skip any line
  // whose indented content begins with a list marker (*, -, + or "1." / "1)").
  processed = processed.replace(
    /^( +)(?![*+-][ \t]|\d+[.)][ \t])/gm,
    (spaces) => "\u00A0\u00A0".repeat(spaces.length),
  );

  // Convert bracketed bare URLs [https://...] into proper markdown links
  // This prevents dangling brackets when long URLs wrap across lines
  // Matches [URL] where URL starts with http(s):// and is not followed by () (which would be a standard markdown link)
  processed = processed.replace(
    /\[(https?:\/\/[^\]\s]+)\](?!\()/g,
    "[$1]($1)",
  );

  // Math delimiters (\(…\), \[…\], $…$, bracket display) are NOT converted
  // here: the ONE math normalizer runs inside MarkdownCore for every
  // math-capable preset (components/markdown-core/math-normalizer.ts).


  // Normalize asterisk bullets (*) to dash bullets (-) to avoid ambiguity with bold markers (**)
  // Both render identically, but dash bullets don't conflict with bold syntax
  // Preserve exact whitespace after the bullet marker
  processed = processed.replace(/^(\s*)\*([ \t]+)/gm, "$1-$2");

  // Force list termination before bold text that starts with a number (like **4. Test**).
  // CommonMark can treat single blank lines as "loose list" continuations, so we need
  // to inject an unambiguous block-level break between the list and the next paragraph.
  //
  // We use `&nbsp;` (a single non-breaking space on its own paragraph) instead of an
  // HTML comment (`<!-- -->`) because react-markdown is configured WITHOUT `rehype-raw`
  // (see the disabled-block comment above) — meaning raw HTML, including comments, is
  // emitted as literal text. The `&nbsp;` paragraph is rendered invisibly by the `p`
  // component below (it detects a single `\u00A0` child and emits a zero-content
  // spacer div), so it visually disappears while still acting as a block-level break.
  processed = processed.replace(
    /(^[ \t]*-[ \t]+[^\n]+)\n\n(\*\*\d)/gm,
    "$1\n\n&nbsp;\n\n$2",
  );

  // Fix setext-style heading patterns by ensuring there's a blank line before ---
  // This prevents paragraph text from being interpreted as h2 headings
  processed = processed.replace(/([^\n])\n---/g, "$1\n\n---");

  // Standalone `===` → thick blue rule. See isolateThickHorizontalRules.
  processed = isolateThickHorizontalRules(processed);

  // Ensure proper line breaks after bold text that should start a new line
  // This handles cases like "**Meta Title:**\n[content]" to ensure proper paragraph separation
  // BUT exclude cases where bold text is immediately followed by a list item (including indented ones)
  processed = processed.replace(/(\*\*[^*]+\*\*)\n([^\n*\-\s])/g, "$1\n\n$2");

  // Ensure proper line breaks before and after italic text that spans multiple lines
  // This handles cases where italic text should be on its own line
  processed = processed.replace(
    /([^\n])\n(\*[^*]+\*)\n([^\n])/g,
    "$1\n\n$2\n\n$3",
  );

  // Handle cases where there are single line breaks between different formatting elements
  // that should be treated as separate paragraphs
  // BUT exclude cases where formatting is immediately followed by a list item
  processed = processed.replace(
    /(\*\*[^*]+\*\*|\*[^*]+\*)\n([^\n*\s\-])/g,
    "$1\n\n$2",
  );

  // Ensure proper separation between list items and following paragraph content
  // This handles cases where content follows a list without proper spacing

  // First, handle nested/indented list items (most specific case)
  // Use negative lookahead to exclude actual list markers (* or -) but allow bold text (**)
  processed = processed.replace(
    /(^|\n)(\s+[*-] .+)\n(?!\s*[*-]\s)([^\n\s\-#\d][^\n]*)/gm,
    "$1$2\n\n$3",
  );

  // Then handle regular list items
  // Use negative lookahead to exclude actual list markers but allow bold text
  processed = processed.replace(
    /(^|\n)(- .+)\n(?!\s*[*-]\s)([^\n\s\-#\d][^\n]*)/gm,
    "$1$2\n\n$3",
  );
  processed = processed.replace(
    /(^|\n)(\d+\. .+)\n(?!\s*\d+[.)]\s)([^\n\s\-#\d][^\n]*)/gm,
    "$1$2\n\n$3",
  );
  processed = processed.replace(
    /(^|\n)(\d+\) .+)\n(?!\s*\d+[.)]\s)([^\n\s\-#\d][^\n]*)/gm,
    "$1$2\n\n$3",
  );

  // Convert intentional blank lines into &nbsp; paragraphs so they render
  // at the same height as a normal line of text, capped at 2 visible blank lines.
  // A standard paragraph break is \n\n (2 chars) — that needs 0 spacers.
  // Only \n\n\n+ (extra blank lines beyond the paragraph break) add spacers.
  processed = processed.replace(/\n{2,}/g, (match) => {
    const blankLines = Math.min(match.length - 2, 2);
    return "\n\n" + "&nbsp;\n\n".repeat(blankLines);
  });

  return processed;
}

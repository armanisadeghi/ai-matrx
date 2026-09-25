// Streaming heal for the extended syntax — registered into the core's
// `healStreamingMarkdown` (stream-heal.ts). Only a live stream is healed;
// finished text is never touched. Each handler hides or completes a
// construct whose tail has not arrived, so no raw marker flashes on screen:
//
//   front matter still open (`---\ntitle: x`)  → hidden until it closes
//   a trailing directive line (`:::tab`, `::toc`, `:::note[Ti`) → held back until its line ends
//   a trailing `> [!NOT`, `!!! note "Ti`       → held back until its line ends
//   `[[Pag` / `![[Pag`                          → the name as text / held back
//   `==highl`                                    → closed as a highlight
//   `:span[te` / `:mark[text]{colo`             → the text only
//   `[^1` (a footnote ref mid-arrival)          → held back
//   `*[HTM` (an abbreviation definition)        → held back
//   `:smi` (an emoji shortcode mid-arrival)     → held back

import { isWithinCodeBlock, type RemendHandler } from "remend";
import { hasUnclosedFrontmatter } from "./frontmatter";

function lastLineStart(text: string): number {
  return text.lastIndexOf("\n") + 1;
}

const pendingFrontmatter: RemendHandler = {
  name: "matrx-pending-frontmatter",
  priority: 0,
  handle: (text) => {
    if (text === "-" || text === "--" || text === "---" || text === "+" || text === "++" || text === "+++") return "";
    if (!hasUnclosedFrontmatter(text)) return text;
    // Only hide what READS as properties so far — a document that opens with
    // a `---` rule followed by prose must keep streaming visibly.
    const [opener, ...rest] = text.split("\n");
    const looks = opener === "+++" ? TOML_LINE : YAML_LINE;
    return rest.every((line, i) => looks.test(line) || (i === rest.length - 1 && /^[\w"'-]*$/.test(line))) ? "" : text;
  },
};

const YAML_LINE = /^(?:[\w"'][^:\n]*:(?:\s.*)?|\s+.*|-(?:\s.*)?|#.*|)$/;
const TOML_LINE = /^\s*(?:[\w."-]+\s*=.*|\[.*\]|#.*|)$/;

const TRAILING_BLOCK_MARKER = /^(?:[ \t]{0,3}:{2,}[^\n]*|[ \t]{0,3}>[ \t]*\[!?[^\]\n]*\]?[+-]?|(?:!!!|\?\?\?\+?)[^\n]*|\*\[[^\n]*)$/;

const pendingBlockMarker: RemendHandler = {
  name: "matrx-pending-block-marker",
  priority: 2,
  handle: (text) => {
    const start = lastLineStart(text);
    const line = text.slice(start);
    if (!line || !TRAILING_BLOCK_MARKER.test(line)) return text;
    if (isWithinCodeBlock(text, start)) return text;
    // A complete callout marker line with its type closed (`> [!NOTE]`) can render already.
    if (/^[ \t]{0,3}>[ \t]*\[![A-Za-z-]+\][+-]?[ \t]*$/.test(line)) return text;
    return text.slice(0, start);
  },
};

const TRAILING_WIKILINK = /(!?)\[\[([^[\]\n]*)\]?$/;
const TRAILING_TEXT_DIRECTIVE = /:(?:span|mark|kbd|abbr|sup|sub)\[([^\]\n]*)(?:\](\{[^}\n]*)?)?$/;
const TRAILING_FOOTNOTE_REF = /\[\^[^\]\s]*$/;
const TRAILING_EMOJI = /(^|[\s(])(:[a-z0-9_+-]+)$/;
const TRAILING_HIGHLIGHT = /(^|[^=\\])==(?=[^\s=])([^\n=]*)$/;

const pendingInline: RemendHandler = {
  name: "matrx-pending-inline-syntax",
  priority: 3,
  handle: (text) => {
    const start = lastLineStart(text);
    if (isWithinCodeBlock(text, start)) return text;
    let out = text;
    const wiki = TRAILING_WIKILINK.exec(out);
    if (wiki && wiki.index >= start) {
      out = out.slice(0, wiki.index) + (wiki[1] ? "" : (wiki[2] ?? ""));
    }
    const directive = TRAILING_TEXT_DIRECTIVE.exec(out);
    if (directive && directive.index >= start && (directive[2] !== undefined || !out.endsWith("]"))) {
      out = out.slice(0, directive.index) + (directive[1] ?? "");
    }
    const fn = TRAILING_FOOTNOTE_REF.exec(out);
    if (fn && fn.index >= start) out = out.slice(0, fn.index);
    const emoji = TRAILING_EMOJI.exec(out);
    if (emoji && emoji.index >= start) out = out.slice(0, emoji.index + (emoji[1] ?? "").length);
    const hl = TRAILING_HIGHLIGHT.exec(out);
    if (hl && hl.index >= start && (hl[2] ?? "").trim() && !/\s$/.test(out)) out = `${out}==`;
    return out;
  },
};

/**
 * A half-typed heading id (`## Loading {#sec`) — hold the `{#…` back until
 * its `}` arrives, so the heading never flashes the raw id.
 */
const pendingHeadingId: RemendHandler = {
  name: "matrx-pending-heading-id",
  priority: -2,
  handle: (text) => {
    const start = lastLineStart(text);
    const m = /^(#{1,6}[ \t].*?)[ \t]*\{#[^}\n]*$/.exec(text.slice(start));
    if (!m || isWithinCodeBlock(text, start)) return text;
    return text.slice(0, start) + (m[1] ?? "");
  },
};

/** Count `$$` outside code fences / spans. */
function openDisplayDollar(text: string): number {
  let at = -1;
  let open = -1;
  while ((at = text.indexOf("$$", at + 1)) !== -1) {
    if (isWithinCodeBlock(text, at)) continue;
    open = open === -1 ? at : -1;
    at += 1;
  }
  return open;
}

/**
 * Math whose closer has not arrived — a `$$` block, `\[ … `, `\( … ` — is
 * held back whole until it closes: KaTeX cannot draw half an expression, and
 * showing its TeX source (`E = mc^2 \tag{1}`, `\ce{H…`) is the flash the
 * RC-B8 verification saw. Runs before remend's own math closing (priority 70).
 */
const pendingMath: RemendHandler = {
  name: "matrx-pending-math",
  priority: -1,
  handle: (text) => {
    let cut = openDisplayDollar(text);
    for (const [open, close] of [
      ["\\[", "\\]"],
      ["\\(", "\\)"],
    ] as const) {
      const o = text.lastIndexOf(open);
      if (o !== -1 && text.indexOf(close, o) === -1 && !isWithinCodeBlock(text, o)) {
        cut = cut === -1 ? o : Math.min(cut, o);
      }
    }
    return cut === -1 ? text : text.slice(0, cut);
  },
};

export const SYNTAX_STREAM_HANDLERS: RemendHandler[] = [
  pendingFrontmatter,
  pendingBlockMarker,
  pendingInline,
  pendingHeadingId,
  pendingMath,
];

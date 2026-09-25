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

export const SYNTAX_STREAM_HANDLERS: RemendHandler[] = [pendingFrontmatter, pendingBlockMarker, pendingInline];

/**
 * rehype-safe-raw-html — render a curated allow-list of raw HTML tags that
 * models commonly emit (inline `<img>`, `<table>`…) WITHOUT opening the door to
 * XSS and WITHOUT the whole-tree serialize/reparse that `rehype-raw` does.
 *
 * Why not `rehype-raw`? It re-serializes the entire hast tree and reparses it,
 * which round-trips our custom `matrx-variable` element (its `data-name` prop
 * can be renamed away → variables vanish) and the pre-KaTeX `<span class=math>`
 * nodes. This plugin instead visits ONLY `raw` nodes (the raw-HTML strings
 * react-markdown leaves in the tree because it runs with `allowDangerousHtml`),
 * parses each in isolation, sanitizes the result against a tight schema, and
 * splices the safe elements back in. Element nodes already in the tree
 * (matrx-variable, math, links, images from the block splitter) are never
 * touched.
 *
 * Must run BEFORE react-markdown's internal `raw`→text transform (which turns
 * any surviving raw node into literal text) and BEFORE `rehype-katex` (whose
 * rendered output must not be sanitized). Placement in `rehypePlugins` handles
 * the first; being listed before rehype-katex handles the second.
 *
 * Scope: `<div>` and the `style` attribute are intentionally EXCLUDED — inline
 * layout HTML (flex/grid via `style`) is a separate, higher-risk concern.
 *
 * The parsed/sanitized elements are rendered by the SAME `components` overrides
 * in BasicMarkdownContent as markdown-native tags — so a raw `<table>` gets our
 * bordered table styling and a raw `<img>` gets the inline-flow image treatment
 * for free.
 */

import { visit } from "unist-util-visit";
import { fromHtml } from "hast-util-from-html";
import { sanitize, type Schema } from "hast-util-sanitize";
import type { Root, RootContent } from "hast";

declare module "hast" {
  interface Data {
    /**
     * Set on `<table>` elements this plugin parses from raw HTML. The admin
     * table-render-path diagnostic in BasicMarkdownContent uses it to STAY
     * QUIET for HTML tables — they were never markdown pipe tables and are
     * correctly rendered by the GFM component path, so "not promoted to a
     * table block" is expected, not a defect. Lives on `data` (not
     * `properties`) so it never becomes a DOM attribute.
     */
    matrxRawHtmlTable?: boolean;
  }
}

/** A `raw` node — react-markdown's placeholder for a raw-HTML string. It is not
 *  part of hast's typed content union, so we narrow it structurally. */
interface RawNode {
  type: "raw";
  value: string;
}

function isRawNode(node: unknown): node is RawNode {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as { type?: unknown }).type === "raw" &&
    typeof (node as { value?: unknown }).value === "string"
  );
}

/**
 * Tags a model may emit as raw HTML that we render. Kept in sync with the
 * pre-escape gate in BasicMarkdownContent (`preprocessContent`) — a tag left
 * un-escaped there must be allowed here, or it renders as literal text.
 * Deliberately excludes `div` (layout container — Case 4) and any scripting or
 * embedding tags (`script`, `style`, `iframe`, `object`, `embed`, `form`…).
 */
export const ALLOWED_RAW_HTML_TAGS: ReadonlySet<string> = new Set([
  // media
  "img",
  // links + breaks + rules
  "a",
  "br",
  "hr",
  // inline text semantics
  "span",
  "p",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "ins",
  "sup",
  "sub",
  "mark",
  "kbd",
  "abbr",
  "small",
  "code",
  "pre",
  // lists + quotes + headings
  "ul",
  "ol",
  "li",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  // tables
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "colgroup",
  "col",
  "figure",
  "figcaption",
]);

/**
 * Sanitization schema for raw-HTML subtrees. Any tag not listed is dropped, any
 * attribute not listed is stripped (so `onerror`, `onclick`, inline `style`,
 * etc. never survive), and `src`/`href` are restricted to safe protocols so
 * `javascript:` URLs cannot execute. `style` is intentionally omitted.
 */
export const RAW_HTML_SCHEMA: Schema = {
  tagNames: Array.from(ALLOWED_RAW_HTML_TAGS),
  attributes: {
    img: ["src", "alt", "title", "width", "height", "loading"],
    a: ["href", "title", "target", "rel"],
    th: ["colSpan", "rowSpan", "scope", "align"],
    td: ["colSpan", "rowSpan", "headers", "align"],
    col: ["span", "width"],
    colgroup: ["span"],
    abbr: ["title"],
    "*": ["align"],
  },
  protocols: {
    href: ["http", "https", "mailto", "tel"],
    src: ["http", "https"],
  },
  // Drop these outright (element + subtree) if they ever appear.
  strip: ["script", "style", "iframe", "object", "embed", "form", "input"],
  // Keep author ids untouched (no clobber prefix rewriting).
  clobberPrefix: "",
  clobber: [],
  allowComments: false,
  allowDoctypes: false,
};

export default function rehypeSafeRawHtml() {
  return (tree: Root) => {
    visit(tree, (node, index, parent) => {
      if (!isRawNode(node) || !parent || typeof index !== "number") return;

      // Parse this raw HTML string in isolation (fragment: no <html>/<body>
      // wrapper), then sanitize the resulting fragment against our schema.
      const fragment = fromHtml(node.value, { fragment: true });
      // fromHtml(fragment) yields a Root; sanitize preserves it as a Root.
      const clean = sanitize(fragment, RAW_HTML_SCHEMA) as Root;

      // Tag HTML-sourced tables so the admin table-path diagnostic skips them.
      // Done AFTER sanitize (which drops unknown fields) and on `data`, so it
      // is never emitted as a DOM attribute.
      visit(clean, "element", (el) => {
        if (el.tagName !== "table") return;
        if (!el.data) {
          el.data = { position: {} };
        }
        el.data.matrxRawHtmlTable = true;
      });

      const safeChildren = clean.children as RootContent[];

      // Replace the single raw node with the sanitized element(s)/text.
      parent.children.splice(index, 1, ...safeChildren);

      // Resume at the same index — the spliced-in nodes are elements/text, not
      // `raw`, so they will not re-match this visitor.
      return index;
    });
  };
}

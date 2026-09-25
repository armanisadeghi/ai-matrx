// components/rich-editor/core/extensions.ts
//
// THE SCHEMA of the visual (Tiptap 3) mode — React-free, so the headless
// round-trip corpus and the browser editor load the exact same schema.
//
// Shape of a loaded document (see visual-document.ts):
//
//   doc
//   ├── sourceBlock   one per stored prose block; its children are ordinary
//   │                 paragraphs, headings, lists, quotes, rules — the only
//   │                 thing the person edits as rich text
//   ├── islandBlock   one per stored island (kind JSON, XML section, code
//   │                 fence, math, HTML, anchor…): an ATOM carrying its exact
//   │                 bytes. Never parsed, never re-serialized — edited only in
//   │                 its own editor.
//   └── sourceLocked  prose the visual editor cannot hold byte-for-byte
//                     (tables, raw HTML, CRLF text…): an atom too, shown
//                     rendered, edited as source.
//
// Inline islands ({{variables}}, citations, inline math, tags) are
// `inlineIsland` atoms inside paragraphs.
//
// Every markdown-shaped node and mark carries `md*` attributes recording HOW
// the source spelled it (`*` or `-`, `**` or `__`, the link tail…) so an edited
// block is written back in the author's own style. None of them render to the
// DOM, and none survive a split (`keepOnSplit: false`), so new nodes fall back
// to the defaults in markdown-serialize.ts.

import { Extension, Mark, Node, mergeAttributes, type Extensions } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Heading } from "@tiptap/extension-heading";
import { Bold } from "@tiptap/extension-bold";
import { Italic } from "@tiptap/extension-italic";
import { Strike } from "@tiptap/extension-strike";
import { Code } from "@tiptap/extension-code";
import { Link } from "@tiptap/extension-link";
import { Blockquote } from "@tiptap/extension-blockquote";
import { HorizontalRule } from "@tiptap/extension-horizontal-rule";
import { HardBreak } from "@tiptap/extension-hard-break";
import {
  BulletList,
  ListItem,
  ListKeymap,
  OrderedList,
} from "@tiptap/extension-list";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Dropcursor, Focus, Gapcursor, Placeholder, UndoRedo } from "@tiptap/extensions";
import { MarkdownTextPaste } from "./paste-markdown";

/** A fidelity attribute: never rendered, never inherited by a split. */
const mdAttr = () => ({ default: null, rendered: false, keepOnSplit: false });

/** Node types that carry an `mdId` (their source identity in the baseline). */
export const MD_ID_NODE_TYPES = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "horizontalRule",
  "sourceLocked",
] as const;

/** `<pre>` → a fenced code block, fence longer than any backtick run inside. */
function fenceFromPre(element: HTMLElement): string {
  const code = element.querySelector("code");
  const language =
    /(?:^|\s)(?:language|lang)-([\w+#.-]+)/.exec(code?.className ?? element.className)?.[1] ?? "";
  const text = (code ?? element).textContent?.replace(/\n$/, "") ?? "";
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${text}\n${fence}`;
}

export const SourceBlockNode = Node.create({
  name: "sourceBlock",
  group: "topblock",
  content: "block+",
  addAttributes() {
    return { b: mdAttr() };
  },
  parseHTML() {
    return [{ tag: "div[data-md-source-block]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-md-source-block": "",
        class: "rich-editor-source-block",
      }),
      0,
    ];
  },
});

export const IslandBlockNode = Node.create({
  name: "islandBlock",
  group: "topblock block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      raw: { default: "", rendered: false },
      islandType: { default: "fence", rendered: false },
      complete: { default: true, rendered: false },
      b: mdAttr(),
    };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-md-island]",
        getAttrs: (element) => ({
          raw: element.getAttribute("data-md-raw") ?? "",
          islandType: element.getAttribute("data-md-island") ?? "fence",
        }),
      },
      {
        // Pasted code (<pre>, <pre><code class="language-x">) becomes a fence island.
        tag: "pre",
        preserveWhitespace: "full",
        getAttrs: (element) => ({ raw: fenceFromPre(element), islandType: "fence" }),
      },
    ];
  },
  renderHTML({ node }) {
    return [
      "div",
      {
        "data-md-island": String(node.attrs.islandType),
        "data-md-raw": String(node.attrs.raw),
      },
      ["pre", String(node.attrs.raw)],
    ];
  },
  renderText({ node }) {
    return String(node.attrs.raw);
  },
});

export const SourceLockedNode = Node.create({
  name: "sourceLocked",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      raw: { default: "", rendered: false },
      reason: { default: null, rendered: false },
      b: mdAttr(),
    };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-md-locked]",
        getAttrs: (element) => ({
          raw: element.getAttribute("data-md-raw") ?? "",
        }),
      },
    ];
  },
  renderHTML({ node }) {
    return [
      "div",
      { "data-md-locked": "", "data-md-raw": String(node.attrs.raw) },
      ["pre", String(node.attrs.raw)],
    ];
  },
  renderText({ node }) {
    return String(node.attrs.raw);
  },
});

export const InlineIslandNode = Node.create({
  name: "inlineIsland",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      raw: { default: "", rendered: false },
      islandType: { default: "variable", rendered: false },
    };
  },
  parseHTML() {
    return [
      {
        // Pasted images keep their bytes as a markdown image island.
        tag: "img[src]",
        getAttrs: (element) => ({
          raw: `![${(element.getAttribute("alt") ?? "").replace(/[[\]]/g, "")}](${element.getAttribute("src") ?? ""})`,
          islandType: "md_image",
        }),
      },
      {
        tag: "span[data-md-inline]",
        getAttrs: (element) => ({
          raw: element.getAttribute("data-md-raw") ?? "",
          islandType: element.getAttribute("data-md-inline") ?? "variable",
        }),
      },
    ];
  },
  renderHTML({ node }) {
    return [
      "span",
      {
        "data-md-inline": String(node.attrs.islandType),
        "data-md-raw": String(node.attrs.raw),
      },
      String(node.attrs.raw),
    ];
  },
  renderText({ node }) {
    return String(node.attrs.raw);
  },
});

/** Records how the source spelled each construct (see header). */
export const MarkdownFidelityAttributes = Extension.create({
  name: "markdownFidelity",
  addGlobalAttributes() {
    return [
      { types: [...MD_ID_NODE_TYPES], attributes: { mdId: mdAttr() } },
      { types: ["heading"], attributes: { mdOpen: mdAttr(), mdClose: mdAttr() } },
      {
        types: ["listItem"],
        attributes: {
          mdLead: mdAttr(),
          mdMarker: mdAttr(),
          mdAfter: mdAttr(),
          mdTask: mdAttr(),
          mdIndent: mdAttr(),
        },
      },
      { types: ["blockquote"], attributes: { mdPrefix: mdAttr(), mdAlert: mdAttr() } },
      {
        types: ["table"],
        attributes: { mdId: mdAttr(), mdDelim: mdAttr(), mdAligns: mdAttr(), mdPipes: mdAttr() },
      },
      { types: ["tableRow"], attributes: { mdRaw: mdAttr(), mdCells: mdAttr() } },
      { types: ["horizontalRule", "hardBreak"], attributes: { mdRaw: mdAttr() } },
      {
        types: ["bold", "italic", "strike"],
        attributes: { mdMarker: mdAttr(), mdDepth: mdAttr() },
      },
      {
        types: ["code"],
        attributes: { mdOpen: mdAttr(), mdClose: mdAttr(), mdDepth: mdAttr() },
      },
      {
        types: ["link"],
        attributes: {
          mdForm: mdAttr(),
          mdTail: mdAttr(),
          mdTailHref: mdAttr(),
          mdText: mdAttr(),
          mdDepth: mdAttr(),
        },
      },
    ];
  },
});

/**
 * Shift+Enter writes a plain newline into the paragraph — the platform
 * renders a single newline as a line break (remark-breaks), so no trailing
 * double space and no backslash ever enters the stored text.
 */
const NewlineHardBreak = HardBreak.extend({
  addKeyboardShortcuts() {
    const newline = () =>
      this.editor.commands.command(({ tr, dispatch }) => {
        if (dispatch) tr.insertText("\n");
        return true;
      });
    return { "Shift-Enter": newline, "Mod-Enter": newline };
  },
});

/**
 * GFM table cells hold one line of inline text, never blocks; alignment is a
 * column property the delimiter row records.
 */
const cellAlign = {
  align: {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.textAlign || null,
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes.align ? { style: `text-align: ${String(attributes.align)}` } : {},
  },
};
const InlineTableCell = TableCell.extend({
  content: "paragraph",
  addAttributes() {
    return { ...this.parent?.(), ...cellAlign };
  },
});
const InlineTableHeader = TableHeader.extend({
  content: "paragraph",
  addAttributes() {
    return { ...this.parent?.(), ...cellAlign };
  },
});

/** Inline code may sit under bold/italic/link like the source allows. */
const CombinableCode = Code.extend({ excludes: "" });

/**
 * An author's backslash escape (`\*`, `\_`, `\#`…): the reader sees the
 * literal character, the stored bytes keep the backslash. The text node holds
 * the bare character under this mark and the serializer writes `\` before each
 * ASCII punctuation character in it. Not inclusive, so text typed beside it is
 * plain (the editor never ADDS an escape); combinable with every other mark.
 */
export const EscapedText = Mark.create({
  name: "mdEscape",
  inclusive: false,
  excludes: "",
  parseHTML() {
    return [{ tag: "span[data-md-escape]" }];
  },
  renderHTML() {
    return ["span", { "data-md-escape": "" }, 0];
  },
});

export interface RichEditorExtensionOptions {
  /** Placeholder shown in an empty document. */
  placeholder?: string;
  /** Told when a paste changed shape on the way in (merged table cells split). */
  onPasteNotice?: (message: string) => void;
}

/**
 * The extension list both the browser editor and the headless corpus use.
 * The React layer swaps in node views for the three atoms; the schema is
 * identical either way.
 */
export function createRichEditorExtensions(
  options: RichEditorExtensionOptions = {},
): Extensions {
  const list: Extensions = [
    Document.extend({ content: "(block | topblock)+" }),
    Paragraph,
    Text,
    Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
    Blockquote,
    BulletList,
    OrderedList,
    ListItem,
    ListKeymap,
    HorizontalRule,
    NewlineHardBreak,
    Bold,
    Italic,
    Strike,
    CombinableCode,
    EscapedText,
    Link.configure({
      openOnClick: false,
      autolink: false,
      linkOnPaste: true,
    }),
    Table.configure({ resizable: false }),
    TableRow,
    InlineTableHeader,
    InlineTableCell,
    SourceBlockNode,
    IslandBlockNode,
    SourceLockedNode,
    InlineIslandNode,
    MarkdownFidelityAttributes,
    UndoRedo,
    Focus.configure({ className: "has-focus", mode: "shallowest" }),
    Gapcursor,
    Dropcursor,
    Placeholder.configure({ placeholder: options.placeholder ?? "Write…" }),
    MarkdownTextPaste.configure({ onNotice: options.onPasteNotice ?? null }),
  ];
  // NO PASTE RULES, anywhere. Tiptap runs every mark's paste rule over the
  // whole changed range of a paste or a DROP — and a block drag's changed range
  // spans every block between where it left and where it landed. The link rule
  // re-marked an untouched `ops@example.com` with fresh attributes, which wrote
  // it back as `[ops@example.com](mailto:…)`; the emphasis rules would do the
  // same to a stored `\*literal\*`. Pasted text is parsed as markdown by
  // MarkdownTextPaste instead (one parser, the same structure as typing it).
  return list.map((extension) => extension.extend({ addPasteRules: () => [] }));
}

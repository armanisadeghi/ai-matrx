// components/rich-editor/core/paste-markdown.ts
//
// Plain-text paste in the visual view = the same structure as typing that text
// in Source. Text from a text editor, a terminal, an AI "copy raw" or ⌘⇧V is
// markdown (or XML, or a kind fence): it goes through the ONE parse path
// (visual-document.ts → tokenizer + markdown-parse.ts), so a pasted list is a
// list, a pasted `<section>` is one protected island with its exact bytes and
// a pasted `{{var}}` is a variable chip — never a paragraph per line.
//
// Pasted nodes are NEW text: their source identity (`b`, `mdId`) is dropped so
// they can never claim the stored bytes of a block they happen to resemble.
// Their spelling attributes (`*` vs `-`, `__` vs `**`…) stay, so they save the
// way they were pasted. Inside a code block ProseMirror inserts the raw text
// itself and never calls this parser.

import { Extension, type JSONContent } from "@tiptap/core";
import { Fragment, Slice, type Node as PMNode, type Schema } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { buildVisualDocument } from "./visual-document";
import { mergedCellsNotice, normalizePastedHtml } from "./paste-html";

const IDENTITY_ATTRS = ["b", "mdId"] as const;

function stripIdentity(node: JSONContent): JSONContent {
  const attrs = node.attrs ? { ...node.attrs } : undefined;
  if (attrs) for (const key of IDENTITY_ATTRS) if (key in attrs) attrs[key] = null;
  return {
    ...node,
    ...(attrs ? { attrs } : {}),
    ...(node.content ? { content: node.content.map(stripIdentity) } : {}),
  };
}

/** Markdown text → the slice the visual editor inserts for it. */
export function markdownToSlice(text: string, schema: Schema): Slice {
  const normalized = text.replace(/\r\n?/g, "\n");
  const { json } = buildVisualDocument(normalized, schema);
  const doc = schema.nodeFromJSON(stripIdentity(json));
  // Unwrap the per-stored-block wrappers: their children are ordinary blocks
  // that fit anywhere a block fits (list items, quotes, cells), and a bare
  // top-level block is serialized as fresh text.
  const blocks: PMNode[] = [];
  doc.forEach((node) => {
    if (node.type.name === "sourceBlock") node.forEach((child) => blocks.push(child));
    else blocks.push(node);
  });
  if (blocks.length === 0) return Slice.empty;
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  // A paragraph at either edge is open, so a one-line paste joins the line the
  // cursor is in instead of splitting it.
  const openStart = first.type.name === "paragraph" ? 1 : 0;
  const openEnd = last.type.name === "paragraph" ? 1 : 0;
  return new Slice(Fragment.from(blocks), openStart, openEnd);
}

export interface MarkdownTextPasteOptions {
  /** Told when a paste changed shape on the way in (merged table cells split). */
  onNotice: ((message: string) => void) | null;
}

export const MarkdownTextPaste = Extension.create<MarkdownTextPasteOptions>({
  name: "richEditorMarkdownTextPaste",
  addOptions() {
    return { onNotice: null };
  },
  addProseMirrorPlugins() {
    const schema = this.editor.schema;
    const onNotice = this.options.onNotice;
    return [
      new Plugin({
        key: new PluginKey("richEditorMarkdownTextPaste"),
        props: {
          clipboardTextParser: (text) => markdownToSlice(text, schema),
          // Real-world tables (Wikipedia, Docs, Word, Sheets, Notion) squared and
          // their cells flattened BEFORE the schema parses them — a second block
          // in a cell must never become a second cell (paste-html.ts).
          transformPastedHTML: (html) => {
            const result = normalizePastedHtml(html);
            const notice = mergedCellsNotice(result.mergedCellsSplit);
            if (notice) onNotice?.(notice);
            return result.html;
          },
        },
      }),
    ];
  },
});

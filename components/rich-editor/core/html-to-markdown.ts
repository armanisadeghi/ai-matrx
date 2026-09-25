// components/rich-editor/core/html-to-markdown.ts
//
// THE editor's HTML → markdown converter, used for every paste in both views.
// It is the visual schema itself: the schema's HTML parse rules read the DOM
// (headings, lists, quotes, tables, links, emphasis, <pre> → fenced code,
// <img> → image), and markdown-serialize.ts writes it — no second converter,
// no escapes added. Browser (or jsdom) only: it needs a DOM to parse into.

import { DOMParser as ProseMirrorDOMParser, type Schema } from "@tiptap/pm/model";
import { createSerializeContext, serializeBlock } from "./markdown-serialize";

export function htmlToMarkdown(html: string, schema: Schema): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  const doc = ProseMirrorDOMParser.fromSchema(schema).parse(container);
  return serializeBlock(doc, createSerializeContext()).replace(/\s+$/, "");
}

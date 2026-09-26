// components/rich-editor/core/clipboard-text.ts
//
// Copying from the visual view puts ONE blank line between blocks on the
// clipboard's text/plain — the same spacing the text has in Source.
//
// Every stored block is a `sourceBlock` wrapping its paragraph/heading/list, so
// Tiptap's core serializer (getTextBetween: a separator for EVERY block node)
// wrote a separator for the wrapper AND for the paragraph inside it — one
// blank line came out as three, plus a leading blank pair. Here nested block
// starts collapse into one separator, nothing precedes the first text or
// follows the last, while atoms keep their renderText
// (islands copy their source, a hard break copies a newline).

import { Extension, getTextSerializersFromSchema } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const BLOCK_SEPARATOR = "\n\n";

export function clipboardTextBetween(
  doc: PMNode,
  from: number,
  to: number,
  serializers: ReturnType<typeof getTextSerializersFromSchema>,
): string {
  let text = "";
  // A block start only PROMISES a separator; it is written when text follows,
  // so an empty trailing paragraph adds nothing and nested starts collapse.
  let pending = false;
  const append = (piece: string) => {
    if (!piece) return;
    if (pending && text) text += BLOCK_SEPARATOR;
    pending = false;
    text += piece;
  };
  doc.nodesBetween(from, to, (node, pos, parent, index) => {
    if (node.isBlock) pending = true;
    const serialize = serializers[node.type.name];
    if (serialize) {
      if (parent) append(serialize({ node, pos, parent, index, range: { from, to } }));
      return false;
    }
    if (node.isText) append((node.text ?? "").slice(Math.max(from, pos) - pos, to - pos));
    return true;
  });
  return text;
}

/** Outranks Tiptap's core clipboardTextSerializer (the first plugin with the prop wins). */
export const ClipboardPlainText = Extension.create({
  name: "clipboardPlainText",
  priority: 1000,
  addProseMirrorPlugins() {
    const { editor } = this;
    return [
      new Plugin({
        key: new PluginKey("clipboardPlainText"),
        props: {
          clipboardTextSerializer: () => {
            const { doc, selection, schema } = editor.state;
            const serializers = getTextSerializersFromSchema(schema);
            return [...selection.ranges]
              .sort((a, b) => a.$from.pos - b.$from.pos)
              .map(({ $from, $to }) => clipboardTextBetween(doc, $from.pos, $to.pos, serializers))
              .join(BLOCK_SEPARATOR);
          },
        },
      }),
    ];
  },
});

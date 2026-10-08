// features/spaces/editor/numbering.ts — C4: Notion numbers nested lists 1. → a. → i. → 1. by depth.
//
// BlockNote numbers every level with digits (its ::before reads data-index). A decoration puts Notion's
// marker on each numbered item as `data-marker`, and spaces.css draws it in place of the digit. The first
// paint (static-body.tsx) writes the same attribute, so the marker never changes when the editor takes over.

import { createExtension } from "@blocknote/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { listMarker } from "./list-marker";

function numberingDecorations(doc: PmNode): DecorationSet {
  const decos: Decoration[] = [];
  // doc > blockGroup > blockContainer > [content, blockGroup?]
  const group = (node: PmNode, pos: number, depth: number) => {
    let run = 0;
    node.forEach((container, offset) => {
      const cPos = pos + 1 + offset;
      const content = container.firstChild;
      const numbered = content?.type.name === "numberedListItem";
      if (numbered) {
        const start = Number(content!.attrs.start);
        run = run === 0 && Number.isFinite(start) && start > 0 ? start : run + 1;
        if (depth > 0) decos.push(Decoration.node(cPos + 1, cPos + 1 + content!.nodeSize, { "data-marker": listMarker(run, depth) }));
      } else run = 0;
      container.forEach((child, childOffset) => {
        if (child.type.name === "blockGroup") group(child, cPos + 1 + childOffset, numbered ? depth + 1 : depth);
      });
    });
  };
  doc.forEach((child, offset) => {
    if (child.type.name === "blockGroup") group(child, offset, 0);
  });
  return DecorationSet.create(doc, decos);
}

export const notionNumbering = createExtension(() => ({
  key: "spacesNotionNumbering",
  prosemirrorPlugins: [
    new Plugin<DecorationSet>({
      state: {
        init: (_config, state) => numberingDecorations(state.doc),
        apply: (tr, set) => (tr.docChanged ? numberingDecorations(tr.doc) : set),
      },
      props: {
        decorations(state) {
          return this.getState(state);
        },
      },
    }),
  ],
}));

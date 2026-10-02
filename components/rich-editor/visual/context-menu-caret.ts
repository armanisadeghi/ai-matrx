// components/rich-editor/visual/context-menu-caret.ts
//
// A RIGHT-CLICK PUTS THE CARET WHERE THE PERSON CLICKED — the way Google Docs,
// Notion and every native text field behave. Without it, a right-click on a
// note nobody had clicked into (or clicked into elsewhere) left the selection
// where it was, so "Insert reference…" put the chip at the top or the end of
// the note, far from the click (G8B review, 2026-10-02). A right-click INSIDE
// the current selection keeps it (Copy / Ask about this act on it); a
// right-click on a chip or card selects that block.
//
// The hit is resolved from the click coordinates by ProseMirror's own
// `posAtCoords`. Guard: `__tests__/context-menu-caret.test.ts`.

import { Extension } from "@tiptap/core";
import type { EditorState, Selection } from "@tiptap/pm/state";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";

/** What `view.posAtCoords` answers: the position, and the node it is inside. */
export interface CoordsHit {
  pos: number;
  inside: number;
}

/** The selection a right-click at `hit` leaves, or null to keep the current one. */
export function selectionForContextMenu(state: EditorState, hit: CoordsHit | null): Selection | null {
  if (!hit) return null;
  const { doc, selection } = state;
  const pos = Math.max(0, Math.min(hit.pos, doc.content.size));
  if (!selection.empty && pos >= selection.from && pos <= selection.to) return null;
  if (hit.inside >= 0) {
    const node = doc.nodeAt(hit.inside);
    if (node && node.isAtom && NodeSelection.isSelectable(node)) {
      const next = NodeSelection.create(doc, hit.inside);
      return next.eq(selection) ? null : next;
    }
  }
  const next = TextSelection.near(doc.resolve(pos));
  return next.eq(selection) ? null : next;
}

const key = new PluginKey("richEditorContextMenuCaret");

export const ContextMenuCaret = Extension.create({
  name: "richEditorContextMenuCaret",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        props: {
          handleDOMEvents: {
            contextmenu: (view, event) => {
              const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
              const next = selectionForContextMenu(view.state, hit);
              if (next) view.dispatch(view.state.tr.setSelection(next));
              // Never consume the event: the host's menu still opens.
              return false;
            },
          },
        },
      }),
    ];
  },
});

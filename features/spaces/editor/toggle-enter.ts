// features/spaces/editor/toggle-enter.ts — Enter at the end of a toggle's title (Notion).
//
// Open toggle: the new line is the toggle's FIRST CHILD (inside it, above anything already there).
// Closed toggle: BlockNote's own Enter — a sibling below. A toggle heading behaves the same.

import type { SpacesEditor } from "./schema";

type SpacesPartialBlock = Parameters<SpacesEditor["insertBlocks"]>[0][number];
type AnyBlock = { id: string; type: string; props?: Record<string, unknown>; children?: AnyBlock[] };

const isToggle = (b: AnyBlock) => b.type === "toggleListItem" || (b.type === "heading" && b.props?.isToggleable === true);

/** Is the toggle open on screen? (BlockNote keeps it on the wrapper; closed when not drawn.) */
export function toggleOpenInDom(id: string): boolean {
  const outer = document.querySelector(`.spaces-editor .bn-block-outer[data-id="${CSS.escape(id)}"]`);
  return outer?.querySelector(".bn-toggle-wrapper")?.getAttribute("data-show-children") === "true";
}

/** Handle Enter when it belongs inside an open toggle; answers whether it did. */
export function enterIntoOpenToggle(editor: SpacesEditor, isOpen: (id: string) => boolean = toggleOpenInDom): boolean {
  const sel = editor.prosemirrorState.selection;
  if (!sel.empty) return false;
  const block = editor.getTextCursorPosition().block as unknown as AnyBlock;
  if (!isToggle(block) || !isOpen(block.id)) return false;
  // Only at the end of the title: a caret inside it splits the title as usual.
  if (sel.$from.parentOffset !== sel.$from.parent.content.size) return false;
  const first = block.children?.[0];
  const line = { type: "paragraph" } as SpacesPartialBlock;
  const placed = first
    ? editor.insertBlocks([line], first.id, "before")[0]
    : (editor.updateBlock(block.id, { children: [line] } as never) as unknown as AnyBlock).children?.[0];
  if (!placed) return false;
  editor.setTextCursorPosition(placed.id, "start");
  return true;
}

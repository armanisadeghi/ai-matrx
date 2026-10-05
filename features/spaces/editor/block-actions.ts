// features/spaces/editor/block-actions.ts — block commands shared by the block menu and the keyboard.

import type { SpacesEditor } from "./schema";

type AnyBlock = ReturnType<SpacesEditor["getBlock"]> & object;

/** The selected blocks when the given block is part of the selection, else just that block (Notion). */
export function selectedOrCurrent(editor: SpacesEditor, blockId: string): string[] {
  const sel = editor.getSelection()?.blocks ?? [];
  return sel.some((b) => b.id === blockId) ? sel.map((b) => b.id) : [blockId];
}

function withoutIds(block: AnyBlock): Parameters<SpacesEditor["insertBlocks"]>[0][number] {
  const { id: _id, children, ...rest } = block;
  return { ...rest, children: (children as AnyBlock[]).map(withoutIds) } as Parameters<SpacesEditor["insertBlocks"]>[0][number];
}

/** Cmd+D / Duplicate: copies land right after the last one, with fresh ids. */
export function duplicateBlocks(editor: SpacesEditor, ids: string[]) {
  const blocks = ids.map((id) => editor.getBlock(id)).filter((b): b is AnyBlock => Boolean(b));
  if (!blocks.length) return;
  const inserted = editor.insertBlocks(blocks.map(withoutIds), blocks[blocks.length - 1].id, "after");
  const last = inserted[inserted.length - 1];
  if (last) editor.setTextCursorPosition(last.id, "end");
}

/** The block the caret is in. */
export function currentBlockId(editor: SpacesEditor): string | null {
  try {
    return editor.getTextCursorPosition().block.id;
  } catch {
    return null;
  }
}

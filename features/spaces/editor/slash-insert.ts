// features/spaces/editor/slash-insert.ts — where a "/" item's block lands.
//
// BlockNote's insertOrUpdateBlockForSlashMenu places the block at the text cursor AT THE MOMENT IT
// RUNS. An item that first asks something (Link to page, Linked view, Page) runs it after an await —
// by then the picker has taken focus, the room may have re-rendered the document, and the cursor can
// sit anywhere (the title, the top of the page). So the block the "/" was typed in is named when the
// item is clicked, and the insert goes there by id; the caret is put back in the editor after it.

import type { SpacesEditor } from "./schema";

type SpacesPartialBlock = Parameters<SpacesEditor["insertBlocks"]>[0][number];
type AnyBlock = { id: string; content?: unknown; children?: unknown[] };

/** A block the "/" was typed in and left empty (BlockNote clears the query before the item runs). */
export function isEmptySlashBlock(block: AnyBlock | undefined): boolean {
  if (!block || !Array.isArray(block.content)) return false;
  const c = block.content as Array<{ type?: string; text?: string }>;
  return c.length === 0 || (c.length === 1 && c[0]?.type === "text" && (c[0].text === "/" || c[0].text === ""));
}

/** The block the "/" was typed in, named now (before any await). */
export function slashTarget(editor: SpacesEditor): string | null {
  try {
    return editor.getTextCursorPosition().block.id;
  } catch {
    return null;
  }
}

/**
 * Put `block` where the "/" was typed: in place of the block when it is empty (and has no children),
 * else right after it. The caret goes to the next block that takes text — a new empty line when the
 * inserted block is the last one — and the editor is focused, so typing continues below the insert.
 */
export function insertAtSlash(editor: SpacesEditor, targetId: string | null, block: SpacesPartialBlock): string | null {
  const target = ((targetId ? editor.getBlock(targetId) : undefined) ?? safeCursorBlock(editor)) as AnyBlock | undefined;
  if (!target) return null;
  let placedId: string;
  // "/2 columns" inside a column makes a column row right there (Notion: columns nest inside a column).
  if (isEmptySlashBlock(target) && !(target.children?.length)) {
    const { insertedBlocks } = editor.replaceBlocks([target.id], [block]);
    placedId = insertedBlocks[0]?.id ?? target.id;
  } else {
    placedId = editor.insertBlocks([block], target.id, "after")[0].id;
  }
  placeCaretAfter(editor, placedId);
  return placedId;
}

function safeCursorBlock(editor: SpacesEditor) {
  try {
    return editor.getTextCursorPosition().block;
  } catch {
    return undefined;
  }
}

/** Caret into the inserted block when it takes text, else the next line (made when there is none). */
function placeCaretAfter(editor: SpacesEditor, placedId: string): void {
  const placed = editor.getBlock(placedId) as AnyBlock | undefined;
  if (!placed) return;
  try {
    if (Array.isArray(placed.content)) {
      editor.setTextCursorPosition(placedId, "start");
    } else if ((placed as { type?: string }).type === "columnList" || (placed as { type?: string }).type === "tabs") {
      const firstColumn = (placed.children as AnyBlock[] | undefined)?.[0];
      const firstLine = (firstColumn?.children as AnyBlock[] | undefined)?.[0];
      if (firstLine) editor.setTextCursorPosition(firstLine.id, "start");
    } else {
      const next = editor.getNextBlock(placedId) as AnyBlock | undefined;
      if (next && Array.isArray(next.content)) editor.setTextCursorPosition(next.id, "start");
      else {
        const line = editor.insertBlocks([{ type: "paragraph" } as SpacesPartialBlock], placedId, "after")[0];
        editor.setTextCursorPosition(line.id, "start");
      }
    }
  } catch {
    // A block with no text position anywhere near: leave the caret where the editor put it.
  }
  editor.focus();
}

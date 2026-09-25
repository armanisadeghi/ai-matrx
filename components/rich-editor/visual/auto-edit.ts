// components/rich-editor/visual/auto-edit.ts
//
// A block the person just inserted (a code block, an equation) should open in
// its own editor at once. The inserting command marks the position; the node
// view consumes the mark when it mounts there.

import type { Editor } from "@tiptap/core";

const pending = new WeakMap<Editor, Set<number>>();

export function markAutoEdit(editor: Editor, pos: number): void {
  if (pos < 0) return;
  const set = pending.get(editor) ?? new Set<number>();
  set.add(pos);
  pending.set(editor, set);
}

export function consumeAutoEdit(editor: Editor, pos: number): boolean {
  const set = pending.get(editor);
  if (!set?.has(pos)) return false;
  set.delete(pos);
  return true;
}

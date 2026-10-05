// components/rich-editor/in-place/caret-handoff.ts
//
// For hosts whose Edit flag lives in a store (the AI answer: `_editingInPlace`
// on the message row), the double-click's caret is handed to the editor that
// mounts a moment later by key. Taken once; a stale entry is never reused.

import type { CaretContext } from "../core/caret-context";

const pending = new Map<string, CaretContext>();

export function handInPlaceCaret(key: string, caret: CaretContext | null): void {
  if (caret) pending.set(key, caret);
  else pending.delete(key);
}

export function takeInPlaceCaret(key: string): CaretContext | null {
  const caret = pending.get(key) ?? null;
  pending.delete(key);
  return caret;
}

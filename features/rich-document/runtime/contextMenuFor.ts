// features/rich-document/runtime/contextMenuFor.ts
//
// Whether a RichDocument wraps its content in the ONE right-click / long-press
// menu. Content that shows an action surface (bar, mini-bar, ⋯) gets the menu
// by default, so the content itself offers what its bar offers — at any width
// (ALC-15 verifier finding 1: a note's preview at 390px had no menu at all).
// A host opts out with `enableContextMenu={false}`; a remote surface's host
// decides for itself (its bar lives elsewhere).

import type { RichDocumentAction, RichDocumentActionId, RichDocumentActionsVariant } from "../types";

export type ContextMenuOption =
  | boolean
  | { extra?: RichDocumentAction[]; exclude?: (RichDocumentActionId | string)[] };

export function contextMenuFor(
  prop: ContextMenuOption | undefined,
  variant: RichDocumentActionsVariant,
): ContextMenuOption | false {
  if (prop !== undefined) return prop;
  return variant === "bar" || variant === "mini-bar" || variant === "menu" || variant === "icon-only";
}

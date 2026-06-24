"use client";

// features/context-menu-v3/NonEditableContextMenu.tsx
//
// Thin wrapper for READ-ONLY surfaces (viewers, results, RAG/research output,
// rendered markdown, message displays). No text mutation — but Copy, AI
// Actions, Attach To, Share, Export and Convert all work, because the menu
// self-resolves content from the DOM. Presets `isEditable: false`.

import { ContextMenuV3 } from "./ContextMenuV3";
import type { NonEditableContextMenuProps } from "./types";

export function NonEditableContextMenu(props: NonEditableContextMenuProps) {
  return <ContextMenuV3 {...props} isEditable={false} />;
}

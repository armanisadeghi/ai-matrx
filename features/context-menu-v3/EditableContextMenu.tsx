"use client";

// features/context-menu-v3/EditableContextMenu.tsx
//
// Thin wrapper for EDITABLE surfaces (textareas, code/note editors, builders).
// Presets `isEditable` and accepts the text-mutation callbacks that light up
// Cut / Paste / Insert / Save / Delete. All real logic lives in the shell +
// lazy MenuContent — this only fixes the editable preset and narrows the props.

import { ContextMenuV3 } from "./ContextMenuV3";
import type { EditableContextMenuProps } from "./types";

export function EditableContextMenu(props: EditableContextMenuProps) {
  return <ContextMenuV3 {...props} isEditable />;
}

"use client";

import React from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  SetContextValueCore,
  type PostSaveAction,
} from "@/features/scopes/actions/quick-assign/SetContextValueCore";
import type { EditorMode } from "@/features/notes/components/NoteEditorCore";

export interface SetContextValueWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialContent?: string;
  instanceId?: string;
  initialEditorMode?: EditorMode;
}

const OVERLAY_ID = "setContextValueWindow";
const BASE_WINDOW_ID = "set-context-value-window";

export default function SetContextValueWindow({
  isOpen,
  onClose,
  initialContent,
  instanceId,
  initialEditorMode,
}: SetContextValueWindowProps) {
  if (!isOpen) return null;
  // Coerce null/undefined — overlay data read from Redux can hand back
  // `null` for a cleared payload, and the core dereferences `.length` on
  // this string during mount.
  return (
    <SetContextValueWindowInner
      onClose={onClose}
      initialContent={typeof initialContent === "string" ? initialContent : ""}
      instanceId={instanceId}
      initialEditorMode={initialEditorMode}
    />
  );
}

function SetContextValueWindowInner({
  onClose,
  initialContent,
  instanceId,
  initialEditorMode,
}: {
  onClose: () => void;
  initialContent: string;
  instanceId?: string;
  initialEditorMode?: EditorMode;
}) {
  const windowId = instanceId
    ? `${BASE_WINDOW_ID}-${instanceId}`
    : BASE_WINDOW_ID;

  const handleSaved = (_scopeId: string, action: PostSaveAction) => {
    if (action !== "none") onClose();
  };

  const viewportPad = 24;
  const maxWidth =
    typeof window !== "undefined" ? window.innerWidth - viewportPad : 1400;
  const maxHeight =
    typeof window !== "undefined" ? window.innerHeight - viewportPad : 900;

  return (
    <WindowPanel
      title="Set Context Value"
      id={windowId}
      overlayId={OVERLAY_ID}
      minWidth={560}
      minHeight={480}
      width="90vw"
      height="85dvh"
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      position="center"
      onClose={onClose}
    >
      <div className="h-full min-h-0 p-3">
        <SetContextValueCore
          initialContent={initialContent}
          initialEditorMode={initialEditorMode}
          onSaved={handleSaved}
          onCancel={onClose}
        />
      </div>
    </WindowPanel>
  );
}

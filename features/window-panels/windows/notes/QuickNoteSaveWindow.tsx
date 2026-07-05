"use client";

import React from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  QuickNoteSaveCore,
  type PostSaveAction,
} from "@/features/notes/actions/quick-save/QuickNoteSaveCore";
import type { EditorMode } from "@/features/notes/components/NoteEditorCore";
import type { Note } from "@/features/notes/types";

export interface QuickNoteSaveWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialContent?: string;
  defaultFolder?: string;
  defaultNoteName?: string;
  /** Optional instance id so multiple captures can open concurrently. */
  instanceId?: string;
  /**
   * Override the editor mode when opening. Callers feeding very large
   * payloads should pass `"plain"` so the markdown preview pane doesn't
   * try to render hundreds of KB on mount.
   */
  initialEditorMode?: EditorMode;
}

const OVERLAY_ID = "quickNoteSaveWindow";
const BASE_WINDOW_ID = "quick-note-save-window";

export default function QuickNoteSaveWindow({
  isOpen,
  onClose,
  initialContent,
  defaultFolder,
  defaultNoteName,
  instanceId,
  initialEditorMode,
}: QuickNoteSaveWindowProps) {
  if (!isOpen) return null;
  // Coerce null/undefined to safe primitives — the prop's declared default
  // ("") only applies when the value is `undefined`, but callers (e.g. the
  // OverlayController reading from Redux overlay data) can pass `null` if a
  // payload was cleared. The inner component dereferences `.length` on the
  // content string, so a `null` would crash the page on mount.
  return (
    <QuickNoteSaveWindowInner
      onClose={onClose}
      initialContent={typeof initialContent === "string" ? initialContent : ""}
      defaultFolder={
        typeof defaultFolder === "string" && defaultFolder
          ? defaultFolder
          : "Scratch"
      }
      defaultNoteName={
        typeof defaultNoteName === "string" ? defaultNoteName : undefined
      }
      instanceId={instanceId}
      initialEditorMode={initialEditorMode}
    />
  );
}

function QuickNoteSaveWindowInner({
  onClose,
  initialContent,
  defaultFolder,
  defaultNoteName,
  instanceId,
  initialEditorMode,
}: {
  onClose: () => void;
  initialContent: string;
  defaultFolder: string;
  defaultNoteName?: string;
  instanceId?: string;
  initialEditorMode?: EditorMode;
}) {
  const windowId = instanceId
    ? `${BASE_WINDOW_ID}-${instanceId}`
    : BASE_WINDOW_ID;

  const handleSaved = (_note: Note, action: PostSaveAction) => {
    if (action !== "none") onClose();
  };

  const viewportPad = 24;
  const maxWidth =
    typeof window !== "undefined" ? window.innerWidth - viewportPad : 1400;
  const maxHeight =
    typeof window !== "undefined" ? window.innerHeight - viewportPad : 900;

  return (
    <WindowPanel
      title="Quick Save Note"
      id={windowId}
      overlayId={OVERLAY_ID}
      minWidth={520}
      minHeight={420}
      width="90vw"
      height="85dvh"
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      position="center"
      onClose={onClose}
    >
      <div className="h-full min-h-0 p-3">
        <QuickNoteSaveCore
          initialContent={initialContent}
          defaultFolder={defaultFolder}
          defaultNoteName={defaultNoteName}
          initialEditorMode={initialEditorMode}
          onSaved={handleSaved}
          onCancel={onClose}
        />
      </div>
    </WindowPanel>
  );
}

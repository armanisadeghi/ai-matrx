"use client";

/**
 * ContentEditorWindow
 *
 * Variant 1 of 3 in the content-editors family: a single editor, no tabs,
 * no sidebar. The outer page drives initial content via overlay `data` and
 * listens for edits/saves through the `callbackGroupId` channel.
 */

import React, { useCallback, useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ContentEditor } from "@/components/official/content-editor/ContentEditor";
import { useContentEditorEmitter } from "./useContentEditorEmitter";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

export interface ContentEditorWindowProps {
  /** Overlay instanceId — stable across re-renders, unique per window. */
  windowInstanceId: string;
  /** Callback group from the caller (via `useOpenContentEditorWindow`). */
  callbackGroupId?: string | null;

  // From overlay `data`:
  documentId?: string;
  documentTitle?: string;
  initialValue?: string;
  title?: string | null;

  onClose: () => void;
}

export function ContentEditorWindow({
  windowInstanceId,
  callbackGroupId,
  documentId = "default",
  documentTitle,
  initialValue = "",
  title,
  onClose,
}: ContentEditorWindowProps) {
  const [value, setValue] = useState<string>(initialValue);
  const { emit } = useContentEditorEmitter(callbackGroupId, windowInstanceId);

  const handleChange = useCallback(
    (next: string) => {
      setValue(next);
      emit({ type: "change", documentId, value: next });
    },
    [emit, documentId],
  );

  const handleSave = useCallback(
    async (next: string) => {
      emit({ type: "save", documentId, value: next });
    },
    [emit, documentId],
  );

  const handleModeChange = useCallback(
    (mode: string) => {
      emit({ type: "mode-change", documentId, mode });
    },
    [emit, documentId],
  );

  const collectData = useCallback(
    () => ({
      documentId,
      documentTitle: documentTitle ?? null,
      value,
      title: title ?? null,
    }),
    [documentId, documentTitle, value, title],
  );

  return (
    <WindowPanel
      id={`content-editor-window-${windowInstanceId}`}
      title={title ?? documentTitle ?? "Editor"}
      overlayId="contentEditorWindow"
      minWidth={520}
      minHeight={360}
      width={720}
      height={520}
      position="center"
      onClose={onClose}
      onCollectData={collectData}
      bodyClassName="p-3"
    >
      {/*
       * Fallback pane menu — ContentEditor's own EditableContextMenu /
       * NonEditableContextMenu only wraps its "plain" and "preview" modes;
       * wysiwyg/markdown/matrx-split (its DEFAULT mode) render with no menu
       * at all. This outer wrapper is the pane's answer for those modes; the
       * inner one (nested deeper in the DOM) wins whenever it exists, so
       * plain/preview keep their richer editable menu untouched.
       */}
      <NonEditableContextMenu
        sourceFeature="documents"
        contentSource={{ type: "raw" }}
        contextData={{ content: "" }}
        resolveContextOnOpen={() => ({ content: value })}
      >
        <ContentEditor
          value={value}
          onChange={handleChange}
          onSave={handleSave}
          onModeChange={handleModeChange}
          title={documentTitle}
          showCopyButton
          showContentManager
          className="h-full"
        />
      </NonEditableContextMenu>
    </WindowPanel>
  );
}

export default ContentEditorWindow;

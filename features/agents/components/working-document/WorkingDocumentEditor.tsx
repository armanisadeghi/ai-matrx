"use client";

import { useCallback } from "react";
import { NoteEditorCore } from "@/features/notes/components/NoteEditorCore";
import type { ContentSource } from "@/features/rich-document/types";
import { useWorkingDocViewState } from "./workingDocumentViewStore";

interface WorkingDocumentEditorProps {
  conversationId: string;
  draft: string;
  onChange: (value: string) => void;
  onFlush: () => void;
  placeholder?: string;
  className?: string;
  /**
   * The working-document content source. Drives the right-click action menu in
   * the rich preview (copy / save-to-notes-or-task / html / print / edit) so it
   * operates on the real document, with parent linking on save-to-task. The
   * panel header carries the always-visible action bar, so the in-body bar is
   * suppressed (`previewActionsVariant="none"`).
   */
  actionsSource?: ContentSource;
}

export function WorkingDocumentEditor({
  conversationId,
  draft,
  onChange,
  onFlush,
  placeholder,
  className,
  actionsSource,
}: WorkingDocumentEditorProps) {
  const { editorMode } = useWorkingDocViewState(conversationId);

  const handleChange = useCallback(
    (value: string) => onChange(value),
    [onChange],
  );

  const handleFlush = useCallback(
    (value: string) => {
      onChange(value);
      onFlush();
    },
    [onChange, onFlush],
  );

  return (
    <NoteEditorCore
      content={draft}
      onChange={handleChange}
      onChangeFlush={handleFlush}
      editorMode={editorMode}
      placeholder={
        placeholder ??
        "Empty. Ask the agent to draft this — or type here. Your edits and the agent's stay in sync each round."
      }
      className={className ?? "h-full min-h-0"}
      showVoiceButton
      embedded
      resetKey={conversationId}
      actionsSource={actionsSource}
      previewActionsVariant="none"
    />
  );
}

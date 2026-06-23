"use client";

import { useCallback } from "react";
import { NoteEditorCore } from "@/features/notes/components/NoteEditorCore";
import { useWorkingDocViewState } from "./workingDocumentViewStore";

interface WorkingDocumentEditorProps {
  conversationId: string;
  draft: string;
  onChange: (value: string) => void;
  onFlush: () => void;
  placeholder?: string;
  className?: string;
}

export function WorkingDocumentEditor({
  conversationId,
  draft,
  onChange,
  onFlush,
  placeholder,
  className,
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
    />
  );
}

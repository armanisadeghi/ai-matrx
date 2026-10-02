"use client";

/**
 * The canvas bodies for the code editor's live surfaces (`code_preview`,
 * `code_edit_error`). Their content data is JSON; the Apply / Discard / Close
 * buttons call back into the editor that opened them through ids registered in
 * `features/canvas/liveCallbacks.ts`, subscribed: when that editor releases them
 * the body re-renders and says so in one line instead of drawing buttons that
 * do nothing.
 */

import { Unplug } from "lucide-react";
import { useCanvasCallback } from "@/features/canvas/liveCallbacks";
import type { CodeEdit } from "@/features/code-editor/utils/parseCodeEdits";
import { CodePreviewCanvas } from "./CodePreviewCanvas";
import { CodeEditErrorCanvas } from "./CodeEditErrorCanvas";

/** What a `code_preview` tab carries. */
export interface CodePreviewCanvasData {
  originalCode: string;
  modifiedCode: string;
  language: string;
  edits: CodeEdit[];
  explanation?: string;
  callbacks: { onApply: string; onDiscard: string; onCloseModal?: string };
}

/** What a `code_edit_error` tab carries. */
export interface CodeEditErrorCanvasData {
  errors: string[];
  warnings: string[];
  rawResponse: string;
  callbacks: { onClose: string };
}

function readCallbacks(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") return {};
  const callbacks = (data as { callbacks?: unknown }).callbacks;
  return callbacks && typeof callbacks === "object"
    ? (callbacks as Record<string, unknown>)
    : {};
}

function EditorClosed() {
  return (
    <div
      className="flex h-full items-center justify-center gap-2 p-6 text-sm text-muted-foreground"
      role="status"
    >
      <Unplug className="h-4 w-4 shrink-0" aria-hidden />
      The editor that made this is closed.
    </div>
  );
}

export function LiveCodePreviewCanvas({ data }: { data: CodePreviewCanvasData }) {
  const callbacks = readCallbacks(data);
  const onApply = useCanvasCallback(callbacks.onApply);
  const onDiscard = useCanvasCallback(callbacks.onDiscard);
  const onCloseModal = useCanvasCallback(callbacks.onCloseModal);
  if (!onApply || !onDiscard) return <EditorClosed />;
  return (
    <CodePreviewCanvas
      originalCode={data.originalCode}
      modifiedCode={data.modifiedCode}
      language={data.language}
      edits={data.edits}
      explanation={data.explanation}
      onApply={onApply}
      onDiscard={onDiscard}
      onCloseModal={onCloseModal ?? undefined}
    />
  );
}

export function LiveCodeEditErrorCanvas({ data }: { data: CodeEditErrorCanvasData }) {
  const onClose = useCanvasCallback(readCallbacks(data).onClose);
  if (!onClose) return <EditorClosed />;
  return (
    <CodeEditErrorCanvas
      errors={data.errors}
      warnings={data.warnings}
      rawResponse={data.rawResponse}
      onClose={onClose}
    />
  );
}

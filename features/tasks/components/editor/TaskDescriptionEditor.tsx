"use client";

// features/tasks/components/editor/TaskDescriptionEditor.tsx
//
// THE task-description editor for every host that is not the task detail page
// (TaskEditorBody owns its own mode and refs because its right-click menu reads
// them). Same field, same toolbar row, same Write → Split → Plain order and the
// same stored value: markdown. The host passes `value` / `onChange`; the mode,
// the refs and a minimal agent scope live here.

import { useCallback, useRef, useState, type ReactNode } from "react";
import type { RichEditorController } from "@ai-matrx/rich-editor/editor/RichEditor";
import type { ApplicationScope } from "@ai-matrx/chat/agents/types/scope.types";
import { TaskDescriptionField, type TaskDescriptionMode } from "./TaskDescriptionField";

const SURFACE_NAME = "matrx-user/tasks";

export interface TaskDescriptionEditorProps {
  value: string;
  onChange: (text: string) => void;
  /** Phones and the quick sheets: the shorter frame, edge to edge. */
  compact?: boolean;
  /** Tailwind height for the editing body (quick-add wants a short one). */
  bodyClassName?: string;
  surfaceName?: string;
  /** The host's own agent scope; without one the editor offers the description itself. */
  getApplicationScope?: () => ApplicationScope;
  /** The host's handle on the real textarea in Split and Plain (selection reads). */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onSelectionChange?: () => void;
}

const passThrough = (body: ReactNode) => body;
const noop = () => undefined;

export function TaskDescriptionEditor({
  value,
  onChange,
  compact = false,
  bodyClassName,
  surfaceName = SURFACE_NAME,
  getApplicationScope,
  textareaRef,
  onSelectionChange = noop,
}: TaskDescriptionEditorProps) {
  const [mode, setMode] = useState<TaskDescriptionMode>("write");
  const ownTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const richRef = useRef<RichEditorController | null>(null);
  const scope = useCallback(
    (): ApplicationScope => getApplicationScope?.() ?? { content: value },
    [getApplicationScope, value],
  );
  return (
    <TaskDescriptionField
      value={value}
      onChange={onChange}
      mode={mode}
      onModeChange={setMode}
      compact={compact}
      bodyClassName={bodyClassName}
      surfaceName={surfaceName}
      getApplicationScope={scope}
      textareaRef={textareaRef ?? ownTextareaRef}
      richRef={richRef}
      withMenu={passThrough}
      onSelectionChange={onSelectionChange}
    />
  );
}

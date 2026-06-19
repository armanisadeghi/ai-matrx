"use client";

import React, { useState } from "react";
import { cn } from "@/utils/cn";
import { ProInput } from "@/components/official/ProInput";
import {
  useAssociateTask,
  type TaskSource,
} from "@/features/tasks/hooks/useAssociateTask";
import { useRefocusInputAfterAsync } from "@/features/tasks/hooks/useRefocusInputAfterAsync";

interface TaskQuickAddBarProps {
  /** Optional source — if present, every task created here gets associated */
  source?: TaskSource;
  placeholder?: string;
  onCreated?: (taskId: string) => void;
  className?: string;
  /** Override project default */
  projectId?: string;
  /** Compact variant (smaller height) */
  compact?: boolean;
}

/**
 * Drop-in inline "add task" bar. Uses the canonical ProInput (voice + Enter submit)
 * and creates a real task on submit via `useAssociateTask`.
 *
 *   <TaskQuickAddBar source={{ entity_type: "note", entity_id: note.id }} />
 */
export default function TaskQuickAddBar({
  source,
  placeholder = "Add a task...",
  onCreated,
  className,
  projectId,
  compact = false,
}: TaskQuickAddBarProps) {
  const { createAndAssociate, isBusy } = useAssociateTask();
  const { inputRef, scheduleRefocus } = useRefocusInputAfterAsync(isBusy);
  const [value, setValue] = useState("");

  const submit = async () => {
    const title = value.trim();
    if (!title) return;
    const taskId = await createAndAssociate({
      title,
      project_id: projectId,
      source,
    });
    if (taskId) {
      onCreated?.(taskId);
      setValue("");
      scheduleRefocus();
    }
  };

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <ProInput
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onSubmit={() => void submit()}
        submitOnEnter
        submitLabel="Add task"
        submitDisabled={!value.trim() || isBusy}
        isSubmitting={isBusy}
        showCopyButton={false}
        placeholder={placeholder}
        disabled={isBusy}
        className={cn("text-xs bg-card", compact ? "h-7" : "h-8")}
        wrapperClassName="flex-1 min-w-0"
      />
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
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
 * Drop-in inline "add task" bar. Mirrors `VoiceTextarea` in spirit: a single
 * input that transparently creates a real task on Enter via `useAssociateTask`.
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

  const inputH = compact ? "h-7" : "h-8";
  const btnH = compact ? "h-7 w-7" : "h-8 w-8";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        disabled={isBusy}
        className={cn("text-xs bg-card", inputH)}
        style={{ fontSize: "16px" }}
      />
      <Button
        type="button"
        size="sm"
        onClick={submit}
        disabled={!value.trim() || isBusy}
        className={cn("p-0 shrink-0", btnH)}
        title="Create task (Enter)"
      >
        {isBusy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Plus className="w-3.5 h-3.5" />
        )}
      </Button>
    </div>
  );
}

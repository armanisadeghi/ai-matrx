// Task Details Component with Debounced Auto-Save
"use client";

import React, { useState, useEffect } from "react";
import { Loader2, Maximize2 } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { updateTaskFieldThunk } from "@/features/tasks/redux/thunks";
import { useDebounce } from "../hooks/useDebounce";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import TaskAttachmentsPanel from "./TaskAttachmentsPanel";
import type { TaskWithProject } from "@/features/tasks/types";

export default function TaskDetails({ task }: { task: TaskWithProject }) {
  const dispatch = useAppDispatch();

  // Local state for editing
  const [description, setDescription] = useState(task.description || "");
  const [dueDate, setDueDate] = useState(task.dueDate || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Debounce values - wait 1.5 seconds after user stops typing
  const debouncedDescription = useDebounce(description, 1500);
  const debouncedDueDate = useDebounce(dueDate, 1000);

  // Update local state when task prop changes
  useEffect(() => {
    setDescription(task.description || "");
    setDueDate(task.dueDate || "");
  }, [task.id]); // Only reset when task changes

  useEffect(() => {
    if (debouncedDescription !== task.description) {
      setIsSaving(true);
      dispatch(
        updateTaskFieldThunk({
          taskId: task.id,
          patch: { description: debouncedDescription },
        }),
      ).finally(() => setIsSaving(false));
    }
  }, [debouncedDescription, task.id, task.description, dispatch]);

  useEffect(() => {
    if (debouncedDueDate !== task.dueDate) {
      setIsSaving(true);
      dispatch(
        updateTaskFieldThunk({
          taskId: task.id,
          patch: { due_date: debouncedDueDate || null },
        }),
      ).finally(() => setIsSaving(false));
    }
  }, [debouncedDueDate, task.id, task.dueDate, dispatch]);

  const detailsContent = (fullScreenMode = false) => (
    <div className={`space-y-3 ${!fullScreenMode ? "mt-3 pl-6" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isSaving && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" />
              Saving...
            </span>
          )}
        </div>
        {!fullScreenMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsFullScreen(true);
            }}
            className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-accent transition-colors"
            title="Expand to full screen"
          >
            <Maximize2 size={14} />
          </button>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Due Date
        </label>
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Details
        </label>
        <div
          className={`${fullScreenMode ? "max-h-96" : "max-h-48"} overflow-y-auto`}
        >
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add details about this task..."
            className="text-sm resize-y"
            rows={fullScreenMode ? 12 : 8}
          />
        </div>
      </div>

      {/* Attachments — canonical Redux-backed panel (durable file_id via associations) */}
      <TaskAttachmentsPanel taskId={task.id} />
    </div>
  );

  return (
    <>
      {detailsContent(false)}

      {/* Full Screen Modal */}
      <Dialog open={isFullScreen} onOpenChange={setIsFullScreen}>
        <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span
                className={
                  task.completed ? "line-through text-muted-foreground" : ""
                }
              >
                {task.title}
              </span>
            </DialogTitle>
          </DialogHeader>
          {detailsContent(true)}
        </DialogContent>
      </Dialog>
    </>
  );
}

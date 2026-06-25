"use client";

// TaskEditorControllerProvider — shares one useTaskEditorController instance
// across a task subtree (header strip, body, footer, or — in the window — the
// header/footer SLOTS, which are siblings of the body but still descendants of
// this provider, so context reaches them even across the WindowPanel portal).
//
// The provider also renders THE single delete ConfirmDialog for the subtree, so
// no matter how many units mount, there is exactly one (the dead-X / double-
// dialog class is structurally impossible).

import { createContext, useContext } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { TaskEditorController } from "./useTaskEditorController";

const TaskEditorControllerCtx = createContext<TaskEditorController | null>(null);

export function useTaskEditorControllerCtx(): TaskEditorController {
  const ctx = useContext(TaskEditorControllerCtx);
  if (!ctx) {
    throw new Error(
      "useTaskEditorControllerCtx must be used within a TaskEditorControllerProvider",
    );
  }
  return ctx;
}

export function TaskEditorControllerProvider({
  value,
  children,
}: {
  value: TaskEditorController;
  children: React.ReactNode;
}) {
  return (
    <TaskEditorControllerCtx.Provider value={value}>
      {children}
      <ConfirmDialog
        open={value.deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !value.isDeleting) value.setDeleteConfirmOpen(false);
        }}
        title="Delete task"
        description="Delete this task? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        busy={value.isDeleting}
        onConfirm={value.confirmDelete}
      />
    </TaskEditorControllerCtx.Provider>
  );
}

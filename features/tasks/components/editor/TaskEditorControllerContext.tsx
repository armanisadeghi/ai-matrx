"use client";

// TaskEditorControllerProvider — shares one useTaskEditorController instance
// across a task subtree (header strip, body, footer, or — in the window — the
// header/footer SLOTS, which are siblings of the body but still descendants of
// this provider, so context reaches them even across the WindowPanel portal).
//
// 🚨 It used to render this subtree's own delete ConfirmDialog, whose text
// ("This cannot be undone") described a hard DELETE that no longer exists. The
// question now lives in `deleteTaskThunk` — the ONE door every delete control
// goes through — so there is exactly one dialog for the whole feature, and its
// words match what the database actually does (DD-119).

import { createContext, useContext } from "react";
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
    </TaskEditorControllerCtx.Provider>
  );
}

"use client";

import { useSyncExternalStore } from "react";
import type { EditorMode } from "@/features/notes/components/NoteEditorCore";

export type WorkingDocMainView = "editor" | "agent-diff";

export interface WorkingDocViewState {
  mainView: WorkingDocMainView;
  editorMode: EditorMode;
  historyOpen: boolean;
  hasUnseenChange: boolean;
  saving: boolean;
}

const DEFAULT_STATE: WorkingDocViewState = {
  mainView: "editor",
  editorMode: "plain",
  historyOpen: false,
  hasUnseenChange: false,
  saving: false,
};

const store = new Map<string, WorkingDocViewState>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function getWorkingDocViewState(
  conversationId: string,
): WorkingDocViewState {
  return store.get(conversationId) ?? DEFAULT_STATE;
}

export function patchWorkingDocViewState(
  conversationId: string,
  next: Partial<WorkingDocViewState>,
): void {
  const cur = getWorkingDocViewState(conversationId);
  const merged = { ...cur, ...next };
  if (
    merged.mainView === cur.mainView &&
    merged.editorMode === cur.editorMode &&
    merged.historyOpen === cur.historyOpen &&
    merged.hasUnseenChange === cur.hasUnseenChange &&
    merged.saving === cur.saving
  ) {
    return;
  }
  store.set(conversationId, merged);
  emit();
}

export function setWorkingDocMainView(
  conversationId: string,
  mainView: WorkingDocMainView,
): void {
  patchWorkingDocViewState(conversationId, { mainView });
}

export function setWorkingDocEditorMode(
  conversationId: string,
  editorMode: EditorMode,
): void {
  patchWorkingDocViewState(conversationId, { editorMode });
}

export function setWorkingDocHistoryOpen(
  conversationId: string,
  historyOpen: boolean,
): void {
  patchWorkingDocViewState(conversationId, { historyOpen });
}

export function useWorkingDocViewState(
  conversationId: string,
): WorkingDocViewState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => getWorkingDocViewState(conversationId),
    () => DEFAULT_STATE,
  );
}

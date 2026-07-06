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
  /**
   * The callId of the latest agent patch the user has acknowledged. Dismisses
   * the "Agent edited" notification (pill + dot) WITHOUT clearing the diff
   * itself — the diff stays viewable in the agent-diff view. `null` = nothing
   * acknowledged yet.
   */
  seenPatchCallId: string | null;
}

const DEFAULT_STATE: WorkingDocViewState = {
  mainView: "editor",
  editorMode: "plain",
  historyOpen: false,
  hasUnseenChange: false,
  saving: false,
  seenPatchCallId: null,
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
    merged.saving === cur.saving &&
    merged.seenPatchCallId === cur.seenPatchCallId
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

/** Acknowledge the latest agent patch — clears the notification, keeps the diff. */
export function setWorkingDocSeenPatch(
  conversationId: string,
  callId: string | null,
): void {
  patchWorkingDocViewState(conversationId, { seenPatchCallId: callId });
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

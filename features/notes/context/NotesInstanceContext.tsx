"use client";

// Minimal context to share instanceId across the notes component tree.
// Avoids prop drilling instanceId through every layer while keeping
// the zero-prop-drilling Redux architecture intact.

import { createContext, useContext } from "react";

const NotesInstanceContext = createContext<string | null>(null);

export const NotesInstanceProvider = NotesInstanceContext.Provider;

export function useNotesInstanceId(): string {
  const id = useContext(NotesInstanceContext);
  if (!id) throw new Error("useNotesInstanceId must be used within NotesInstanceProvider");
  return id;
}

/**
 * The instance id when this component sits inside a NotesView, `undefined`
 * otherwise. For components (the phone editor) that report tabs / find state
 * when a view owns them and still work when mounted alone.
 */
export function useOptionalNotesInstanceId(): string | undefined {
  return useContext(NotesInstanceContext) ?? undefined;
}

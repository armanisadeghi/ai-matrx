"use client";

import { createContext, useContext, type MutableRefObject } from "react";

/** Handlers registered by the lazy-loaded menu chunk; shell calls these on the static trigger. */
export type NoteContextMenuBridgeHandlers = {
  onMouseDown: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onContextMenuOpenChange: (open: boolean) => void;
};

export const NoteContextMenuBridgeContext =
  createContext<MutableRefObject<NoteContextMenuBridgeHandlers | null> | null>(
    null,
  );

export function useNoteContextMenuBridge(): MutableRefObject<NoteContextMenuBridgeHandlers | null> {
  const ref = useContext(NoteContextMenuBridgeContext);
  if (!ref) {
    throw new Error(
      "NoteContextMenuHeavy must be rendered inside NoteContextMenu",
    );
  }
  return ref;
}

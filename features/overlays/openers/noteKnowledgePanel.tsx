"use client";

/**
 * Opener for the `noteKnowledgePanel` overlay — a note's RAG / knowledge-base
 * surface (index status, re-index, chunks, test search) opened in a NON-BLOCKING
 * resizable RIGHT sidebar (SidePanelSurface), the same "pops out, stays open
 * while you edit" affordance files use for their Document tab.
 *
 * - `useOpenNoteKnowledgePanel()` — imperative hook; returns a `close()` handle.
 * - `<NoteKnowledgePanelController />` — declarative wrapper.
 *
 * Singleton: one knowledge sidebar; opening for another note re-points it.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "noteKnowledgePanel" as const;

export interface OpenNoteKnowledgePanelOptions {
  noteId: string;
  /** Header title; falls back to "Knowledge base". */
  title?: string;
}

export interface NoteKnowledgePanelHandle {
  close: () => void;
}

export function useOpenNoteKnowledgePanel() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenNoteKnowledgePanelOptions): NoteKnowledgePanelHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: { noteId: opts.noteId, title: opts.title },
        }),
      );
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}

/** Declarative form. Renders nothing; opens on mount, closes on unmount. */
export function NoteKnowledgePanelController(
  props: OpenNoteKnowledgePanelOptions,
): null {
  const open = useOpenNoteKnowledgePanel();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.noteId, props.title]);
  return null;
}

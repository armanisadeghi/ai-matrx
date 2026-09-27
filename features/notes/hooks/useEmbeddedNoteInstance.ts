"use client";

/**
 * A notes instance for a host that shows ONE note outside /notes (a context
 * drawer, the Knowledge hub's peek): registers the instance with that note as
 * its only, active tab, so `NoteContentEditor` and the view-mode controls work
 * exactly as they do on /notes.
 */

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  addInstanceTab,
  registerInstance,
  setInstanceActiveTab,
} from "@/features/notes/redux/slice";

export function useEmbeddedNoteInstance(instanceId: string | null, noteId: string | null): void {
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!instanceId || !noteId) return;
    dispatch(registerInstance(instanceId));
    dispatch(addInstanceTab({ instanceId, noteId }));
    dispatch(setInstanceActiveTab({ instanceId, noteId }));
  }, [dispatch, instanceId, noteId]);
}

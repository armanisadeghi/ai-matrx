/**
 * features/notes/hooks/useNoteIngestStatus.ts
 *
 * "Is this note in the knowledge base?" — a DIRECT Supabase read of
 * `docproc.processed_documents` anchored to the note, mirroring the
 * cloud-files `document-lookup.ts` pattern (RLS-readable table, no
 * Python round-trip).
 *
 * Selection: latest non-archived `processed_documents` row for
 * (`source_kind = 'note'`, `source_id = <note id>`). Returns a small
 * tri-state the toolbar can render as a subtle "indexed" dot.
 *
 * Read ONCE per note per tab into the notes slice (`ingestByNoteId`): a
 * woken or remounted note view renders the store and reads nothing.
 *
 * Re-probes when the cross-component `cloud-files:document-processed`
 * event fires for this note (dispatched by `ProcessForRagButton` /
 * `useFileIngest` on a successful ingest), so the dot lights up the
 * instant a "Run NER now" run completes.
 */

"use client";

import { useEffect } from "react";
import { createSelector } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import type { AppStore } from "@/lib/redux/store";
import type { RootState } from "@/lib/redux/rootReducer";
import { noteIngestRequested, noteIngestResolved, type NoteIngestEntry } from "../redux/slice";

export type NoteIngestState = "loading" | "ingested" | "not_ingested";

const PROCESSED_EVENT = "cloud-files:document-processed";

const selectNoteIngest = createSelector(
  [(state: RootState) => state.notes.ingestByNoteId, (_state: RootState, noteId: string) => noteId],
  (byId, noteId): NoteIngestEntry | undefined => byId[noteId],
);

// Reads in flight, so two views of one note mounting together ask once.
const inFlight = new Map<string, Promise<void>>();

async function readNoteIngest(store: AppStore, noteId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .schema("docproc")
      .from("processed_documents")
      .select("id")
      .eq("source_kind", "note")
      .eq("source_id", noteId)
      .is("archived_at", null)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // RLS filters rows, it never errors — a real error is transient; the dot
    // stays off (not ingested) rather than claiming a document.
    store.dispatch(noteIngestResolved({ noteId, documentId: error ? null : (data?.id ?? null) }));
  } catch {
    store.dispatch(noteIngestResolved({ noteId, documentId: null }));
  }
}

/** Read the note's knowledge-base row into the store (`force`: on purpose, e.g. an ingest finished). */
function probeNoteIngest(store: AppStore, noteId: string, force: boolean): Promise<void> {
  if (!force) {
    const pending = inFlight.get(noteId);
    if (pending) return pending;
    if (selectNoteIngest(store.getState(), noteId)) return Promise.resolve();
  }
  store.dispatch(noteIngestRequested({ noteId }));
  const work = readNoteIngest(store, noteId).finally(() => {
    if (inFlight.get(noteId) === work) inFlight.delete(noteId);
  });
  inFlight.set(noteId, work);
  return work;
}

export function useNoteIngestStatus(noteId: string | null): {
  state: NoteIngestState;
  /** processed_documents.id when ingested — for /knowledge/viewer/<id> or the
   *  embedded Knowledge viewer. Null when not ingested / still loading. */
  documentId: string | null;
  refresh: () => void;
} {
  const store = useAppStore();
  const entry = useAppSelector((state) => (noteId ? selectNoteIngest(state, noteId) : undefined));
  const known = entry !== undefined;

  // Once per note per tab: a woken or remounted view reads the store.
  useEffect(() => {
    if (!noteId || known) return;
    void probeNoteIngest(store, noteId, false);
  }, [noteId, known, store]);

  // Re-probe when an ingest completes for this note anywhere in the app.
  useEffect(() => {
    if (!noteId) return undefined;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ fileId?: string }>).detail;
      // The event carries the source id under `fileId` for every source kind.
      if (detail?.fileId && detail.fileId === noteId) void probeNoteIngest(store, noteId, true);
    };
    window.addEventListener(PROCESSED_EVENT, handler);
    return () => window.removeEventListener(PROCESSED_EVENT, handler);
  }, [noteId, store]);

  if (!noteId) return { state: "not_ingested", documentId: null, refresh: () => undefined };
  return {
    state: entry?.state ?? "loading",
    documentId: entry?.documentId ?? null,
    refresh: () => void probeNoteIngest(store, noteId, true),
  };
}

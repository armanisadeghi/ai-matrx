/**
 * features/notes/hooks/useNoteIngestStatus.ts
 *
 * "Is this note in the knowledge base?" — a DIRECT Supabase read of
 * `public.processed_documents` anchored to the note, mirroring the
 * cloud-files `document-lookup.ts` pattern (RLS-readable table, no
 * Python round-trip).
 *
 * Selection: latest non-archived `processed_documents` row for
 * (`source_kind = 'note'`, `source_id = <note id>`). Returns a small
 * tri-state the toolbar can render as a subtle "indexed" dot.
 *
 * Re-probes when the cross-component `cloud-files:document-processed`
 * event fires for this note (dispatched by `ProcessForRagButton` /
 * `useFileIngest` on a successful ingest), so the dot lights up the
 * instant a "Run NER now" run completes.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { extractErrorMessage } from "@/utils/errors";

export type NoteIngestState = "loading" | "ingested" | "not_ingested";

const PROCESSED_EVENT = "cloud-files:document-processed";

export function useNoteIngestStatus(noteId: string | null): {
  state: NoteIngestState;
  /** processed_documents.id when ingested — for /rag/viewer/<id> or the
   *  embedded RAG viewer. Null when not ingested / still loading. */
  documentId: string | null;
  refresh: () => void;
} {
  const [state, setState] = useState<NoteIngestState>("loading");
  const [documentId, setDocumentId] = useState<string | null>(null);

  const probe = useCallback(async () => {
    if (!noteId) {
      setState("not_ingested");
      setDocumentId(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("processed_documents")
        .select("id")
        .eq("source_kind", "note")
        .eq("source_id", noteId)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        // RLS filters rows, it never errors — a real error is transient.
        // Treat as not-ingested for display (the dot just stays off).
        setState("not_ingested");
        setDocumentId(null);
        return;
      }
      setState(data ? "ingested" : "not_ingested");
      setDocumentId(data?.id ?? null);
    } catch (err) {
      // Defensive — keep the indicator quiet on any unexpected failure.
      void extractErrorMessage(err);
      setState("not_ingested");
      setDocumentId(null);
    }
  }, [noteId]);

  useEffect(() => {
    setState("loading");
    void probe();
  }, [probe]);

  // Re-probe when an ingest completes for this note anywhere in the app.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ fileId?: string }>).detail;
      // The event carries the source id under `fileId` for every source kind.
      if (detail?.fileId && detail.fileId === noteId) void probe();
    };
    window.addEventListener(PROCESSED_EVENT, handler);
    return () => window.removeEventListener(PROCESSED_EVENT, handler);
  }, [noteId, probe]);

  return { state, documentId, refresh: () => void probe() };
}

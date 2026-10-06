/**
 * The ONE effect behind "the server finished writing a doc — show it".
 *
 * `usePdfExtractor` bumps `processedDocSignal` when a doc's row has new truth
 * (clean text landed, the terminal record_update arrived). Every studio shell
 * (desktop + mobile) feeds that signal through here: refresh the doc list,
 * and — when it is the open doc — re-read the row and its page rows.
 */
import { useEffect, useRef } from "react";
import type { PdfDocument } from "./usePdfExtractor";

interface Args {
  signal: { docId: string; at: number } | null;
  activeDocId: string | null;
  fetchDocument: (docId: string) => Promise<PdfDocument | null>;
  setActiveDoc: (doc: PdfDocument) => void;
  refreshPages: () => void;
  refreshDocs: () => void;
}

export function useProcessedDocSync({
  signal,
  activeDocId,
  fetchDocument,
  setActiveDoc,
  refreshPages,
  refreshDocs,
}: Args): void {
  const activeDocIdRef = useRef<string | null>(null);
  activeDocIdRef.current = activeDocId;
  useEffect(() => {
    if (!signal) return;
    refreshDocs();
    if (signal.docId !== activeDocIdRef.current) return;
    void fetchDocument(signal.docId).then((fresh) => {
      if (fresh && activeDocIdRef.current === fresh.id) setActiveDoc(fresh);
    });
    refreshPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per signal
  }, [signal]);
}

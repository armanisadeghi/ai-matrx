/**
 * features/files/hooks/useFileDocument.ts
 *
 * Suspense-free hook that resolves a `cld_files.id` to its
 * `processed_documents.id` via `/files/{file_id}/document`.
 *
 * State machine:
 *   - `idle`     — no fileId yet
 *   - `loading`  — request in flight (first probe)
 *   - `found`    — processed_documents row exists; `doc` is populated
 *   - `absent`   — file is not ingested for RAG yet (404 from backend)
 *   - `unavailable` — endpoint not yet implemented or transient failure
 *
 * UI rules:
 *   - `found`        → render the Document tab + lineage chip
 *   - `absent`       → Document tab CTA "Process this file for RAG"
 *   - `unavailable`  → hide the tab silently; don't break the rest of
 *                      the preview surface just because RAG is offline
 *
 * Synthetic ids (virtual filesystem files like
 * `vfs:notes:<id>`) skip the probe entirely — virtual sources don't
 * have a binary `cld_files.id` to look up against.
 */

"use client";

import { useEffect, useState } from "react";
import {
  clearFileDocumentCache,
  lookupFileDocument,
  type FileDocumentLookup,
} from "@/features/files/api/document-lookup";
import { isSyntheticId } from "@/features/files/virtual-sources/path";

export type UseFileDocumentState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; doc: FileDocumentLookup }
  | { status: "absent" }
  | { status: "unavailable"; reason: string };

export interface UseFileDocumentResult {
  state: UseFileDocumentState;
  /** Force a re-fetch — call after `/rag/ingest` succeeds. */
  refresh: () => void;
}

export function useFileDocument(
  fileId: string | null,
): UseFileDocumentResult {
  const [state, setState] = useState<UseFileDocumentState>({ status: "idle" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!fileId) {
      setState({ status: "idle" });
      return undefined;
    }
    // Virtual sources have no processed_document by definition (they
    // are Postgres-row "fake files", not S3 bytes the RAG pipeline
    // ingests). Skip the network probe entirely.
    if (isSyntheticId(fileId)) {
      setState({ status: "absent" });
      return undefined;
    }

    let cancelled = false;
    setState({ status: "loading" });

    lookupFileDocument(fileId).then((next) => {
      if (cancelled) return;
      if (next.kind === "found") {
        setState({ status: "found", doc: next.doc });
      } else if (next.kind === "absent") {
        setState({ status: "absent" });
      } else {
        setState({ status: "unavailable", reason: next.reason });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fileId, tick]);

  return {
    state,
    refresh: () => {
      if (fileId) clearFileDocumentCache(fileId);
      setTick((t) => t + 1);
    },
  };
}

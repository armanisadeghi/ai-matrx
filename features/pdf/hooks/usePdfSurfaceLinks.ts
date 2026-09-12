"use client";

/**
 * usePdfSurfaceLinks — resolve the document identity pair (fileId ↔
 * processedDocumentId) from whichever half the calling surface knows.
 *
 * Resolution order:
 *   fileId → canonical_processed_document_id (viewable initial_extract),
 *            falling back to the newest processed_documents row for the file.
 *   processedDocumentId → source file id, then re-canonicalize from that
 *            file so derivative ids (synthetic_qa, …) map back to the extract
 *            the user actually reads.
 *
 * Module-scoped 60s cache: every PDF surface mounts the switcher, and
 * remount storms (tab switches, route transitions) must not refetch.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { resolveCanonicalProcessedDocumentId } from "@/features/files/api/document-lookup";
import type { PdfSurfaceLinkIds } from "@/features/pdf/surfaces/registry";

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; ids: PdfSurfaceLinkIds }>();
const inflight = new Map<string, Promise<PdfSurfaceLinkIds>>();

/** Clear cached identity pairs after a pipeline creates or relinks a doc. */
export function invalidatePdfSurfaceLinks(fileId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${fileId}|`)) cache.delete(key);
  }
}

/** One-shot resolver (exported for non-hook callers like action rows).
 *  Same cache as the hook. */
export async function resolvePdfSurfaceIds(opts: {
  fileId?: string | null;
  processedDocumentId?: string | null;
}): Promise<PdfSurfaceLinkIds> {
  const key = `${opts.fileId ?? ""}|${opts.processedDocumentId ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;
  let p = inflight.get(key);
  if (!p) {
    p = resolveIds(opts).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  const ids = await p;
  cache.set(key, { at: Date.now(), ids });
  return ids;
}

async function resolveIds(opts: {
  fileId?: string | null;
  processedDocumentId?: string | null;
}): Promise<PdfSurfaceLinkIds> {
  let fileId = opts.fileId ?? null;
  let processedDocumentId = opts.processedDocumentId ?? null;

  if (fileId && !processedDocumentId) {
    processedDocumentId = await resolveCanonicalProcessedDocumentId(fileId);
    if (!processedDocumentId) {
      const { data: doc } = await supabase
        .schema("docproc")
        .from("processed_documents")
        .select("id")
        .is("deleted_at", null)
        .eq("source_kind", "cld_file")
        .eq("source_id", fileId)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      processedDocumentId = doc?.id ?? null;
    }
  } else if (processedDocumentId && !fileId) {
    const { data: doc } = await supabase
      .schema("docproc")
      .from("processed_documents")
      .select("source_kind, source_id")
      .is("deleted_at", null)
      .eq("id", processedDocumentId)
      .maybeSingle();
    if (!doc) {
      // 🚨 AN ID THAT RESOLVES TO NOTHING IS NOT A DOCUMENT ID.
      // This used to echo the caller's id straight back, so every consumer's
      // "do we have a document?" test (`Boolean(processedDocumentId)`) said YES
      // for an id with no row behind it — and then asked the server for that
      // document's pages and got a 404 it rendered as a red error.
      // Measured 2026-08-25: retrieval's `library_doc` source_kind carries a
      // `rag.library_docs` id, NOT a `docproc.processed_documents` id — all 314
      // such chunks — so the Source Inspector opened on "The requested resource
      // was not found" every single time (Arman: "the window panel doesn't
      // work, which tells me someone didn't wire something correctly").
      // Answering "no document" lets every consumer fall back honestly.
      processedDocumentId = null;
    } else if (doc.source_kind === "cld_file" && doc.source_id) {
      fileId = doc.source_id;
    }
  }

  if (fileId) {
    const canonicalId = await resolveCanonicalProcessedDocumentId(fileId);
    if (canonicalId) processedDocumentId = canonicalId;
  }

  return { fileId, processedDocumentId };
}

export function usePdfSurfaceLinks(opts: {
  fileId?: string | null;
  processedDocumentId?: string | null;
}): { ids: PdfSurfaceLinkIds; loading: boolean } {
  const fileIdInput = opts.fileId ?? null;
  const processedDocumentIdInput = opts.processedDocumentId ?? null;
  const key = `${fileIdInput ?? ""}|${processedDocumentIdInput ?? ""}`;
  const unresolvedIds: PdfSurfaceLinkIds = {
    // A caller-supplied file id is already a file identity. A caller-supplied
    // processed-document id is only a claim until the docproc lookup proves a
    // row exists, so never expose it to page/chunk consumers optimistically.
    fileId: fileIdInput,
    processedDocumentId: null,
  };
  const [resolution, setResolution] = useState<{
    key: string;
    ids: PdfSurfaceLinkIds;
    loading: boolean;
  }>({
    key,
    ids: unresolvedIds,
    loading: Boolean(fileIdInput || processedDocumentIdInput),
  });
  // Key changes render before effects run. Refuse to leak the previous
  // document's verified pair into the new caller during that render.
  const current =
    resolution.key === key
      ? resolution
      : {
          key,
          ids: unresolvedIds,
          loading: Boolean(fileIdInput || processedDocumentIdInput),
        };

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      const pendingIds: PdfSurfaceLinkIds = {
        fileId: fileIdInput,
        processedDocumentId: null,
      };
      if (!fileIdInput && !processedDocumentIdInput) {
        if (!cancelled) {
          setResolution({ key, ids: pendingIds, loading: false });
        }
        return;
      }
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < TTL_MS) {
        if (!cancelled) {
          setResolution({ key, ids: hit.ids, loading: false });
        }
        return;
      }
      let pending = inflight.get(key);
      if (!pending) {
        pending = resolveIds({
          fileId: fileIdInput,
          processedDocumentId: processedDocumentIdInput,
        }).finally(() => inflight.delete(key));
        inflight.set(key, pending);
      }
      if (!cancelled) {
        setResolution({ key, ids: pendingIds, loading: true });
      }
      try {
        const resolved = await pending;
        cache.set(key, { at: Date.now(), ids: resolved });
        if (!cancelled) {
          setResolution({ key, ids: resolved, loading: false });
        }
      } catch {
        // Resolution failure degrades gracefully to the identities already
        // proven by the caller. An unverified document id stays unavailable.
        if (!cancelled) {
          setResolution({ key, ids: pendingIds, loading: false });
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fileIdInput, key, processedDocumentIdInput]);

  return { ids: current.ids, loading: current.loading };
}

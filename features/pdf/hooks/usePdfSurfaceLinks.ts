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
    if (doc?.source_kind === "cld_file" && doc.source_id) {
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
  const key = `${opts.fileId ?? ""}|${opts.processedDocumentId ?? ""}`;
  const cached = cache.get(key);
  const fresh = cached && Date.now() - cached.at < TTL_MS;

  const [ids, setIds] = useState<PdfSurfaceLinkIds>(
    fresh
      ? cached.ids
      : {
          fileId: opts.fileId ?? null,
          processedDocumentId: opts.processedDocumentId ?? null,
        },
  );
  const [loading, setLoading] = useState(!fresh);

  useEffect(() => {
    if (!opts.fileId && !opts.processedDocumentId) {
      setLoading(false);
      return undefined;
    }
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) {
      setIds(hit.ids);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    let p = inflight.get(key);
    if (!p) {
      p = resolveIds(opts).finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    setLoading(true);
    p.then((resolved) => {
      cache.set(key, { at: Date.now(), ids: resolved });
      if (!cancelled) {
        setIds(resolved);
        setLoading(false);
      }
    }).catch(() => {
      // Resolution failure degrades gracefully: the switcher still shows
      // the surfaces reachable from the ids the caller already had.
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { ids, loading };
}

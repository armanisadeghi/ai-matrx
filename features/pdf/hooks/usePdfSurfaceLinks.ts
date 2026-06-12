"use client";

/**
 * usePdfSurfaceLinks — resolve the document identity pair (fileId ↔
 * processedDocumentId) from whichever half the calling surface knows.
 *
 * Resolution order:
 *   fileId → cld_files.canonical_processed_document_id (the bridge),
 *            falling back to the newest processed_documents row whose
 *            source_id = fileId (covers docs extracted before the bridge
 *            triggers landed 2026-06-11).
 *   processedDocumentId → processed_documents.source_id when
 *            source_kind = 'cld_file'.
 *
 * Module-scoped 60s cache: every PDF surface mounts the switcher, and
 * remount storms (tab switches, route transitions) must not refetch.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import type { PdfSurfaceLinkIds } from "@/features/pdf/surfaces/registry";

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; ids: PdfSurfaceLinkIds }>();
const inflight = new Map<string, Promise<PdfSurfaceLinkIds>>();

async function resolveIds(opts: {
  fileId?: string | null;
  processedDocumentId?: string | null;
}): Promise<PdfSurfaceLinkIds> {
  let fileId = opts.fileId ?? null;
  let processedDocumentId = opts.processedDocumentId ?? null;

  if (fileId && !processedDocumentId) {
    const { data: bridge } = await supabase
      .from("cld_files")
      .select("canonical_processed_document_id")
      .eq("id", fileId)
      .maybeSingle();
    processedDocumentId = bridge?.canonical_processed_document_id ?? null;
    if (!processedDocumentId) {
      const { data: doc } = await supabase
        .from("processed_documents")
        .select("id")
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
      .from("processed_documents")
      .select("source_kind, source_id")
      .eq("id", processedDocumentId)
      .maybeSingle();
    if (doc?.source_kind === "cld_file" && doc.source_id) {
      fileId = doc.source_id;
    }
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
      return;
    }
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) {
      setIds(hit.ids);
      setLoading(false);
      return;
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

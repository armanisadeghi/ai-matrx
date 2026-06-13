"use client";

/**
 * usePdfStudioDocs — scoped, filterable list of `processed_documents` for
 * the studio sidebar. Metadata only.
 *
 * Loads once for the signed-in user, then derives the visible list from
 * client-side filters (search query, derivation kind, source kind). For
 * tens of thousands of documents we'll later page or virtualize, but the
 * underlying Supabase query is metadata-only so it scales well past the
 * 50-row default we used in the floating window.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

export interface StudioDocSummary {
  id: string;
  name: string;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  totalPages: number | null;
  mimeType: string | null;
  sourceKind: string | null;
  sourceId: string | null;
  parentProcessedId: string | null;
  derivationKind: string;
  /**
   * True when this doc's backing `cld_files` source has been removed
   * (deleted / trashed). The extracted text still renders, but the original
   * PDF binary can't be shown. Surfaced as a sidebar badge so a broken
   * source is visible at a glance instead of only erroring on open.
   */
  sourceMissing: boolean;
}

type SortKey = "recent" | "name" | "size";

export function usePdfStudioDocs(opts?: { pageSize?: number }) {
  const pageSize = opts?.pageSize ?? 200;
  const userId = useAppSelector(selectUserId);

  const [docs, setDocs] = useState<StudioDocSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bumper, setBumper] = useState(0);

  const refresh = useCallback(() => setBumper((b) => b + 1), []);

  // Archive (soft-delete) a document. `archived_at` is the canonical
  // "removed from view" state the studio query already filters on, so the
  // text/per-page rows survive for recovery while the doc disappears from
  // every studio list. Optimistically drops the row, restores on failure.
  const deleteDoc = useCallback(
    async (id: string) => {
      if (!userId) throw new Error("Not signed in");
      let prev: StudioDocSummary[] = [];
      setDocs((cur) => {
        prev = cur;
        return cur.filter((d) => d.id !== id);
      });
      const { error: err } = await supabase
        .from("processed_documents")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id)
        .eq("owner_id", userId);
      if (err) {
        setDocs(prev);
        throw new Error(err.message);
      }
    },
    [userId],
  );

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from("processed_documents")
          .select(
            "id, name, storage_uri, created_at, updated_at, total_pages, mime_type, source_kind, source_id, parent_processed_id, derivation_kind",
          )
          .eq("owner_id", userId)
          // Archived docs are the canonical "removed from view" state
          // (mirrors document-lookup.ts). Dangling docs whose source binary
          // was lost in the 2026-05 AWS migration are archived, so this
          // keeps them out of the studio without destroying their text.
          .is("archived_at", null)
          .order("created_at", { ascending: false })
          .limit(pageSize);
        if (err) throw err;
        if (cancelled) return;
        const rows = (data ?? []) as Record<string, unknown>[];

        // Source-health pass: for cld_file-backed docs, find which backing
        // `cld_files` rows still exist and aren't trashed. Anything not in
        // that healthy set has lost its original binary. One batched IN
        // query — cheap regardless of corpus size.
        const cldSourceIds = Array.from(
          new Set(
            rows
              .filter((r) => r.source_kind === "cld_file" && !!r.source_id)
              .map((r) => r.source_id as string),
          ),
        );
        const healthyCldIds = new Set<string>();
        if (cldSourceIds.length > 0) {
          const { data: cldRows } = await supabase
            .from("cld_files")
            .select("id, deleted_at")
            .in("id", cldSourceIds)
            .is("deleted_at", null);
          for (const c of (cldRows ?? []) as { id: string }[]) {
            healthyCldIds.add(c.id);
          }
        }
        if (cancelled) return;

        setDocs(
          rows.map((r) => {
            const sourceKind = (r.source_kind as string | null) ?? null;
            const sourceId = (r.source_id as string | null) ?? null;
            return {
              id: r.id as string,
              name: (r.name as string) ?? "Untitled",
              source: (r.storage_uri as string | null) ?? null,
              createdAt: r.created_at as string,
              updatedAt: r.updated_at as string,
              totalPages: (r.total_pages as number | null) ?? null,
              mimeType: (r.mime_type as string | null) ?? null,
              sourceKind,
              sourceId,
              parentProcessedId:
                (r.parent_processed_id as string | null) ?? null,
              derivationKind:
                (r.derivation_kind as string) ?? "initial_extract",
              sourceMissing:
                sourceKind === "cld_file" &&
                !!sourceId &&
                !healthyCldIds.has(sourceId),
            };
          }),
        );
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load documents");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, pageSize, bumper]);

  // ── Client-side derived filters ─────────────────────────────────────────

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [filterKind, setFilterKind] = useState<string | null>(null);
  // 'all' | 'roots' | 'derivatives' — based on whether parent_processed_id is set.
  const [tier, setTier] = useState<"all" | "roots" | "derivatives">("all");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = docs;
    if (q) {
      rows = rows.filter(
        (d) =>
          d.name.toLowerCase().includes(q) || d.id.toLowerCase().startsWith(q),
      );
    }
    if (filterKind) {
      rows = rows.filter((d) => d.derivationKind === filterKind);
    }
    if (tier === "roots") {
      rows = rows.filter((d) => d.parentProcessedId == null);
    } else if (tier === "derivatives") {
      rows = rows.filter((d) => d.parentProcessedId != null);
    }
    if (sortBy === "name") {
      rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "size") {
      rows = [...rows].sort(
        (a, b) => (b.totalPages ?? 0) - (a.totalPages ?? 0),
      );
    } else {
      // recent — keeps Supabase default order
    }
    return rows;
  }, [docs, search, sortBy, filterKind, tier]);

  // ── Derivation kinds present in the corpus, for the filter chip row ────

  const kinds = useMemo(() => {
    const s = new Set<string>();
    for (const d of docs) s.add(d.derivationKind);
    return Array.from(s).sort();
  }, [docs]);

  return {
    docs,
    visible,
    kinds,
    loading,
    error,
    refresh,
    deleteDoc,
    search,
    setSearch,
    sortBy,
    setSortBy,
    filterKind,
    setFilterKind,
    tier,
    setTier,
  };
}

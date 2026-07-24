"use client";

/**
 * Library grant provenance — WHY the caller can read a shared-knowledge
 * store ("via California Workers' Compensation", "Available to everyone",
 * "Subscribed"). The ONE fetch layer for provenance on every surface
 * (catalog, hit cards, Source Inspector, data-store badges, viewers).
 *
 * Backed by the day-1 contract RPCs (README §2 of
 * docs/proposals/shared-knowledge-projects/):
 *   - public.library_grant_provenance(p_store)         — single store
 *   - public.library_grant_provenance_batch(p_stores)  — N stores, one trip
 * Both return ONLY grants reaching auth.uid() — never the full grant list —
 * so an empty result means "no grant-based entitlement", not "no grants".
 *
 * `useFilesLibraryProvenance` resolves file → library store via
 * `rag.data_store_members` (grant-reader-selectable since
 * data_stores_grant_reader_select.sql) then batches provenance — used where
 * a surface only knows the cld_file id (hit lists, Source Inspector).
 */

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { ragDb } from "@/utils/supabase/ragDb";

export type LibraryGrantAudience = "organization" | "industry" | "global";

export interface LibraryProvenanceEntry {
  storeId: string;
  audience: LibraryGrantAudience;
  industryId: string | null;
  industryName: string | null;
  industrySlug: string | null;
  organizationId: string | null;
}

interface BatchRow {
  store_id: string;
  audience: string;
  industry_id: string | null;
  industry_name: string | null;
  industry_slug: string | null;
  organization_id: string | null;
}

function coerceAudience(v: string): LibraryGrantAudience | null {
  return v === "organization" || v === "industry" || v === "global" ? v : null;
}

function toEntry(row: BatchRow): LibraryProvenanceEntry | null {
  const audience = coerceAudience(row.audience);
  if (!audience) return null;
  return {
    storeId: row.store_id,
    audience,
    industryId: row.industry_id ?? null,
    industryName: row.industry_name ?? null,
    industrySlug: row.industry_slug ?? null,
    organizationId: row.organization_id ?? null,
  };
}

/**
 * One human label for a store's provenance entries. Industry names beat the
 * generic tiers (the industry is the informative "why"); an org-audience
 * grant is a deliberate subscription; global is open to everyone.
 */
export function provenanceLabel(
  entries: readonly LibraryProvenanceEntry[],
): string | null {
  const industry = entries.find(
    (e) => e.audience === "industry" && e.industryName,
  );
  if (industry) return `via ${industry.industryName}`;
  if (entries.some((e) => e.audience === "organization")) return "Subscribed";
  if (entries.some((e) => e.audience === "global"))
    return "Available to everyone";
  return null;
}

/** Same, prefixed for content surfaces: "Shared library · via …". */
export function sharedLibraryLabel(
  entries: readonly LibraryProvenanceEntry[],
): string | null {
  const label = provenanceLabel(entries);
  return label ? `Shared library · ${label}` : null;
}

/**
 * Batch provenance for N stores (ONE round trip — required where a list
 * renders N items). Returns a map keyed by store id; stores with no grant
 * reaching the caller are simply absent.
 */
export function useStoresProvenance(storeIds: readonly string[]): {
  byStore: Map<string, LibraryProvenanceEntry[]>;
  loading: boolean;
  error: string | null;
} {
  const [byStore, setByStore] = useState<
    Map<string, LibraryProvenanceEntry[]>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable identity for the effect — callers pass fresh arrays every render.
  const key = useMemo(() => [...new Set(storeIds)].sort().join(","), [storeIds]);

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setByStore(new Map());
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const supabase = createClient();
        const { data, error: rpcError } = await supabase.rpc(
          "library_grant_provenance_batch",
          { p_stores: ids },
        );
        if (rpcError) throw rpcError;
        if (cancelled) return;
        const next = new Map<string, LibraryProvenanceEntry[]>();
        for (const row of (data ?? []) as BatchRow[]) {
          const entry = toEntry(row);
          if (!entry) continue;
          const list = next.get(entry.storeId) ?? [];
          list.push(entry);
          next.set(entry.storeId, list);
        }
        setByStore(next);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Could not load provenance",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { byStore, loading, error };
}

/** Single-store convenience over the batch hook. */
export function useStoreProvenance(storeId: string | null): {
  entries: LibraryProvenanceEntry[];
  label: string | null;
  loading: boolean;
} {
  const ids = useMemo(() => (storeId ? [storeId] : []), [storeId]);
  const { byStore, loading } = useStoresProvenance(ids);
  const entries = (storeId ? byStore.get(storeId) : undefined) ?? [];
  return { entries, label: provenanceLabel(entries), loading };
}

/**
 * Provenance labels for cld_file-backed content (hit lists, the Source
 * Inspector, viewers): resolve file → library store via
 * `rag.data_store_members`, then batch provenance. Two round trips total for
 * a whole list, never per-row.
 */
export function useFilesLibraryProvenance(fileIds: readonly string[]): {
  /** file_id → "Shared library · via …" (only files with a grant present). */
  labelByFile: Map<string, string>;
  loading: boolean;
} {
  const [storeByFile, setStoreByFile] = useState<Map<string, string[]>>(
    new Map(),
  );
  const [membersLoading, setMembersLoading] = useState(false);

  const key = useMemo(() => [...new Set(fileIds)].sort().join(","), [fileIds]);

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setStoreByFile(new Map());
      return undefined;
    }
    let cancelled = false;
    setMembersLoading(true);
    (async () => {
      try {
        const supabase = createClient();
        // RLS-gated read: rows come back only for stores the caller can see
        // (own, org, or grant-readable). No scope filter needed — membership
        // of a shared library is exactly what we're resolving.
        const { data, error } = await ragDb(supabase)
          .from("data_store_members")
          .select("data_store_id, source_id")
          .eq("source_kind", "cld_file")
          .in("source_id", ids)
          .is("deleted_at", null);
        if (error) throw error;
        if (cancelled) return;
        const next = new Map<string, string[]>();
        for (const row of data ?? []) {
          const list = next.get(row.source_id) ?? [];
          list.push(row.data_store_id);
          next.set(row.source_id, list);
        }
        setStoreByFile(next);
      } catch {
        // Provenance is decoration on content the user already reads —
        // a failed lookup must never break the surface. Absent chip only.
        if (!cancelled) setStoreByFile(new Map());
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  const allStoreIds = useMemo(
    () => [...new Set([...storeByFile.values()].flat())],
    [storeByFile],
  );
  const { byStore, loading: provLoading } = useStoresProvenance(allStoreIds);

  const labelByFile = useMemo(() => {
    const out = new Map<string, string>();
    for (const [fileId, storeIds] of storeByFile) {
      const entries = storeIds.flatMap((s) => byStore.get(s) ?? []);
      const label = sharedLibraryLabel(entries);
      if (label) out.set(fileId, label);
    }
    return out;
  }, [storeByFile, byStore]);

  return { labelByFile, loading: membersLoading || provLoading };
}

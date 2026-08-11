"use client";

/**
 * Hooks for `rag.data_stores` and `rag.data_store_members`.
 *
 * Direct-to-Supabase (rag.* is PostgREST-exposed): the two visibility-aware
 * reads (owner + org + library-grant legs, member counts, polymorphic member
 * label enrichment) call the `rag.fn_list_user_data_stores` /
 * `rag.fn_get_user_data_store` SECURITY DEFINER functions (identity resolved
 * from auth.uid() only — see the migration). Writes are plain `.schema("rag")`
 * inserts/updates/deletes, gated by RLS (owner OR org-member on
 * `data_stores`; the same pattern already existed on `data_store_members`).
 *
 * Lazy by design: nothing fires until a consumer mounts.
 */

import { useEffect, useState, useCallback } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
import { ragDb } from "@/utils/supabase/ragDb";
import type { Database } from "@/types/database.types";
import type {
  DataStore,
  DataStoreWithMemberCount,
} from "@/features/rag/types/data-stores";

type DataStoreUpdate = Database["rag"]["Tables"]["data_stores"]["Update"];

// ---------------------------------------------------------------------------
// Wire shapes returned by the rag.* RPCs/tables (snake_case).
// Mapped to the camelCase DataStore / DataStoreMember shapes the rest
// of the app expects.
// ---------------------------------------------------------------------------

interface ApiDataStoreSummary {
  id: string;
  name: string;
  short_code: string | null;
  description: string | null;
  kind: string;
  member_count: number;
  is_active: boolean;
  access?: string;
  read_only?: boolean;
}

interface ApiDataStoreMember {
  source_kind: string;
  source_id: string;
  label: string | null;
  notes: string | null;
  added_at: string;
}

interface ApiDataStoreDetail {
  id: string;
  name: string;
  short_code: string | null;
  description: string | null;
  kind: string;
  organization_id: string | null;
  is_active: boolean;
  settings: Record<string, unknown>;
  members: ApiDataStoreMember[];
  access?: string;
  read_only?: boolean;
}

type StoreAccess = "owner" | "org" | "granted";

function coerceAccess(v: string | undefined): StoreAccess {
  return v === "org" || v === "granted" ? v : "owner";
}

function summaryToStore(s: ApiDataStoreSummary): DataStoreWithMemberCount {
  return {
    id: s.id,
    organizationId: null, // list endpoint doesn't return it; detail does
    name: s.name,
    shortCode: s.short_code,
    description: s.description,
    kind: s.kind,
    settings: {},
    isActive: s.is_active,
    createdBy: null,
    createdAt: "",
    updatedAt: "",
    access: coerceAccess(s.access),
    readOnly: s.read_only ?? false,
    memberCount: s.member_count,
  };
}

function detailToStore(d: ApiDataStoreDetail): DataStore {
  return {
    id: d.id,
    organizationId: d.organization_id,
    name: d.name,
    shortCode: d.short_code,
    description: d.description,
    kind: d.kind,
    settings: d.settings,
    isActive: d.is_active,
    createdBy: null,
    createdAt: "",
    updatedAt: "",
    access: coerceAccess(d.access),
    readOnly: d.read_only ?? false,
  };
}

// ---------------------------------------------------------------------------
// useDataStores — list + create
// ---------------------------------------------------------------------------

export function useDataStores(): {
  stores: DataStoreWithMemberCount[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createStore: (input: {
    name: string;
    description?: string;
    organizationId?: string | null;
    kind?: string;
    shortCode?: string | null;
  }) => Promise<DataStore | null>;
} {
  const userId = useAppSelector(selectUserId);
  const [stores, setStores] = useState<DataStoreWithMemberCount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bumper, setBumper] = useState(0);

  const refresh = useCallback(() => setBumper((b) => b + 1), []);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const supabase = createClient();
        const { data, error: rpcError } = await ragDb(supabase).rpc(
          "fn_list_user_data_stores",
          { p_include_inactive: false },
        );
        if (rpcError) throw rpcError;
        if (cancelled) return;
        setStores(((data ?? []) as ApiDataStoreSummary[]).map(summaryToStore));
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load data stores");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, bumper]);

  const createStore = useCallback(
    async (input: {
      name: string;
      description?: string;
      organizationId?: string | null;
      kind?: string;
      shortCode?: string | null;
    }) => {
      if (!userId) return null;
      try {
        const supabase = createClient();
        const { data, error: insertError } = await ragDb(supabase)
          .from("data_stores")
          .insert({
            name: input.name,
            description: input.description ?? null,
            kind: input.kind ?? "general",
            short_code: input.shortCode ?? null,
            organization_id: input.organizationId ?? null,
            created_by: userId,
          })
          .select(
            "id, name, short_code, description, kind, organization_id, is_active, settings",
          )
          .single();
        if (insertError) throw insertError;
        refresh();
        return detailToStore({
          ...(data as ApiDataStoreDetail),
          members: [],
        });
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not create data store",
        );
        return null;
      }
    },
    [userId, refresh],
  );

  return { stores, loading, error, refresh, createStore };
}

// ---------------------------------------------------------------------------
// useDataStoreDetail — full detail + members + write actions
// ---------------------------------------------------------------------------

export interface EnrichedMember {
  dataStoreId: string;
  sourceKind: string;
  sourceId: string;
  addedBy: string | null;
  addedAt: string;
  notes: string | null;
  /** Best-effort human label. Null on miss. */
  label: string | null;
}

export function useDataStoreDetail(storeId: string | null) {
  const userId = useAppSelector(selectUserId);
  const [store, setStore] = useState<DataStore | null>(null);
  const [members, setMembers] = useState<EnrichedMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The raw read failure, for `<AccessGate error={…}/>`. */
  const [readError, setReadError] = useState<unknown>(null);
  const [bumper, setBumper] = useState(0);

  const refresh = useCallback(() => setBumper((b) => b + 1), []);

  useEffect(() => {
    if (!storeId) {
      setStore(null);
      setMembers([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReadError(null);

    (async () => {
      try {
        const supabase = createClient();
        const { data: raw, error: rpcError } = await ragDb(supabase).rpc(
          "fn_get_user_data_store",
          { p_store_id: storeId, p_member_limit: 500 },
        );
        if (rpcError) throw rpcError;
        if (cancelled) return;
        if (!raw) {
          // Zero rows: denied / deleted / stale id / signed out. This hook
          // cannot tell them apart and must not pick one — it reports the
          // store as absent with no error, and the surface renders
          // <AccessGate token="data_store"/>, which asks the platform.
          setStore(null);
          setMembers([]);
          setReadError(null);
          return;
        }
        const detail = raw as unknown as ApiDataStoreDetail;
        setStore(detailToStore(detail));
        setMembers(
          (detail.members ?? []).map((m) => ({
            dataStoreId: detail.id,
            sourceKind: m.source_kind,
            sourceId: m.source_id,
            addedBy: null,
            addedAt: m.added_at,
            notes: m.notes,
            label: m.label,
          })),
        );
      } catch (e) {
        if (cancelled) return;
        setReadError(e);
        setError("We couldn't load this data store.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storeId, bumper]);

  const addMember = useCallback(
    async (input: { sourceKind: string; sourceId: string; notes?: string }) => {
      if (!storeId || !userId) return false;
      try {
        const supabase = createClient();
        // Idempotent membership write — revives a soft-deleted binding, mirrors
        // the previous server-side upsert (on_conflict data_store_id/source_kind/source_id).
        const { error: upsertError } = await ragDb(supabase)
          .from("data_store_members")
          .upsert(
            {
              data_store_id: storeId,
              source_kind: input.sourceKind,
              source_id: input.sourceId,
              added_by: userId,
              notes: input.notes ?? null,
              added_at: new Date().toISOString(),
              deleted_at: null,
            },
            { onConflict: "data_store_id,source_kind,source_id" },
          );
        if (upsertError) throw upsertError;
        refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add member");
        return false;
      }
    },
    [storeId, userId, refresh],
  );

  const removeMember = useCallback(
    async (sourceKind: string, sourceId: string) => {
      if (!storeId) return false;
      try {
        const supabase = createClient();
        const { error: deleteError } = await ragDb(supabase)
          .from("data_store_members")
          .delete()
          .eq("data_store_id", storeId)
          .eq("source_kind", sourceKind)
          .eq("source_id", sourceId);
        if (deleteError) throw deleteError;
        refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not remove member");
        return false;
      }
    },
    [storeId, refresh],
  );

  const updateStore = useCallback(
    async (patch: {
      name?: string;
      description?: string | null;
      shortCode?: string | null;
      kind?: string | null;
      isActive?: boolean;
    }) => {
      if (!storeId) return false;
      const body: DataStoreUpdate = {};
      if (patch.name !== undefined) body.name = patch.name;
      if (patch.description !== undefined) body.description = patch.description;
      if (patch.shortCode !== undefined) body.short_code = patch.shortCode;
      if (patch.isActive !== undefined) body.is_active = patch.isActive;
      // `kind` intentionally not patchable (matches previous backend behavior).
      if (Object.keys(body).length === 0) return true;
      try {
        const supabase = createClient();
        const { error: updateError } = await ragDb(supabase)
          .from("data_stores")
          .update(body)
          .eq("id", storeId);
        if (updateError) throw updateError;
        refresh();
        return true;
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not update data store",
        );
        return false;
      }
    },
    [storeId, refresh],
  );

  const deleteStore = useCallback(async () => {
    if (!storeId) return false;
    try {
      const supabase = createClient();
      const { error: deleteError } = await ragDb(supabase)
        .from("data_stores")
        .delete()
        .eq("id", storeId);
      if (deleteError) throw deleteError;
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete data store");
      return false;
    }
  }, [storeId]);

  return {
    store,
    members,
    loading,
    error,
    readError,
    refresh,
    addMember,
    removeMember,
    updateStore,
    deleteStore,
  };
}

// ---------------------------------------------------------------------------
// useDataStoreMembersRich — server-enriched member list with file name,
// size, page count, chunk count, and a derived status badge so the user
// can SEE what's in each store at a glance.
// ---------------------------------------------------------------------------

export interface RichMember {
  sourceKind: string;
  sourceId: string;
  addedAt: string;
  notes: string | null;
  name: string;
  mimeType: string | null;
  fileSize: number | null;
  processedDocumentId: string | null;
  pages: number;
  chunks: number;
  embeddingsOai: number;
  status:
    | "ready"
    | "embedding"
    | "extracted"
    | "pending"
    | "no_processing"
    | "unknown";
}

interface ApiRichMember {
  source_kind: string;
  source_id: string;
  added_at: string;
  notes: string | null;
  name: string;
  mime_type: string | null;
  /**
   * Phase 0 rename: `file_size` → `size_bytes` (see
   * docs/PYTHON_UPDATES.md §3). The Python `RichDataStoreMember` schema
   * has been regenerated.
   */
  size_bytes: number | null;
  processed_document_id: string | null;
  pages: number;
  chunks: number;
  embeddings_oai: number;
  status: string;
}

interface ApiRichMembersResponse {
  data_store_id: string;
  members: ApiRichMember[];
}

export function useDataStoreMembersRich(storeId: string | null) {
  const [members, setMembers] = useState<RichMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bumper, setBumper] = useState(0);

  const refresh = useCallback(() => setBumper((b) => b + 1), []);

  useEffect(() => {
    if (!storeId) {
      setMembers([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const supabase = createClient();
        const { data: raw, error: rpcError } = await ragDb(supabase).rpc(
          "fn_data_store_members_rich",
          { p_store_id: storeId },
        );
        if (rpcError) throw rpcError;
        if (cancelled) return;
        const data = raw as unknown as ApiRichMembersResponse | null;
        const list = Array.isArray(data?.members) ? data.members : [];
        setMembers(
          list.map((m) => ({
            sourceKind: m.source_kind,
            sourceId: m.source_id,
            addedAt: m.added_at,
            notes: m.notes,
            name: m.name ?? m.source_id,
            mimeType: m.mime_type,
            fileSize: m.size_bytes,
            processedDocumentId: m.processed_document_id,
            pages: typeof m.pages === "number" ? m.pages : 0,
            chunks: typeof m.chunks === "number" ? m.chunks : 0,
            embeddingsOai:
              typeof m.embeddings_oai === "number" ? m.embeddings_oai : 0,
            status: (m.status as RichMember["status"]) ?? "unknown",
          })),
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load members");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, bumper]);

  return { members, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useDocumentDataStores — bind/unbind a single document to N stores.
//
// Used by DataStoreBindPanel inside the file workspace + the 4-pane
// viewer's "Data stores" dialog. The membership Set is computed
// client-side from the per-store member listings (one HTTP call).
// ---------------------------------------------------------------------------

export function useDocumentDataStores(processedDocumentId: string | null) {
  const userId = useAppSelector(selectUserId);
  const list = useDataStores();
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [bumper, setBumper] = useState(0);

  const refresh = useCallback(() => setBumper((b) => b + 1), []);

  useEffect(() => {
    if (!processedDocumentId || list.stores.length === 0) {
      setMemberOf(new Set());
      return undefined;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // One query: RLS on data_store_members already scopes to stores the
        // caller can see (owner/org), so no N+1 detail-fetch fan-out needed.
        const supabase = createClient();
        const { data, error: selectError } = await ragDb(supabase)
          .from("data_store_members")
          .select("data_store_id")
          .eq("source_kind", "processed_document")
          .eq("source_id", processedDocumentId)
          .is("deleted_at", null);
        if (selectError) throw selectError;
        if (cancelled) return;
        setMemberOf(
          new Set((data ?? []).map((r) => r.data_store_id as string)),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [processedDocumentId, list.stores, bumper]);

  const bind = useCallback(
    async (dataStoreId: string) => {
      if (!processedDocumentId || !userId) return false;
      try {
        const supabase = createClient();
        const { error: upsertError } = await ragDb(supabase)
          .from("data_store_members")
          .upsert(
            {
              data_store_id: dataStoreId,
              source_kind: "processed_document",
              source_id: processedDocumentId,
              added_by: userId,
              added_at: new Date().toISOString(),
              deleted_at: null,
            },
            { onConflict: "data_store_id,source_kind,source_id" },
          );
        if (upsertError) throw upsertError;
        refresh();
        return true;
      } catch {
        return false;
      }
    },
    [processedDocumentId, userId, refresh],
  );

  const unbind = useCallback(
    async (dataStoreId: string) => {
      if (!processedDocumentId) return false;
      try {
        const supabase = createClient();
        const { error: deleteError } = await ragDb(supabase)
          .from("data_store_members")
          .delete()
          .eq("data_store_id", dataStoreId)
          .eq("source_kind", "processed_document")
          .eq("source_id", processedDocumentId);
        if (deleteError) throw deleteError;
        refresh();
        return true;
      } catch {
        return false;
      }
    },
    [processedDocumentId, refresh],
  );

  return { memberOf, loading, bind, unbind };
}

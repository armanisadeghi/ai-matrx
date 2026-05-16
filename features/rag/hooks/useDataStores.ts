"use client";

/**
 * Hooks for `rag.data_stores` and `rag.data_store_members`.
 *
 * All reads/writes go through the FastAPI HTTP endpoints at
 * `/rag/data-stores/*`. The earlier Supabase-direct path didn't work
 * because PostgREST only exposes the `public` schema by default —
 * adding `rag` to the exposed schemas is a Supabase-dashboard config
 * change. The HTTP endpoints use the service-role pool with explicit
 * user_id checks, so they work regardless of PostgREST config.
 *
 * Lazy by design: nothing fires until a consumer mounts.
 */

import { useEffect, useState, useCallback } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { del, getJson, patchJson, postJson } from "@/lib/python-client";
import type {
  DataStore,
  DataStoreWithMemberCount,
} from "@/features/rag/types/data-stores";

// ---------------------------------------------------------------------------
// Wire shapes returned by /rag/data-stores/* (snake_case Pydantic).
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
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { data } = await getJson<ApiDataStoreSummary[]>(
          "/rag/data-stores?include_inactive=false",
        );
        if (cancelled) return;
        setStores(data.map(summaryToStore));
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
        const { data } = await postJson<ApiDataStoreDetail>(
          "/rag/data-stores",
          {
            name: input.name,
            description: input.description ?? undefined,
            kind: input.kind ?? "general",
            short_code: input.shortCode ?? undefined,
            organization_id: input.organizationId ?? undefined,
          },
        );
        refresh();
        return detailToStore(data);
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
  const [store, setStore] = useState<DataStore | null>(null);
  const [members, setMembers] = useState<EnrichedMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bumper, setBumper] = useState(0);

  const refresh = useCallback(() => setBumper((b) => b + 1), []);

  useEffect(() => {
    if (!storeId) {
      setStore(null);
      setMembers([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { data: detail } = await getJson<ApiDataStoreDetail>(
          `/rag/data-stores/${encodeURIComponent(storeId)}`,
        );
        if (cancelled) return;
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
        setError(e instanceof Error ? e.message : "Could not load data store");
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
      if (!storeId) return false;
      try {
        await postJson<ApiDataStoreDetail>(
          `/rag/data-stores/${encodeURIComponent(storeId)}/members`,
          {
            source_kind: input.sourceKind,
            source_id: input.sourceId,
            notes: input.notes ?? undefined,
          },
        );
        refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add member");
        return false;
      }
    },
    [storeId, refresh],
  );

  const removeMember = useCallback(
    async (sourceKind: string, sourceId: string) => {
      if (!storeId) return false;
      try {
        await del(
          `/rag/data-stores/${encodeURIComponent(storeId)}/members/${encodeURIComponent(sourceKind)}/${encodeURIComponent(sourceId)}`,
        );
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
      const body: Record<string, unknown> = {};
      if (patch.name !== undefined) body.name = patch.name;
      if (patch.description !== undefined) body.description = patch.description;
      if (patch.shortCode !== undefined) body.short_code = patch.shortCode;
      if (patch.isActive !== undefined) body.is_active = patch.isActive;
      // Backend doesn't accept `kind` patches today; ignore silently.
      if (Object.keys(body).length === 0) return true;
      try {
        await patchJson<ApiDataStoreDetail>(
          `/rag/data-stores/${encodeURIComponent(storeId)}`,
          body,
        );
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
      await del(`/rag/data-stores/${encodeURIComponent(storeId)}`);
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
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data } = await getJson<ApiRichMembersResponse>(
          `/rag/data-stores/${encodeURIComponent(storeId)}/members-rich`,
        );
        if (cancelled) return;
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
  const list = useDataStores();
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [bumper, setBumper] = useState(0);

  const refresh = useCallback(() => setBumper((b) => b + 1), []);

  useEffect(() => {
    if (!processedDocumentId || list.stores.length === 0) {
      setMemberOf(new Set());
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // Fan out one detail-fetch per visible store. Each returns its
        // member list; we check for our doc id in each.
        const results = await Promise.all(
          list.stores.map(async (s) => {
            try {
              const { data } = await getJson<ApiDataStoreDetail>(
                `/rag/data-stores/${encodeURIComponent(s.id)}`,
              );
              const isMember = (data.members ?? []).some(
                (m) =>
                  m.source_kind === "processed_document" &&
                  m.source_id === processedDocumentId,
              );
              return isMember ? s.id : null;
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) return;
        setMemberOf(new Set(results.filter(Boolean) as string[]));
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
      if (!processedDocumentId) return false;
      try {
        await postJson<ApiDataStoreDetail>(
          `/rag/data-stores/${encodeURIComponent(dataStoreId)}/members`,
          {
            source_kind: "processed_document",
            source_id: processedDocumentId,
          },
        );
        refresh();
        return true;
      } catch {
        return false;
      }
    },
    [processedDocumentId, refresh],
  );

  const unbind = useCallback(
    async (dataStoreId: string) => {
      if (!processedDocumentId) return false;
      try {
        await del(
          `/rag/data-stores/${encodeURIComponent(dataStoreId)}/members/processed_document/${encodeURIComponent(processedDocumentId)}`,
        );
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

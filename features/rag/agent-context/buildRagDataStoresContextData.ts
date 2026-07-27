/**
 * Canonical scope builder for the `matrx-user/rag-data-stores` surface.
 *
 * Pure mapping of the live `/rag/data-stores` state onto
 * `createRagDataStoresScope(...)`. Nothing here fetches — the page already
 * holds the store list, the selected store's detail, its members, and the
 * shared-library provenance label; this only derives, caps, and names them the
 * way the manifest declares.
 */

import {
  createRagDataStoresScope,
  type RagDataStoreEntry,
  type RagDataStoreMemberEntry,
} from "@/features/surfaces/manifests/rag-data-stores.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type {
  DataStore,
  DataStoreWithMemberCount,
} from "@/features/rag/types/data-stores";
import type { EnrichedMember } from "@/features/rag/hooks/useDataStores";

/** Cap the emitted member list so a huge store can't blow the payload. */
const MAX_MEMBERS = 300;
/** Cap the human-readable `content` blob. */
const CONTENT_CHARS = 6000;

function toStoreEntry(s: DataStoreWithMemberCount): RagDataStoreEntry {
  return {
    id: s.id,
    name: s.name,
    short_code: s.shortCode,
    kind: s.kind,
    description: s.description,
    member_count: s.memberCount,
    is_active: s.isActive,
    access: s.access ?? null,
    read_only: s.readOnly === true,
    organization_id: s.organizationId,
  };
}

function toMemberEntry(m: EnrichedMember): RagDataStoreMemberEntry {
  return {
    source_kind: m.sourceKind,
    source_id: m.sourceId,
    label: m.label,
    notes: m.notes,
    added_at: m.addedAt,
  };
}

function countBy<T>(rows: readonly T[], key: (row: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/**
 * Readable rendering of what is on screen: the selected store and its members
 * when one is open, otherwise the list of stores the user is choosing between.
 */
function storesText(
  store: DataStore | null,
  members: readonly EnrichedMember[],
  stores: readonly DataStoreWithMemberCount[],
): string {
  if (store) {
    const head = [
      store.name,
      store.shortCode ? `(${store.shortCode})` : null,
      store.kind ? `· ${store.kind}` : null,
      store.readOnly ? "· read-only" : null,
    ]
      .filter(Boolean)
      .join(" ");
    const lines = [head];
    if (store.description) lines.push(store.description);
    lines.push(`${members.length} members`);
    for (const m of members) {
      lines.push(`- ${m.label ?? m.sourceId} · ${m.sourceKind}`);
    }
    return lines.join("\n").slice(0, CONTENT_CHARS);
  }
  return stores
    .map(
      (s) =>
        `${s.name} · ${s.kind ?? "general"} · ${s.memberCount} members${s.description ? ` — ${s.description}` : ""}`,
    )
    .join("\n")
    .slice(0, CONTENT_CHARS);
}

export interface BuildRagDataStoresContextDataArgs {
  /** Every store the caller can see (left column). */
  stores?: readonly DataStoreWithMemberCount[];
  /** True while the store list fetch is in flight. */
  listLoading?: boolean;
  /** Error message from the store list fetch, when it failed. */
  listError?: string | null;
  /** The selected store's detail row. Null when nothing is selected. */
  store?: DataStore | null;
  /** Selected store id from `?store_id`, even before its detail settles. */
  selectedStoreId?: string | null;
  /** Members of the selected store. */
  members?: readonly EnrichedMember[];
  /** Shared-library grant provenance label for the selected store. */
  provenanceLabel?: string | null;
  /** True when the caller is a super-admin (may open the publish panel). */
  isSuperAdmin?: boolean;
  /** Browser text selection scoped to this surface, when the user made one. */
  selectionText?: string;
}

/**
 * Build the `matrx-user/rag-data-stores` application scope from live page state.
 */
export function buildRagDataStoresContextData(
  args: BuildRagDataStoresContextDataArgs,
): SurfaceScopePayload {
  const {
    stores = [],
    listLoading = false,
    listError = null,
    store = null,
    selectedStoreId = null,
    members = [],
    provenanceLabel = null,
    isSuperAdmin = false,
    selectionText = "",
  } = args;

  const listStatus = listError
    ? "error"
    : listLoading
      ? "loading"
      : stores.length === 0
        ? "empty"
        : "loaded";

  const surround: Record<string, unknown> = {
    surface: "rag-data-stores",
    store_count: stores.length,
    selected_store_id: selectedStoreId ?? undefined,
    selected_store_name: store?.name,
    selected_store_kind: store?.kind ?? undefined,
    member_count: store ? members.length : undefined,
    access: store?.access,
    read_only: store?.readOnly,
  };

  return createRagDataStoresScope({
    selection: selectionText.length > 0 ? selectionText : undefined,
    content: storesText(store, members, stores) || undefined,
    context: surround,

    // ── Accessible stores ─────────────────────────────────────────────
    store_count: stores.length,
    store_list_status: listStatus,
    accessible_stores: stores.length > 0 ? stores.map(toStoreEntry) : undefined,
    store_kind_breakdown:
      stores.length > 0 ? countBy(stores, (s) => s.kind ?? "general") : undefined,

    // ── Selected store ────────────────────────────────────────────────
    store_id: selectedStoreId ?? undefined,
    store_name: store?.name,
    store_short_code: store?.shortCode ?? undefined,
    store_description: store?.description ?? undefined,
    store_kind: store?.kind ?? undefined,
    store_is_active: store?.isActive,
    store_organization_id: store?.organizationId ?? undefined,
    store_created_by: store?.createdBy ?? undefined,
    store_created_at: store?.createdAt,
    store_updated_at: store?.updatedAt,
    store_settings:
      store && Object.keys(store.settings).length > 0 ? store.settings : undefined,
    store_summary: store
      ? {
          id: store.id,
          name: store.name,
          short_code: store.shortCode,
          description: store.description,
          kind: store.kind,
          is_active: store.isActive,
          organization_id: store.organizationId,
          created_by: store.createdBy,
          created_at: store.createdAt,
          updated_at: store.updatedAt,
          access: store.access ?? null,
          read_only: store.readOnly === true,
          member_count: members.length,
        }
      : undefined,

    // ── Access and sharing ────────────────────────────────────────────
    store_access: store?.access,
    store_read_only: store ? store.readOnly === true : undefined,
    store_provenance_label: provenanceLabel ?? undefined,
    // Mirrors the panel's own `canPublish` gate exactly — super-admin, a
    // library-kind store, and not a read-only grant-conveyed copy.
    store_can_publish:
      store && isSuperAdmin && store.kind === "library" && store.readOnly !== true
        ? true
        : undefined,

    // ── Members ───────────────────────────────────────────────────────
    member_count: store ? members.length : undefined,
    member_source_kinds:
      store && members.length > 0
        ? countBy(members, (m) => m.sourceKind)
        : undefined,
    store_members: store
      ? members.slice(0, MAX_MEMBERS).map(toMemberEntry)
      : undefined,
  });
}

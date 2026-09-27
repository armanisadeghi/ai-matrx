// features/scopes/service/scopeRows.ts
//
// The scope rows' decoders and the slug rule, shared by the two scopes services: the legacy reads in
// `scopesService.ts` and the store-backed writer `scopeStore.ts` (lane SCOPES-WRITE-THROUGH). Every
// scope door answers the old row's image (`to_jsonb(row)`), so one decoder serves both.

import { err, ok } from "@/features/scopes/service/rpcResult";
import {
  isReservedSlug,
  isValidSlug,
  toSlug,
} from "@/features/scopes/utils/slugify";
import type {
  ContextItemRow,
  ScopeNode,
  ScopeRow,
  ScopesRpcResult,
  ScopeTypeNode,
  ScopeTypeRow,
} from "@/features/scopes/types";

// ─── internal: mutation-result decoders ─────────────────────────────────
//
// The mutation RPCs return `to_jsonb(row)` (i.e. `Json` in the generated
// types — no row schema to guard against), so each result passes a minimal
// runtime shape check before the sanctioned two-step cast, then maps onto
// the canonical node shape the tree slice stores. A malformed envelope is
// an `internal` error, never a silently-wrong cache entry.

export function isRowObject(data: unknown): data is Record<string, unknown> {
  return !!data && typeof data === "object" && !Array.isArray(data);
}

export function decodeScopeTypeNode(
  data: unknown,
  rpc: string,
): ScopesRpcResult<ScopeTypeNode> {
  if (!isRowObject(data) || typeof data.id !== "string") {
    return err("internal", `${rpc} returned no scope type row`);
  }
  // `to_jsonb(context.scope_types)` — matches the generated ScopeTypeRow.
  const row = data as unknown as ScopeTypeRow;
  if (typeof row.organization_id !== "string") {
    return err("internal", `${rpc} returned a row without organization_id`);
  }
  return ok({
    id: row.id,
    organization_id: row.organization_id,
    label_singular: row.label_singular ?? "",
    label_plural: row.label_plural ?? "",
    icon: row.icon ?? "folder",
    color: row.color ?? "",
    max_assignments_per_entity: row.max_assignments_per_entity ?? null,
    sort_order: row.sort_order ?? 0,
    parent_type_id: row.parent_type_id ?? null,
    default_variable_keys: row.default_variable_keys ?? [],
    slug: row.slug ?? null,
    description: row.description ?? "",
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
    scopes: [],
  });
}

/** One `context.scopes` row (table read or `to_jsonb` RPC echo) as its tree node. */
export function toScopeNode(row: {
  id: string;
  scope_type_id: string;
  organization_id: string;
  name?: string | null;
  description?: string | null;
  parent_scope_id?: string | null;
  settings?: ScopeNode["settings"] | null;
  slug?: string | null;
  sort_order?: number | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}): ScopeNode {
  return {
    id: row.id,
    scope_type_id: row.scope_type_id,
    organization_id: row.organization_id,
    name: row.name ?? "",
    description: row.description ?? "",
    parent_scope_id: row.parent_scope_id ?? null,
    settings: row.settings ?? {},
    slug: row.slug ?? null,
    sort_order: row.sort_order ?? 0,
    created_by: row.created_by ?? null,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

export function decodeScopeNode(data: unknown, rpc: string): ScopesRpcResult<ScopeNode> {
  if (!isRowObject(data) || typeof data.id !== "string") {
    return err("internal", `${rpc} returned no scope row`);
  }
  // `to_jsonb(context.scopes)` (+ a `type_label` decoration on create).
  const row = data as unknown as ScopeRow;
  if (
    typeof row.organization_id !== "string" ||
    typeof row.scope_type_id !== "string"
  ) {
    return err("internal", `${rpc} returned a row without org/type ids`);
  }
  return ok(toScopeNode(row));
}

export function decodeContextItemRow(
  data: unknown,
  rpc: string,
): ScopesRpcResult<ContextItemRow> {
  if (
    !isRowObject(data) ||
    typeof data.id !== "string" ||
    typeof data.scope_type_id !== "string"
  ) {
    return err("internal", `${rpc} returned no context item row`);
  }
  // `to_jsonb(context.context_items)` — matches the generated ContextItemRow.
  return ok(data as unknown as ContextItemRow);
}

// ─── internal: slug resolution for the create/update writes ─────────────
//
// Same contract the legacy thunks enforced (a valid, unreserved kebab slug
// derived from the display name when the caller doesn't supply one) — but as
// a described `invalid_argument` result instead of a thrown Error.

export function resolveSlug(
  supplied: string | undefined,
  fallbackName: string,
): ScopesRpcResult<string> {
  const slug = supplied?.trim() || toSlug(fallbackName);
  if (!slug || !isValidSlug(slug)) {
    return err(
      "invalid_argument",
      "A URL slug is required — use letters or numbers in the name",
    );
  }
  if (isReservedSlug(slug)) {
    return err(
      "invalid_argument",
      `"${slug}" is a reserved word — choose another slug`,
    );
  }
  return ok(slug);
}

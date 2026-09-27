"use client";

// features/scopes/service/scopeStore.ts
//
// THE ONE WRITER OF SCOPES (lane SCOPES-WRITE-THROUGH, Data Doctrine: the scopes and context
// transition). Every scope type, scope, context field, value, template and tag this app writes goes
// through the record store's scope doors (`custom.context_*`), and nothing else. The doors decide
// which system writes the organization's scopes (`custom.context_writer`, the seam
// `scopes_screens`): in an organization whose record store is the writer, the store is written in
// the same statement and its rules decide, and the old `context.*` rows are kept exact for every
// reader that has not moved; in an older organization the old doors write and the store's copy
// follows. This client never needs to know which: the doors answer the old row's image, so the
// scopes tree and every screen decode the same shape either way, plus which system wrote it.
//
// `scopesService.ts` keeps the READS (tree, values, templates, archived lists, entity tags) and is the
// legacy adapter until the final switch; its write methods are not called by anything but this file's
// predecessor tests. Lint (`eslint.config.mjs`, the scopes chokepoint) points new writers here.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { associationsService } from "@/features/scopes/service/associationsService";
import { isScopesRpcErr } from "@/features/scopes/types";
import {
  err,
  mapPgError,
  mapPgErrorPair,
  ok,
} from "@/features/scopes/service/rpcResult";
import {
  decodeContextItemRow,
  decodeScopeNode,
  decodeScopeTypeNode,
  isRowObject,
  resolveSlug,
} from "@/features/scopes/service/scopeRows";
import type {
  ApplyTemplateResult,
  ContextItemRow,
  CreateContextItemParams,
  CreateScopeParams,
  CreateScopeTypeParams,
  ScopeNode,
  ScopesRpcError,
  ScopesRpcResult,
  ScopeTypeNode,
  SetContextValuePayload,
  SetContextValueResult,
  UpdateContextItemParams,
  UpdateScopeParams,
  UpdateScopeTypeParams,
} from "@/features/scopes/types";
import type { EntityTypeToken } from "@ai-matrx/associations";

type DoorName =
  | "context_type_write"
  | "context_type_archive"
  | "context_type_restore"
  | "context_scope_write"
  | "context_scope_archive"
  | "context_scope_restore"
  | "context_item_write"
  | "context_item_archive"
  | "context_item_restore"
  | "context_value_write"
  | "context_template_apply";

/** The store's doors live in the `custom` schema; the generated types do not list them yet. */
function customDoor(): SupabaseClient {
  return (supabase as unknown as SupabaseClient).schema("custom") as unknown as SupabaseClient;
}

async function callDoor(
  name: DoorName,
  args: Record<string, unknown>,
): Promise<ScopesRpcResult<Record<string, unknown>>> {
  const { data, error } = await customDoor().rpc(name, args);
  if (error) return err(...mapPgErrorPair(error));
  if (!isRowObject(data)) return err("internal", `${name} returned no answer`);
  return ok(data);
}

/** Drop keys whose value is `undefined`, keep `null` (a clear). */
function spec(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) out[k] = v;
  return out;
}

export const scopeStore = {
  // ── SCOPE TYPES (Tables) ─────────────────────────────────────────────────────────────────────
  async createScopeType(params: CreateScopeTypeParams): Promise<ScopesRpcResult<ScopeTypeNode>> {
    try {
      requireUserId();
      const slug = resolveSlug(params.slug, params.label_plural || params.label_singular);
      if (isScopesRpcErr(slug)) return slug;
      const res = await callDoor("context_type_write", {
        p_organization_id: params.org_id,
        p_type_id: null,
        p_spec: spec({
          label_singular: params.label_singular,
          label_plural: params.label_plural,
          parent_type_id: params.parent_type_id,
          icon: params.icon ?? "folder",
          description: params.description ?? "",
          sort_order: params.sort_order ?? 0,
          max_assignments: params.max_assignments,
          default_variable_keys: params.default_variable_keys ?? [],
          color: params.color,
          slug: slug.data,
        }),
      });
      if (isScopesRpcErr(res)) return res;
      return decodeScopeTypeNode(res.data.row, "context_type_write");
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  async updateScopeType(params: UpdateScopeTypeParams): Promise<ScopesRpcResult<ScopeTypeNode>> {
    try {
      requireUserId();
      let slug: string | undefined;
      if (params.slug !== undefined) {
        const resolved = resolveSlug(params.slug, params.label_plural ?? params.label_singular ?? "");
        if (isScopesRpcErr(resolved)) return resolved;
        slug = resolved.data;
      }
      const res = await callDoor("context_type_write", {
        p_organization_id: null,
        p_type_id: params.type_id,
        p_spec: spec({
          label_singular: params.label_singular,
          label_plural: params.label_plural,
          icon: params.icon,
          description: params.description,
          sort_order: params.sort_order,
          max_assignments: params.max_assignments,
          color: params.color,
          slug,
        }),
      });
      if (isScopesRpcErr(res)) return res;
      return decodeScopeTypeNode(res.data.row, "context_type_write");
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /** Soft archive; the scopes and fields it takes with it come back with a restore. */
  async deleteScopeType(typeId: string): Promise<ScopesRpcResult<{ id: string }>> {
    return archiveOrRestore("context_type_archive", { p_type_id: typeId }, typeId);
  },

  async restoreScopeType(typeId: string): Promise<ScopesRpcResult<{ id: string }>> {
    return archiveOrRestore("context_type_restore", { p_type_id: typeId }, typeId);
  },

  // ── SCOPES (Records) ─────────────────────────────────────────────────────────────────────────
  async createScope(params: CreateScopeParams): Promise<ScopesRpcResult<ScopeNode>> {
    try {
      requireUserId();
      const slug = resolveSlug(params.slug, params.name);
      if (isScopesRpcErr(slug)) return slug;
      const res = await callDoor("context_scope_write", {
        p_organization_id: params.org_id,
        p_scope_id: null,
        p_type_id: params.type_id,
        p_spec: spec({
          name: params.name,
          parent_scope_id: params.parent_scope_id,
          description: params.description ?? "",
          settings: params.settings ?? {},
          slug: slug.data,
          sort_order: params.sort_order,
        }),
      });
      if (isScopesRpcErr(res)) return res;
      return decodeScopeNode(res.data.row, "context_scope_write");
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  async updateScope(params: UpdateScopeParams): Promise<ScopesRpcResult<ScopeNode>> {
    try {
      requireUserId();
      let slug: string | undefined;
      if (params.slug !== undefined) {
        const resolved = resolveSlug(params.slug, params.name ?? "");
        if (isScopesRpcErr(resolved)) return resolved;
        slug = resolved.data;
      }
      const res = await callDoor("context_scope_write", {
        p_organization_id: null,
        p_scope_id: params.scope_id,
        p_type_id: null,
        p_spec: spec({
          name: params.name,
          description: params.description,
          settings: params.settings,
          slug,
          sort_order: params.sort_order,
        }),
      });
      if (isScopesRpcErr(res)) return res;
      return decodeScopeNode(res.data.row, "context_scope_write");
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  async deleteScope(scopeId: string): Promise<ScopesRpcResult<{ id: string }>> {
    return archiveOrRestore("context_scope_archive", { p_scope_id: scopeId }, scopeId);
  },

  async restoreScope(scopeId: string): Promise<ScopesRpcResult<{ id: string }>> {
    return archiveOrRestore("context_scope_restore", { p_scope_id: scopeId }, scopeId);
  },

  // ── CONTEXT FIELDS (Fields) ──────────────────────────────────────────────────────────────────
  async createContextItem(params: CreateContextItemParams): Promise<ScopesRpcResult<ContextItemRow>> {
    try {
      requireUserId();
      const res = await callDoor("context_item_write", {
        p_item_id: null,
        p_scope_type_id: params.scope_type_id,
        p_spec: spec({
          key: params.key,
          display_name: params.display_name,
          value_type: params.value_type ?? "string",
          description: params.description ?? "",
          category: params.category,
          fetch_hint: params.fetch_hint ?? "on_demand",
          sensitivity: params.sensitivity ?? "internal",
          tags: params.tags ?? [],
          slug: params.slug,
          sort_order: params.sort_order,
          allowed_reference_types: params.allowed_reference_types,
          max_items: params.max_items,
          allowed_scope_type_ids: params.allowed_scope_type_ids,
          reference_source: params.reference_source,
        }),
      });
      if (isScopesRpcErr(res)) return res;
      return decodeContextItemRow(res.data.row, "context_item_write");
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /**
   * THE context-field edit door. The everyday columns go through `update_context_item`; a patch
   * that clears a column (`null`) or reaches one that door has no parameter for is one row update
   * under the writer's own row policy — the door decides, from the patch, exactly as this service
   * always did.
   */
  async updateContextItem(params: UpdateContextItemParams): Promise<ScopesRpcResult<ContextItemRow>> {
    try {
      requireUserId();
      const { item_id, ...fields } = params;
      const res = await callDoor("context_item_write", {
        p_item_id: item_id,
        p_scope_type_id: null,
        p_spec: spec(fields as Record<string, unknown>),
      });
      if (isScopesRpcErr(res)) return res;
      return decodeContextItemRow(res.data.row, "context_item_write");
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /** Soft archive (`is_active=false`); its values stay. */
  async deleteContextItem(itemId: string): Promise<ScopesRpcResult<{ id: string }>> {
    return archiveOrRestore("context_item_archive", { p_item_id: itemId }, itemId);
  },

  async restoreContextItem(itemId: string): Promise<ScopesRpcResult<{ id: string }>> {
    return archiveOrRestore("context_item_restore", { p_item_id: itemId }, itemId);
  },

  // ── VALUES ───────────────────────────────────────────────────────────────────────────────────
  /**
   * One cell. In an organization whose record store is the writer the value lands in the scope's
   * Record first (the store's field type, ceiling and envelope rules decide) and the old row is its
   * image; otherwise `set_context_value` writes it. Same answer shape either way. `auth.uid()` is
   * the live user, so `acting_user_id` is never sent from the browser.
   */
  async setContextValue(payload: SetContextValuePayload): Promise<ScopesRpcResult<SetContextValueResult>> {
    try {
      requireUserId();
      const res = await callDoor("context_value_write", {
        p_payload: { source_type: "ai_enriched", ...payload },
      });
      if (isScopesRpcErr(res)) return res;
      const envelope = res.data as {
        ok?: boolean;
        data?: SetContextValueResult;
        error?: { code?: string; message?: string };
      };
      if (!envelope.ok) {
        const code = envelope.error?.code;
        const mapped: ScopesRpcError["code"] =
          code === "unauthorized"
            ? // access-errors: ok — passes through the code the value door itself returned; the server's verdict, not a guess
              "unauthorized"
            : code === "forbidden_org"
              ? "forbidden_org"
              : code === "not_found"
                ? "not_found"
                : code === "invalid_argument"
                  ? "invalid_argument"
                  : "internal";
        return err(mapped, envelope.error?.message ?? "Could not set value");
      }
      return ok(envelope.data as SetContextValueResult);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ── TEMPLATES ────────────────────────────────────────────────────────────────────────────────
  /** A template is a set of scope types and their fields, applied through the same doors. */
  async applyTemplate(params: { template_id: string; org_id: string }): Promise<ScopesRpcResult<ApplyTemplateResult>> {
    try {
      requireUserId();
      const res = await callDoor("context_template_apply", {
        p_organization_id: params.org_id,
        p_template_id: params.template_id,
      });
      if (isScopesRpcErr(res)) return res;
      if (typeof res.data.template_id !== "string") {
        return err("internal", "context_template_apply returned no result");
      }
      return ok(res.data as unknown as ApplyTemplateResult);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ── TAGS ─────────────────────────────────────────────────────────────────────────────────────
  /**
   * Replace an entity's scope tags. The canonical association write (one `assoc_set_targets`
   * through the associations package, which keeps its cache); in an organization whose record
   * store is the writer, the database carries each tag's store copy in the same statement.
   */
  async setEntityScopes(
    entityType: EntityTypeToken,
    entityId: string,
    scopeIds: string[],
  ): Promise<ScopesRpcResult<{ scope_ids: string[] }>> {
    try {
      requireUserId();
      const target = Array.from(new Set(scopeIds));
      const res = await associationsService.setTargets({
        sourceType: entityType,
        sourceId: entityId,
        targetType: "scope",
        targetIds: target,
      });
      if (isScopesRpcErr(res)) return res;
      return ok({ scope_ids: target });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },
};

async function archiveOrRestore(
  name: DoorName,
  args: Record<string, unknown>,
  id: string,
): Promise<ScopesRpcResult<{ id: string }>> {
  try {
    requireUserId();
    const res = await callDoor(name, args);
    if (isScopesRpcErr(res)) return res;
    return ok({ id });
  } catch (e) {
    return { ok: false, error: mapPgError(e) };
  }
}

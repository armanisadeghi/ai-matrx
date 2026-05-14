"use client";

import { supabase } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";
import type {
  ContextItem,
  ContextItemManifest,
  ContextItemValue,
  ContextTemplate,
  ContextAccessLogEntry,
  ContextAccessSummary,
  ContextItemFormData,
  ContextValueFormData,
  ContextItemStatus,
  ContextDashboardStats,
  ContextCategoryHealth,
  ContextScopeLevel,
} from "../types";
import { ATTENTION_STATUSES } from "../constants";

type CtxContextItemsInsert =
  Database["public"]["Tables"]["ctx_context_items"]["Insert"];
type CtxItemRow = Database["public"]["Tables"]["ctx_context_items"]["Row"];
type CtxItemValueRow =
  Database["public"]["Tables"]["ctx_context_item_values"]["Row"];

function jsonKeysFromValueJson(valueJson: unknown): string[] | undefined {
  if (valueJson && typeof valueJson === "object" && !Array.isArray(valueJson)) {
    return Object.keys(valueJson as Record<string, unknown>);
  }
  return undefined;
}

function mergeCurrentValuesIntoManifest(
  items: CtxItemRow[],
  currentByItemId: Map<string, CtxItemValueRow>,
): ContextItemManifest[] {
  return items.map((row) => {
    const cur = currentByItemId.get(row.id);
    return {
      ...row,
      current_text_value: cur?.value_text ?? null,
      value_last_updated: cur?.created_at ?? null,
      char_count: cur?.char_count ?? null,
      data_point_count: cur?.data_point_count ?? null,
      has_nested_objects: cur?.has_nested_objects,
      json_keys:
        cur?.value_json != null
          ? jsonKeysFromValueJson(cur.value_json)
          : undefined,
    };
  });
}

/**
 * Resolves `ctx_scopes.id` rows used to find context items via
 * `ctx_scope_assignments`.
 */
async function resolveParentScopeIdsForContextQuery(
  scopeType: ContextScopeLevel,
  scopeId: string,
): Promise<string[]> {
  if (scopeType === "scope") return [scopeId];

  if (scopeType === "organization") {
    const { data, error } = await supabase
      .from("ctx_scopes")
      .select("id")
      .eq("organization_id", scopeId);
    if (error) throw error;
    return (data ?? []).map((r) => r.id);
  }

  if (scopeType === "project") {
    const { data, error } = await supabase
      .from("ctx_scope_assignments")
      .select("scope_id")
      .eq("entity_type", "project")
      .eq("entity_id", scopeId);
    if (error) throw error;
    return [...new Set((data ?? []).map((r) => r.scope_id))];
  }

  if (scopeType === "task") {
    const { data, error } = await supabase
      .from("ctx_scope_assignments")
      .select("scope_id")
      .eq("entity_type", "task")
      .eq("entity_id", scopeId);
    if (error) throw error;
    return [...new Set((data ?? []).map((r) => r.scope_id))];
  }

  if (scopeType === "user") {
    const { data: memberships, error: mErr } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", scopeId);
    if (mErr) throw mErr;
    const orgIds = [
      ...new Set((memberships ?? []).map((m) => m.organization_id)),
    ];
    if (orgIds.length === 0) return [];
    const { data: scopes, error: sErr } = await supabase
      .from("ctx_scopes")
      .select("id")
      .in("organization_id", orgIds);
    if (sErr) throw sErr;
    return (scopes ?? []).map((r) => r.id);
  }

  return [];
}

async function collectContextItemIdsForScopes(
  scopeIds: string[],
): Promise<string[]> {
  if (scopeIds.length === 0) return [];
  const { data, error } = await supabase
    .from("ctx_scope_assignments")
    .select("entity_id")
    .in("scope_id", scopeIds)
    .eq("entity_type", "context_item");
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.entity_id))];
}

async function primaryLinkScopeId(
  scopeType: ContextScopeLevel,
  scopeId: string,
): Promise<string | null> {
  if (scopeType === "scope") return scopeId;
  const ids = await resolveParentScopeIdsForContextQuery(scopeType, scopeId);
  return ids[0] ?? null;
}

async function loadManifestForItemIds(
  itemIds: string[],
): Promise<ContextItemManifest[]> {
  if (itemIds.length === 0) return [];

  const { data: items, error: iErr } = await supabase
    .from("ctx_context_items")
    .select("*")
    .in("id", itemIds)
    .order("category", { ascending: true, nullsFirst: true })
    .order("display_name", { ascending: true });
  if (iErr) throw iErr;

  const rows = items ?? [];
  if (rows.length === 0) return [];

  const { data: values, error: vErr } = await supabase
    .from("ctx_context_item_values")
    .select("*")
    .in(
      "context_item_id",
      rows.map((r) => r.id),
    )
    .eq("is_current", true);
  if (vErr) throw vErr;

  const vmap = new Map(
    (values ?? []).map((v) => [v.context_item_id, v] as const),
  );
  return mergeCurrentValuesIntoManifest(rows, vmap);
}

export const contextService = {
  /**
   * Resolves a `ctx_scopes.id` suitable for `ctx_context_item_values.scope_id`
   * when saving from a hierarchy scope (user/org/project/task/scope).
   */
  async resolvePrimaryValueScopeId(
    scopeType: ContextScopeLevel,
    scopeId: string,
  ): Promise<string | null> {
    return primaryLinkScopeId(scopeType, scopeId);
  },

  // ─── Manifest (lightweight list) ───────────────────────────────────
  async fetchManifest(
    scopeType: ContextScopeLevel,
    scopeId: string,
  ): Promise<ContextItemManifest[]> {
    if (scopeType === "scope") {
      return this.fetchManifestByScope(scopeId);
    }

    const parentIds = await resolveParentScopeIdsForContextQuery(
      scopeType,
      scopeId,
    );
    const itemIds = await collectContextItemIdsForScopes(parentIds);
    return loadManifestForItemIds(itemIds);
  },

  // ─── Manifest via dynamic scope (ctx_scope_assignments) ────────────
  async fetchManifestByScope(scopeId: string): Promise<ContextItemManifest[]> {
    const itemIds = await collectContextItemIdsForScopes([scopeId]);
    return loadManifestForItemIds(itemIds);
  },

  // ─── Full item detail ─────────────────────────────────────────────
  async fetchItem(itemId: string): Promise<ContextItem> {
    const { data, error } = await supabase
      .from("ctx_context_items")
      .select("*")
      .eq("id", itemId)
      .single();
    if (error) throw error;
    return data;
  },

  // ─── Current value for an item ────────────────────────────────────
  async fetchCurrentValue(itemId: string): Promise<ContextItemValue | null> {
    const { data, error } = await supabase
      .from("ctx_context_item_values")
      .select("*")
      .eq("context_item_id", itemId)
      .eq("is_current", true)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  // ─── Version history ──────────────────────────────────────────────
  async fetchVersionHistory(itemId: string): Promise<ContextItemValue[]> {
    const { data, error } = await supabase
      .from("ctx_context_item_values")
      .select("*")
      .eq("context_item_id", itemId)
      .order("version", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  // ─── Create item ──────────────────────────────────────────────────
  async createItem(
    scopeType: ContextScopeLevel,
    scopeId: string,
    formData: ContextItemFormData,
  ): Promise<ContextItem> {
    const insertPayload: CtxContextItemsInsert = { ...formData };
    const { data, error } = await supabase
      .from("ctx_context_items")
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;

    const linkScopeId = await primaryLinkScopeId(scopeType, scopeId);
    if (linkScopeId) {
      const { error: assignErr } = await supabase
        .from("ctx_scope_assignments")
        .insert({
          scope_id: linkScopeId,
          entity_type: "context_item",
          entity_id: data.id,
        });
      if (assignErr) throw assignErr;
    }

    return data;
  },

  // ─── Create item and link to dynamic scope ─────────────────────────
  async createItemForScope(
    scopeId: string,
    formData: ContextItemFormData,
  ): Promise<ContextItem> {
    const insertPayload: CtxContextItemsInsert = { ...formData };

    const { data: item, error: itemErr } = await supabase
      .from("ctx_context_items")
      .insert(insertPayload)
      .select()
      .single();
    if (itemErr) throw itemErr;

    const { error: assignErr } = await supabase
      .from("ctx_scope_assignments")
      .insert({
        scope_id: scopeId,
        entity_type: "context_item",
        entity_id: item.id,
      });
    if (assignErr) throw assignErr;

    return item;
  },

  // ─── Update item metadata ─────────────────────────────────────────
  async updateItem(
    itemId: string,
    updates: Partial<ContextItemFormData>,
  ): Promise<ContextItem> {
    const { data, error } = await supabase
      .from("ctx_context_items")
      .update(updates)
      .eq("id", itemId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ─── Update status (optimistic-friendly) ──────────────────────────
  async updateStatus(
    itemId: string,
    status: ContextItemStatus,
    statusNote?: string,
  ): Promise<ContextItem> {
    const { data, error } = await supabase
      .from("ctx_context_items")
      .update({
        status,
        status_note: statusNote ?? null,
        status_updated_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ─── Create new value version ─────────────────────────────────────
  async createValue(
    itemId: string,
    scopeId: string,
    valueData: ContextValueFormData,
    sourceType: Database["public"]["Enums"]["context_source_type"] = "manual",
  ): Promise<ContextItemValue> {
    const { data, error } = await supabase
      .from("ctx_context_item_values")
      .insert({
        context_item_id: itemId,
        scope_id: scopeId,
        ...valueData,
        source_type: sourceType,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ─── Archive / soft delete ────────────────────────────────────────
  async archiveItem(itemId: string): Promise<void> {
    const { error } = await supabase
      .from("ctx_context_items")
      .update({ status: "archived", is_active: false })
      .eq("id", itemId);
    if (error) throw error;
  },

  // ─── Dashboard stats ──────────────────────────────────────────────
  async fetchDashboardStats(
    scopeType: ContextScopeLevel,
    scopeId: string,
  ): Promise<ContextDashboardStats> {
    if (scopeType === "scope") {
      const manifest = await this.fetchManifestByScope(scopeId);
      const active = manifest.filter((i) => i.status === "active");
      return {
        totalItems: manifest.length,
        activeVerified: active.length,
        needsAttention: manifest.filter((i) =>
          ATTENTION_STATUSES.includes(i.status as ContextItemStatus),
        ).length,
        emptyStub: manifest.filter(
          (i) => i.status === "stub" || i.status === "idea",
        ).length,
      };
    }

    const parentIds = await resolveParentScopeIdsForContextQuery(
      scopeType,
      scopeId,
    );
    const itemIds = await collectContextItemIdsForScopes(parentIds);
    if (itemIds.length === 0) {
      return {
        totalItems: 0,
        activeVerified: 0,
        needsAttention: 0,
        emptyStub: 0,
      };
    }

    const { data, error } = await supabase
      .from("ctx_context_items")
      .select("id, status, is_active")
      .in("id", itemIds)
      .eq("is_active", true);
    if (error) throw error;

    const items = data ?? [];
    return {
      totalItems: items.length,
      activeVerified: items.filter((i) => i.status === "active").length,
      needsAttention: items.filter((i) =>
        ATTENTION_STATUSES.includes(i.status as ContextItemStatus),
      ).length,
      emptyStub: items.filter((i) => i.status === "stub" || i.status === "idea")
        .length,
    };
  },

  // ─── Category health breakdown ────────────────────────────────────
  async fetchCategoryHealth(
    scopeType: ContextScopeLevel,
    scopeId: string,
  ): Promise<ContextCategoryHealth[]> {
    let items: { category: string | null; status: string }[];

    if (scopeType === "scope") {
      const manifest = await this.fetchManifestByScope(scopeId);
      items = manifest.map((m) => ({ category: m.category, status: m.status }));
    } else {
      const parentIds = await resolveParentScopeIdsForContextQuery(
        scopeType,
        scopeId,
      );
      const itemIds = await collectContextItemIdsForScopes(parentIds);
      if (itemIds.length === 0) {
        items = [];
      } else {
        const { data, error } = await supabase
          .from("ctx_context_items")
          .select("category, status")
          .in("id", itemIds)
          .eq("is_active", true);
        if (error) throw error;
        items = data ?? [];
      }
    }

    const categoryMap = new Map<string, ContextCategoryHealth>();

    for (const item of items) {
      const cat = item.category || "Uncategorized";
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, {
          category: cat,
          total: 0,
          active: 0,
          partial: 0,
          stub: 0,
          needsAttention: 0,
        });
      }
      const h = categoryMap.get(cat)!;
      h.total++;
      if (item.status === "active") h.active++;
      if (item.status === "partial") h.partial++;
      if (item.status === "stub" || item.status === "idea") h.stub++;
      if (ATTENTION_STATUSES.includes(item.status as ContextItemStatus))
        h.needsAttention++;
    }

    return Array.from(categoryMap.values()).sort((a, b) => b.total - a.total);
  },

  // ─── Attention queue ─────────────────────────────────────────────
  async fetchAttentionQueue(
    scopeType: ContextScopeLevel,
    scopeId: string,
  ): Promise<ContextItemManifest[]> {
    let mapped: ContextItemManifest[];

    if (scopeType === "scope") {
      const all = await this.fetchManifestByScope(scopeId);
      mapped = all
        .filter((i) =>
          ATTENTION_STATUSES.includes(i.status as ContextItemStatus),
        )
        .slice(0, 20);
    } else {
      const parentIds = await resolveParentScopeIdsForContextQuery(
        scopeType,
        scopeId,
      );
      const itemIds = await collectContextItemIdsForScopes(parentIds);
      if (itemIds.length === 0) {
        mapped = [];
      } else {
        const { data, error } = await supabase
          .from("ctx_context_items")
          .select("*")
          .in("id", itemIds)
          .in("status", [...ATTENTION_STATUSES])
          .limit(20);
        if (error) throw error;
        const rows = data ?? [];
        mapped = await loadManifestForItemIds(rows.map((r) => r.id));
      }
    }

    const priorityOrder: Record<string, number> = {
      stale: 1,
      needs_review: 2,
      ai_enriched: 3,
      needs_update: 4,
      partial: 5,
    };

    return mapped.sort((a, b) => {
      const pa = priorityOrder[a.status] ?? 99;
      const pb = priorityOrder[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      return (a.value_last_updated ?? "").localeCompare(
        b.value_last_updated ?? "",
      );
    });
  },

  // ─── Recent access log ────────────────────────────────────────────
  async fetchRecentAccessLog(
    _scopeType: ContextScopeLevel,
    _scopeId: string,
    limit = 10,
  ): Promise<ContextAccessLogEntry[]> {
    const { data, error } = await supabase
      .from("ctx_context_access_log")
      .select("*")
      .order("accessed_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },

  // ─── Access summary per item ──────────────────────────────────────
  async fetchAccessSummary(
    itemId: string,
  ): Promise<ContextAccessSummary | null> {
    const { data, error } = await supabase
      .from("ctx_context_access_log")
      .select("id, was_useful, accessed_at")
      .eq("context_item_id", itemId);
    if (error) throw error;
    if (!data || data.length === 0) return null;

    const useful = data.filter((d) => d.was_useful === true).length;
    const total = data.length;
    return {
      context_item_id: itemId,
      total_fetches: total,
      last_fetched: data[0]?.accessed_at ?? null,
      useful_rate: total > 0 ? useful / total : null,
    };
  },

  // ─── Templates ────────────────────────────────────────────────────
  async fetchTemplates(): Promise<ContextTemplate[]> {
    const { data, error } = await supabase
      .from("ctx_templates")
      .select("*")
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async fetchTemplatesByCategory(category: string): Promise<ContextTemplate[]> {
    const { data, error } = await supabase
      .from("ctx_templates")
      .select("*")
      .eq("category", category)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  /** @deprecated Prefer `fetchTemplatesByCategory` — alias for industry/grouping UIs */
  async fetchTemplatesByIndustry(
    industryCategory: string,
  ): Promise<ContextTemplate[]> {
    return this.fetchTemplatesByCategory(industryCategory);
  },

  async applyTemplate(
    _scopeType: ContextScopeLevel,
    _scopeId: string,
    _templateId: string,
    _existingKeys: Set<string>,
  ): Promise<{ created: number; skipped: number }> {
    throw new Error(
      "applyTemplate: not yet implemented for new template schema (ctx_templates).",
    );
  },

  async fetchExistingKeys(
    scopeType: ContextScopeLevel,
    scopeId: string,
  ): Promise<Set<string>> {
    if (scopeType === "scope") {
      return this.fetchExistingKeysByScope(scopeId);
    }

    const parentIds = await resolveParentScopeIdsForContextQuery(
      scopeType,
      scopeId,
    );
    const itemIds = await collectContextItemIdsForScopes(parentIds);
    if (itemIds.length === 0) return new Set();

    const { data, error } = await supabase
      .from("ctx_context_items")
      .select("key")
      .in("id", itemIds);
    if (error) throw error;
    return new Set((data ?? []).map((d) => d.key));
  },

  async fetchExistingKeysByScope(scopeId: string): Promise<Set<string>> {
    const itemIds = await collectContextItemIdsForScopes([scopeId]);
    if (itemIds.length === 0) return new Set();

    const { data, error } = await supabase
      .from("ctx_context_items")
      .select("key")
      .in("id", itemIds);
    if (error) throw error;
    return new Set((data ?? []).map((d) => d.key));
  },

  async duplicateItem(itemId: string): Promise<ContextItem> {
    const original = await this.fetchItem(itemId);
    const {
      id,
      created_at,
      updated_at,
      status_updated_at,
      current_text_value: _cv,
      value_last_updated: _vl,
      char_count: _cc,
      data_point_count: _dc,
      has_nested_objects: _ho,
      json_keys: _jk,
      ...rest
    } = original;

    const { data, error } = await supabase
      .from("ctx_context_items")
      .insert({
        ...rest,
        key: `${rest.key}_copy`,
        display_name: `${rest.display_name} (Copy)`,
        status: "stub" as const,
      })
      .select()
      .single();
    if (error) throw error;

    const { data: links, error: lErr } = await supabase
      .from("ctx_scope_assignments")
      .select("scope_id")
      .eq("entity_type", "context_item")
      .eq("entity_id", itemId);
    if (lErr) throw lErr;
    if (links && links.length > 0) {
      const { error: insErr } = await supabase
        .from("ctx_scope_assignments")
        .insert(
          links.map((l) => ({
            scope_id: l.scope_id,
            entity_type: "context_item",
            entity_id: data.id,
          })),
        );
      if (insErr) throw insErr;
    }

    return data;
  },

  async fetchAccessVolume(
    scopeType: ContextScopeLevel,
    scopeId: string,
    days = 30,
  ): Promise<{ date: string; count: number }[]> {
    void scopeType;
    void scopeId;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data, error } = await supabase
      .from("ctx_context_access_log")
      .select("accessed_at")
      .gte("accessed_at", since)
      .order("accessed_at", { ascending: true });
    if (error) throw error;

    const buckets = new Map<string, number>();
    for (const row of data ?? []) {
      const day = row.accessed_at.slice(0, 10);
      buckets.set(day, (buckets.get(day) ?? 0) + 1);
    }
    return Array.from(buckets.entries()).map(([date, count]) => ({
      date,
      count,
    }));
  },

  async fetchItemUsageRankings(
    scopeType: ContextScopeLevel,
    scopeId: string,
  ): Promise<(ContextItemManifest & ContextAccessSummary)[]> {
    const [items, logs] = await Promise.all([
      this.fetchManifest(scopeType, scopeId),
      supabase
        .from("ctx_context_access_log")
        .select("context_item_id, was_useful, accessed_at")
        .then(({ data, error }) => {
          if (error) throw error;
          return data ?? [];
        }),
    ]);

    const accessMap = new Map<
      string,
      { total: number; useful: number; last: string | null }
    >();
    for (const log of logs) {
      const entry = accessMap.get(log.context_item_id) ?? {
        total: 0,
        useful: 0,
        last: null,
      };
      entry.total++;
      if (log.was_useful) entry.useful++;
      if (!entry.last || log.accessed_at > entry.last)
        entry.last = log.accessed_at;
      accessMap.set(log.context_item_id, entry);
    }

    return items.map((item) => {
      const access = accessMap.get(item.id);
      return {
        ...item,
        context_item_id: item.id,
        total_fetches: access?.total ?? 0,
        last_fetched: access?.last ?? null,
        useful_rate: access
          ? access.total > 0
            ? access.useful / access.total
            : null
          : null,
      };
    });
  },
};

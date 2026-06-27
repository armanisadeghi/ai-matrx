"use client";

import { supabase } from "@/utils/supabase/client";
import { contextDb } from "@/utils/supabase/contextDb";
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
} from "../types";
import { ATTENTION_STATUSES } from "../constants";

type CtxContextItemsInsert =
  Database["context"]["Tables"]["context_items"]["Insert"];
type CtxScopeTypesInsert =
  Database["context"]["Tables"]["scope_types"]["Insert"];

export const contextService = {
  // ─── Manifest: items for a scope instance (with current values) ────
  // Gets all context items defined for this scope's type, with current
  // values for the given scope instance merged in.
  async fetchManifest(scopeId: string): Promise<ContextItemManifest[]> {
    const { data: scope, error: scopeErr } = await contextDb(supabase)
      .from("scopes")
      .select("scope_type_id")
      .eq("id", scopeId)
      .single();
    if (scopeErr) throw scopeErr;

    const { data: items, error: itemsErr } = await contextDb(supabase)
      .from("context_items")
      .select("*")
      .eq("scope_type_id", scope.scope_type_id)
      .eq("is_active", true)
      .order("category", { ascending: true, nullsFirst: true })
      .order("display_name", { ascending: true });
    if (itemsErr) throw itemsErr;

    if (!items || items.length === 0) return [];

    const itemIds = items.map((i) => i.id);
    const { data: values, error: valuesErr } = await contextDb(supabase)
      .from("context_item_values")
      .select("context_item_id, value_text, created_at")
      .eq("scope_id", scopeId)
      .eq("is_current", true)
      .in("context_item_id", itemIds);
    if (valuesErr) throw valuesErr;

    const valueMap = new Map((values ?? []).map((v) => [v.context_item_id, v]));

    return items.map((item) => ({
      ...item,
      current_text_value: valueMap.get(item.id)?.value_text ?? null,
      value_last_updated: valueMap.get(item.id)?.created_at ?? null,
    }));
  },

  // ─── Manifest: all items defined for a scope type (no scope values) ─
  async fetchManifestByScopeType(
    scopeTypeId: string,
  ): Promise<ContextItemManifest[]> {
    const { data, error } = await contextDb(supabase)
      .from("context_items")
      .select("*")
      .eq("scope_type_id", scopeTypeId)
      .eq("is_active", true)
      .order("category", { ascending: true, nullsFirst: true })
      .order("display_name", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((item) => ({
      ...item,
      current_text_value: null,
      value_last_updated: null,
    }));
  },

  // ─── Full item detail ─────────────────────────────────────────────
  async fetchItem(itemId: string): Promise<ContextItem> {
    const { data, error } = await contextDb(supabase)
      .from("context_items")
      .select("*")
      .eq("id", itemId)
      .single();
    if (error) throw error;
    return data as ContextItem;
  },

  // ─── Current value for an item in a specific scope ────────────────
  async fetchCurrentValue(
    itemId: string,
    scopeId: string,
  ): Promise<ContextItemValue | null> {
    const { data, error } = await contextDb(supabase)
      .from("context_item_values")
      .select("*")
      .eq("context_item_id", itemId)
      .eq("scope_id", scopeId)
      .eq("is_current", true)
      .maybeSingle();
    if (error) throw error;
    return data as ContextItemValue | null;
  },

  // ─── Version history for an item in a specific scope ─────────────
  async fetchVersionHistory(
    itemId: string,
    scopeId: string,
  ): Promise<ContextItemValue[]> {
    const { data, error } = await contextDb(supabase)
      .from("context_item_values")
      .select("*")
      .eq("context_item_id", itemId)
      .eq("scope_id", scopeId)
      .order("version", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ContextItemValue[];
  },

  // ─── Create item (defines a field on a scope type) ────────────────
  async createItem(
    scopeTypeId: string,
    formData: Omit<ContextItemFormData, "scope_type_id">,
  ): Promise<ContextItem> {
    const insertPayload: CtxContextItemsInsert = {
      ...formData,
      scope_type_id: scopeTypeId,
    };
    const { data, error } = await contextDb(supabase)
      .from("context_items")
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as ContextItem;
  },

  // ─── Update item metadata ─────────────────────────────────────────
  async updateItem(
    itemId: string,
    updates: Partial<ContextItemFormData>,
  ): Promise<ContextItem> {
    const { data, error } = await contextDb(supabase)
      .from("context_items")
      .update(updates)
      .eq("id", itemId)
      .select()
      .single();
    if (error) throw error;
    return data as ContextItem;
  },

  // ─── Update status (optimistic-friendly) ──────────────────────────
  async updateStatus(
    itemId: string,
    status: ContextItemStatus,
    statusNote?: string,
  ): Promise<ContextItem> {
    const { data, error } = await contextDb(supabase)
      .from("context_items")
      .update({
        status,
        status_note: statusNote ?? null,
        status_updated_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .select()
      .single();
    if (error) throw error;
    return data as ContextItem;
  },

  // ─── Create new value version for a scope instance ────────────────
  async createValue(
    itemId: string,
    scopeId: string,
    valueData: ContextValueFormData,
    sourceType: Database["public"]["Enums"]["context_source_type"] = "manual",
  ): Promise<ContextItemValue> {
    const { data, error } = await contextDb(supabase)
      .from("context_item_values")
      .insert({
        context_item_id: itemId,
        scope_id: scopeId,
        ...valueData,
        source_type: sourceType,
      })
      .select()
      .single();
    if (error) throw error;
    return data as unknown as ContextItemValue;
  },

  // ─── Archive / soft delete ────────────────────────────────────────
  async archiveItem(itemId: string): Promise<void> {
    const { error } = await contextDb(supabase)
      .from("context_items")
      .update({ status: "archived", is_active: false })
      .eq("id", itemId);
    if (error) throw error;
  },

  // ─── Dashboard stats for a scope instance ─────────────────────────
  // emptyStub = items with no value entered yet for this scope
  async fetchDashboardStats(scopeId: string): Promise<ContextDashboardStats> {
    const manifest = await this.fetchManifest(scopeId);
    return {
      totalItems: manifest.length,
      activeVerified: manifest.filter((i) => i.status === "active").length,
      needsAttention: manifest.filter((i) =>
        ATTENTION_STATUSES.includes(i.status as ContextItemStatus),
      ).length,
      emptyStub: manifest.filter((i) => !i.current_text_value).length,
    };
  },

  // ─── Category health breakdown for a scope type ───────────────────
  async fetchCategoryHealth(
    scopeTypeId: string,
  ): Promise<ContextCategoryHealth[]> {
    const { data, error } = await contextDb(supabase)
      .from("context_items")
      .select("category, status")
      .eq("scope_type_id", scopeTypeId)
      .eq("is_active", true);
    if (error) throw error;

    const categoryMap = new Map<string, ContextCategoryHealth>();
    for (const item of data ?? []) {
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

  // ─── Attention queue for a scope instance ─────────────────────────
  // Items with attention-needing statuses, sorted by urgency then age.
  async fetchAttentionQueue(
    scopeId: string,
    limit = 20,
  ): Promise<ContextItemManifest[]> {
    const manifest = await this.fetchManifest(scopeId);

    const priorityOrder: Record<string, number> = {
      stale: 1,
      needs_review: 2,
      ai_enriched: 3,
      needs_update: 4,
      partial: 5,
    };

    return manifest
      .filter((i) => ATTENTION_STATUSES.includes(i.status as ContextItemStatus))
      .sort((a, b) => {
        const pa = priorityOrder[a.status] ?? 99;
        const pb = priorityOrder[b.status] ?? 99;
        if (pa !== pb) return pa - pb;
        return (a.value_last_updated ?? "").localeCompare(
          b.value_last_updated ?? "",
        );
      })
      .slice(0, limit);
  },

  // ─── Recent access log ────────────────────────────────────────────
  async fetchRecentAccessLog(limit = 10): Promise<ContextAccessLogEntry[]> {
    const { data, error } = await contextDb(supabase)
      .from("context_access_log")
      .select("*")
      .order("accessed_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as ContextAccessLogEntry[];
  },

  // ─── Access summary per item ──────────────────────────────────────
  async fetchAccessSummary(
    itemId: string,
  ): Promise<ContextAccessSummary | null> {
    const { data, error } = await contextDb(supabase)
      .from("context_access_log")
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
    const { data, error } = await contextDb(supabase)
      .from("templates")
      .select("*")
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ContextTemplate[];
  },

  async fetchTemplatesByCategory(category: string): Promise<ContextTemplate[]> {
    const { data, error } = await contextDb(supabase)
      .from("templates")
      .select("*")
      .eq("category", category)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ContextTemplate[];
  },

  // ─── Apply template ───────────────────────────────────────────────
  // Bootstraps an org by:
  //   1. Creating ctx_scope_types rows from the template's scope type definitions
  //   2. Creating ctx_context_items rows for each new scope type
  // The user then adds actual scopes (instances) and their values.
  async applyTemplate(
    templateId: string,
    orgId: string,
  ): Promise<{ createdScopeTypes: number; createdItems: number }> {
    // Step 1: get template scope types
    const { data: templateScopeTypes, error: tErr } = await contextDb(supabase)
      .from("template_scope_types")
      .select("*")
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true });
    if (tErr) throw tErr;
    if (!templateScopeTypes || templateScopeTypes.length === 0) {
      return { createdScopeTypes: 0, createdItems: 0 };
    }

    let totalItems = 0;

    for (const tst of templateScopeTypes) {
      // Step 2: create a real scope type for the org
      const scopeTypePayload: CtxScopeTypesInsert = {
        organization_id: orgId,
        label_singular: tst.label_singular,
        label_plural: tst.label_plural,
        description: tst.description,
        icon: tst.icon,
        sort_order: tst.sort_order,
        parent_type_id: null, // hierarchy wiring done separately if needed
      };
      const { data: newScopeType, error: stErr } = await contextDb(supabase)
        .from("scope_types")
        .insert(scopeTypePayload)
        .select("id")
        .single();
      if (stErr) throw stErr;

      // Step 3: get template context items for this scope type
      const { data: templateItems, error: tiErr } = await contextDb(supabase)
        .from("template_context_items")
        .select("*")
        .eq("template_scope_type_id", tst.id)
        .order("sort_order", { ascending: true });
      if (tiErr) throw tiErr;

      if (!templateItems || templateItems.length === 0) continue;

      // Step 4: create context items for the new scope type
      const itemRows: CtxContextItemsInsert[] = templateItems.map((ti) => ({
        scope_type_id: newScopeType.id,
        key: ti.key,
        display_name: ti.display_name,
        description: ti.description,
        value_type: ti.value_type,
        status: "stub" as const,
      }));

      const { error: itemsErr } = await contextDb(supabase)
        .from("context_items")
        .insert(itemRows);
      if (itemsErr) throw itemsErr;

      totalItems += itemRows.length;
    }

    return {
      createdScopeTypes: templateScopeTypes.length,
      createdItems: totalItems,
    };
  },

  // ─── Existing keys for a scope type (dedup before create) ─────────
  async fetchExistingKeys(scopeTypeId: string): Promise<Set<string>> {
    const { data, error } = await contextDb(supabase)
      .from("context_items")
      .select("key")
      .eq("scope_type_id", scopeTypeId);
    if (error) throw error;
    return new Set((data ?? []).map((d) => d.key));
  },

  // ─── Duplicate item ───────────────────────────────────────────────
  async duplicateItem(itemId: string): Promise<ContextItem> {
    const original = await this.fetchItem(itemId);
    const {
      id: _id,
      created_at: _ca,
      updated_at: _ua,
      status_updated_at: _sua,
      current_text_value: _cv,
      value_last_updated: _vl,
      ...rest
    } = original;

    const { data, error } = await contextDb(supabase)
      .from("context_items")
      .insert({
        ...rest,
        key: `${rest.key}_copy`,
        display_name: `${rest.display_name} (Copy)`,
        status: "stub" as const,
      })
      .select()
      .single();
    if (error) throw error;
    return data as ContextItem;
  },

  // ─── Analytics: fetch access volume over time ─────────────────────
  async fetchAccessVolume(
    days = 30,
  ): Promise<{ date: string; count: number }[]> {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data, error } = await contextDb(supabase)
      .from("context_access_log")
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

  // ─── Analytics: item usage rankings for a scope instance ──────────
  async fetchItemUsageRankings(
    scopeId: string,
  ): Promise<(ContextItemManifest & ContextAccessSummary)[]> {
    const [items, logs] = await Promise.all([
      this.fetchManifest(scopeId),
      contextDb(supabase)
        .from("context_access_log")
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

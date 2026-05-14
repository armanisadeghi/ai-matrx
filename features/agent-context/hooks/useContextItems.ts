"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/utils/supabase/client";
import { contextService } from "../service/contextService";
import type { Database } from "@/types/database.types";
import type {
  ContextItemManifest,
  ContextItem,
  ContextItemValue,
  ContextItemFormData,
  ContextValueFormData,
  ContextItemStatus,
  ContextScopeLevel,
  ContextDashboardStats,
  ContextCategoryHealth,
  ContextTemplate,
  ContextAccessSummary,
} from "../types";

type ContextSourceType = Database["public"]["Enums"]["context_source_type"];

const KEYS = {
  manifest: (scope: string, id: string) =>
    ["context-manifest", scope, id] as const,
  item: (id: string) => ["context-item", id] as const,
  value: (id: string) => ["context-value", id] as const,
  history: (id: string) => ["context-history", id] as const,
  stats: (scope: string, id: string) => ["context-stats", scope, id] as const,
  health: (scope: string, id: string) => ["context-health", scope, id] as const,
  attention: (scope: string, id: string) =>
    ["context-attention", scope, id] as const,
  accessLog: (scope: string, id: string) =>
    ["context-access-log", scope, id] as const,
  accessSummary: (id: string) => ["context-access-summary", id] as const,
  templates: () => ["context-templates"] as const,
  templatesByIndustry: (cat: string) => ["context-templates", cat] as const,
  accessVolume: (scope: string, id: string) =>
    ["context-access-volume", scope, id] as const,
  usageRankings: (scope: string, id: string) =>
    ["context-usage-rankings", scope, id] as const,
};

// ─── Manifest (item list) ──────────────────────────────────────────

export function useContextManifest(
  scopeType: ContextScopeLevel,
  scopeId: string,
) {
  return useQuery({
    queryKey: KEYS.manifest(scopeType, scopeId),
    queryFn: () => contextService.fetchManifest(scopeType, scopeId),
    enabled: !!scopeId,
  });
}

// ─── Single item ───────────────────────────────────────────────────

export function useContextItem(itemId: string) {
  return useQuery({
    queryKey: KEYS.item(itemId),
    queryFn: () => contextService.fetchItem(itemId),
    enabled: !!itemId,
  });
}

// ─── Current value ─────────────────────────────────────────────────

export function useContextItemValue(itemId: string) {
  return useQuery({
    queryKey: KEYS.value(itemId),
    queryFn: () => contextService.fetchCurrentValue(itemId),
    enabled: !!itemId,
  });
}

// ─── Version history ───────────────────────────────────────────────

export function useContextVersionHistory(itemId: string) {
  return useQuery({
    queryKey: KEYS.history(itemId),
    queryFn: () => contextService.fetchVersionHistory(itemId),
    enabled: !!itemId,
  });
}

// ─── Dashboard stats ───────────────────────────────────────────────

export function useContextDashboardStats(
  scopeType: ContextScopeLevel,
  scopeId: string,
) {
  return useQuery({
    queryKey: KEYS.stats(scopeType, scopeId),
    queryFn: () => contextService.fetchDashboardStats(scopeType, scopeId),
    enabled: !!scopeId,
  });
}

// ─── Category health ───────────────────────────────────────────────

export function useContextCategoryHealth(
  scopeType: ContextScopeLevel,
  scopeId: string,
) {
  return useQuery({
    queryKey: KEYS.health(scopeType, scopeId),
    queryFn: () => contextService.fetchCategoryHealth(scopeType, scopeId),
    enabled: !!scopeId,
  });
}

// ─── Attention queue ───────────────────────────────────────────────

export function useContextAttentionQueue(
  scopeType: ContextScopeLevel,
  scopeId: string,
) {
  return useQuery({
    queryKey: KEYS.attention(scopeType, scopeId),
    queryFn: () => contextService.fetchAttentionQueue(scopeType, scopeId),
    enabled: !!scopeId,
  });
}

// ─── Access summary for item ───────────────────────────────────────

export function useContextAccessSummary(itemId: string) {
  return useQuery({
    queryKey: KEYS.accessSummary(itemId),
    queryFn: () => contextService.fetchAccessSummary(itemId),
    enabled: !!itemId,
  });
}

// ─── Templates ─────────────────────────────────────────────────────

export function useContextTemplates() {
  return useQuery({
    queryKey: KEYS.templates(),
    queryFn: () => contextService.fetchTemplates(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useContextTemplatesByIndustry(industryCategory: string) {
  return useQuery({
    queryKey: KEYS.templatesByIndustry(industryCategory),
    queryFn: () => contextService.fetchTemplatesByIndustry(industryCategory),
    enabled: !!industryCategory,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Analytics ─────────────────────────────────────────────────────

export function useContextAccessVolume(
  scopeType: ContextScopeLevel,
  scopeId: string,
  days = 30,
) {
  return useQuery({
    queryKey: KEYS.accessVolume(scopeType, scopeId),
    queryFn: () => contextService.fetchAccessVolume(scopeType, scopeId, days),
    enabled: !!scopeId,
  });
}

export function useContextUsageRankings(
  scopeType: ContextScopeLevel,
  scopeId: string,
) {
  return useQuery({
    queryKey: KEYS.usageRankings(scopeType, scopeId),
    queryFn: () => contextService.fetchItemUsageRankings(scopeType, scopeId),
    enabled: !!scopeId,
  });
}

// ─── Mutations ─────────────────────────────────────────────────────

export function useCreateContextItem(
  scopeType: ContextScopeLevel,
  scopeId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: ContextItemFormData) =>
      contextService.createItem(scopeType, scopeId, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.manifest(scopeType, scopeId),
      });
      queryClient.invalidateQueries({
        queryKey: KEYS.stats(scopeType, scopeId),
      });
      toast.success("Context item created");
    },
    onError: (err: Error) => {
      toast.error("Failed to create item", { description: err.message });
    },
  });
}

export function useUpdateContextItem(
  scopeType: ContextScopeLevel,
  scopeId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      updates,
    }: {
      itemId: string;
      updates: Partial<ContextItemFormData>;
    }) => contextService.updateItem(itemId, updates),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: KEYS.manifest(scopeType, scopeId),
      });
      queryClient.invalidateQueries({ queryKey: KEYS.item(data.id) });
      toast.success("Item updated");
    },
    onError: (err: Error) => {
      toast.error("Failed to update item", { description: err.message });
    },
  });
}

export function useUpdateContextStatus(
  scopeType: ContextScopeLevel,
  scopeId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      status,
      statusNote,
    }: {
      itemId: string;
      status: ContextItemStatus;
      statusNote?: string;
    }) => contextService.updateStatus(itemId, status, statusNote),
    onMutate: async ({ itemId, status }) => {
      await queryClient.cancelQueries({
        queryKey: KEYS.manifest(scopeType, scopeId),
      });
      const previous = queryClient.getQueryData<ContextItemManifest[]>(
        KEYS.manifest(scopeType, scopeId),
      );
      if (previous) {
        queryClient.setQueryData(
          KEYS.manifest(scopeType, scopeId),
          previous.map((item) =>
            item.id === itemId ? { ...item, status } : item,
          ),
        );
      }
      return { previous };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          KEYS.manifest(scopeType, scopeId),
          context.previous,
        );
      }
      toast.error("Failed to update status", { description: err.message });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: KEYS.manifest(scopeType, scopeId),
      });
      queryClient.invalidateQueries({ queryKey: KEYS.item(data.id) });
      queryClient.invalidateQueries({
        queryKey: KEYS.stats(scopeType, scopeId),
      });
      queryClient.invalidateQueries({
        queryKey: KEYS.attention(scopeType, scopeId),
      });
      toast.success(`Status updated to ${data.status}`);
    },
  });
}

export function useCreateContextValue(
  scopeType: ContextScopeLevel,
  scopeId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      valueData,
      sourceType,
    }: {
      itemId: string;
      valueData: ContextValueFormData;
      sourceType?: ContextSourceType;
    }) => {
      const { data: current } = await supabase
        .from("ctx_context_item_values")
        .select("scope_id")
        .eq("context_item_id", itemId)
        .eq("is_current", true)
        .maybeSingle();

      let valueScopeId = current?.scope_id ?? null;
      if (!valueScopeId) {
        valueScopeId = await contextService.resolvePrimaryValueScopeId(
          scopeType,
          scopeId,
        );
      }
      if (!valueScopeId) {
        throw new Error(
          "Cannot save value: no ctx_scopes target (link the item to a scope or create a value from a scope context).",
        );
      }
      return contextService.createValue(
        itemId,
        valueScopeId,
        valueData,
        sourceType,
      );
    },
    onSuccess: (_data, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: KEYS.value(itemId) });
      queryClient.invalidateQueries({ queryKey: KEYS.history(itemId) });
      queryClient.invalidateQueries({ queryKey: KEYS.item(itemId) });
      queryClient.invalidateQueries({
        queryKey: KEYS.manifest(scopeType, scopeId),
      });
      toast.success("Value saved");
    },
    onError: (err: Error) => {
      toast.error("Failed to save value", { description: err.message });
    },
  });
}

export function useArchiveContextItem(
  scopeType: ContextScopeLevel,
  scopeId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => contextService.archiveItem(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.manifest(scopeType, scopeId),
      });
      queryClient.invalidateQueries({
        queryKey: KEYS.stats(scopeType, scopeId),
      });
      toast.success("Item archived");
    },
    onError: (err: Error) => {
      toast.error("Failed to archive item", { description: err.message });
    },
  });
}

export function useDuplicateContextItem(
  scopeType: ContextScopeLevel,
  scopeId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => contextService.duplicateItem(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.manifest(scopeType, scopeId),
      });
      toast.success("Item duplicated");
    },
    onError: (err: Error) => {
      toast.error("Failed to duplicate item", { description: err.message });
    },
  });
}

export function useApplyTemplate(
  scopeType: ContextScopeLevel,
  scopeId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templates: ContextTemplate[]) => {
      const templateId = templates[0]?.id;
      if (!templateId) {
        throw new Error("No template selected.");
      }
      const existingKeys = await contextService.fetchExistingKeys(
        scopeType,
        scopeId,
      );
      return contextService.applyTemplate(
        scopeType,
        scopeId,
        templateId,
        existingKeys,
      );
    },
    onSuccess: ({ created, skipped }) => {
      queryClient.invalidateQueries({
        queryKey: KEYS.manifest(scopeType, scopeId),
      });
      queryClient.invalidateQueries({
        queryKey: KEYS.stats(scopeType, scopeId),
      });
      const msg =
        skipped > 0
          ? `${created} items created. ${skipped} already existed and were skipped.`
          : `${created} items created. Start filling them in!`;
      toast.success("Template applied", { description: msg });
    },
    onError: (err: Error) => {
      toast.error("Failed to apply template", { description: err.message });
    },
  });
}

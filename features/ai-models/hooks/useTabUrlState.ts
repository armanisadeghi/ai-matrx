"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export type AiModelFilters = {
  provider?: string;
  is_deprecated?: boolean;
  is_primary?: boolean;
  is_premium?: boolean;
  api_class?: string;
  model_class?: string;
  context_window_min?: number;
  context_window_max?: number;
  max_tokens_min?: number;
  max_tokens_max?: number;
};

export type TabState = {
  id: string;
  label: string;
  q: string;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  perPage: number;
  filters: AiModelFilters;
};

/** Default table filters — active models only (deprecated hidden). */
export const DEFAULT_AI_MODEL_FILTERS: AiModelFilters = {
  is_deprecated: false,
};

export function isDeprecatedFilterNonDefault(filters: AiModelFilters): boolean {
  return (
    (filters.is_deprecated ?? null) !==
    (DEFAULT_AI_MODEL_FILTERS.is_deprecated ?? null)
  );
}

const DEFAULT_TAB: TabState = {
  id: "all",
  label: "All Models",
  q: "",
  sort: "common_name",
  dir: "asc",
  page: 1,
  perPage: 25,
  filters: DEFAULT_AI_MODEL_FILTERS,
};

function parseBoolean(val: string | null): boolean | undefined {
  if (val === "true") return true;
  if (val === "false") return false;
  return undefined;
}

function parseDeprecatedFilterParam(raw: string | null): boolean | undefined {
  if (raw === null) return DEFAULT_AI_MODEL_FILTERS.is_deprecated;
  if (raw === "all") return undefined;
  return parseBoolean(raw);
}

function serializeDeprecatedFilterParam(
  params: URLSearchParams,
  tabId: string,
  value: boolean | undefined,
) {
  const key = `${tabId}.is_deprecated`;
  if (value === DEFAULT_AI_MODEL_FILTERS.is_deprecated) {
    params.delete(key);
    return;
  }
  if (value === undefined) {
    params.set(key, "all");
    return;
  }
  params.set(key, String(value));
}

function serializeTabState(params: URLSearchParams, tab: TabState) {
  const p = tab.id;
  if (tab.q) params.set(`${p}.q`, tab.q);
  else params.delete(`${p}.q`);
  if (tab.sort !== DEFAULT_TAB.sort) params.set(`${p}.sort`, tab.sort);
  else params.delete(`${p}.sort`);
  if (tab.dir !== DEFAULT_TAB.dir) params.set(`${p}.dir`, tab.dir);
  else params.delete(`${p}.dir`);
  if (tab.page !== 1) params.set(`${p}.page`, String(tab.page));
  else params.delete(`${p}.page`);
  if (tab.perPage !== 25) params.set(`${p}.perPage`, String(tab.perPage));
  else params.delete(`${p}.perPage`);
  if (tab.label !== labelForId(tab.id)) params.set(`${p}.label`, tab.label);
  else params.delete(`${p}.label`);
  // Filters
  if (tab.filters.provider) params.set(`${p}.provider`, tab.filters.provider);
  else params.delete(`${p}.provider`);
  serializeDeprecatedFilterParam(params, p, tab.filters.is_deprecated);
  if (tab.filters.is_primary !== undefined)
    params.set(`${p}.is_primary`, String(tab.filters.is_primary));
  else params.delete(`${p}.is_primary`);
  if (tab.filters.is_premium !== undefined)
    params.set(`${p}.is_premium`, String(tab.filters.is_premium));
  else params.delete(`${p}.is_premium`);
  if (tab.filters.api_class)
    params.set(`${p}.api_class`, tab.filters.api_class);
  else params.delete(`${p}.api_class`);
  if (tab.filters.model_class)
    params.set(`${p}.model_class`, tab.filters.model_class);
  else params.delete(`${p}.model_class`);
  if (tab.filters.context_window_min !== undefined)
    params.set(`${p}.cw_min`, String(tab.filters.context_window_min));
  else params.delete(`${p}.cw_min`);
  if (tab.filters.context_window_max !== undefined)
    params.set(`${p}.cw_max`, String(tab.filters.context_window_max));
  else params.delete(`${p}.cw_max`);
  if (tab.filters.max_tokens_min !== undefined)
    params.set(`${p}.mt_min`, String(tab.filters.max_tokens_min));
  else params.delete(`${p}.mt_min`);
  if (tab.filters.max_tokens_max !== undefined)
    params.set(`${p}.mt_max`, String(tab.filters.max_tokens_max));
  else params.delete(`${p}.mt_max`);
}

function deserializeTabState(params: URLSearchParams, id: string): TabState {
  const p = id;
  return {
    id,
    label: params.get(`${p}.label`) ?? labelForId(id),
    q: params.get(`${p}.q`) ?? "",
    sort: params.get(`${p}.sort`) ?? DEFAULT_TAB.sort,
    dir: (params.get(`${p}.dir`) as "asc" | "desc") ?? DEFAULT_TAB.dir,
    page: parseInt(params.get(`${p}.page`) ?? "1", 10),
    perPage: parseInt(params.get(`${p}.perPage`) ?? "25", 10),
    filters: {
      provider: params.get(`${p}.provider`) ?? undefined,
      is_deprecated: parseDeprecatedFilterParam(
        params.get(`${p}.is_deprecated`),
      ),
      is_primary: parseBoolean(params.get(`${p}.is_primary`)),
      is_premium: parseBoolean(params.get(`${p}.is_premium`)),
      api_class: params.get(`${p}.api_class`) ?? undefined,
      model_class: params.get(`${p}.model_class`) ?? undefined,
      context_window_min: params.get(`${p}.cw_min`)
        ? parseInt(params.get(`${p}.cw_min`)!, 10)
        : undefined,
      context_window_max: params.get(`${p}.cw_max`)
        ? parseInt(params.get(`${p}.cw_max`)!, 10)
        : undefined,
      max_tokens_min: params.get(`${p}.mt_min`)
        ? parseInt(params.get(`${p}.mt_min`)!, 10)
        : undefined,
      max_tokens_max: params.get(`${p}.mt_max`)
        ? parseInt(params.get(`${p}.mt_max`)!, 10)
        : undefined,
    },
  };
}

function labelForId(id: string): string {
  if (id === "all") return "All Models";
  // Convert slug to title case, e.g. "my-tab" → "My Tab"
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function generateTabId(existing: string[]): string {
  let n = existing.length + 1;
  while (existing.includes(`tab-${n}`)) n++;
  return `tab-${n}`;
}

export function useTabUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabIds: string[] = useMemo(() => {
    const raw = searchParams.get("tabs");
    if (!raw) return ["all"];
    const ids = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return ids.length > 0 ? ids : ["all"];
  }, [searchParams]);

  const activeTabId: string = useMemo(() => {
    const active = searchParams.get("active");
    return active && tabIds.includes(active) ? active : tabIds[0];
  }, [searchParams, tabIds]);

  const tabStates: TabState[] = useMemo(
    () => tabIds.map((id) => deserializeTabState(searchParams, id)),
    [searchParams, tabIds],
  );

  const activeTab: TabState = useMemo(
    () => tabStates.find((t) => t.id === activeTabId) ?? tabStates[0],
    [tabStates, activeTabId],
  );

  const push = useCallback(
    (updater: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      updater(params);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setActiveTab = useCallback(
    (id: string) => {
      push((params) => params.set("active", id));
    },
    [push],
  );

  const openTab = useCallback(
    (initialFilters?: Partial<AiModelFilters>, label?: string) => {
      const newId = generateTabId(tabIds);
      push((params) => {
        const newIds = [...tabIds, newId];
        params.set("tabs", newIds.join(","));
        params.set("active", newId);
        if (label) params.set(`${newId}.label`, label);
        if (initialFilters?.provider)
          params.set(`${newId}.provider`, initialFilters.provider);
        if (initialFilters?.is_deprecated !== undefined) {
          serializeDeprecatedFilterParam(
            params,
            newId,
            initialFilters.is_deprecated,
          );
        }
        if (initialFilters?.is_primary !== undefined)
          params.set(`${newId}.is_primary`, String(initialFilters.is_primary));
        if (initialFilters?.is_premium !== undefined)
          params.set(`${newId}.is_premium`, String(initialFilters.is_premium));
        if (initialFilters?.api_class)
          params.set(`${newId}.api_class`, initialFilters.api_class);
        if (initialFilters?.model_class)
          params.set(`${newId}.model_class`, initialFilters.model_class);
        if (initialFilters?.context_window_min !== undefined)
          params.set(
            `${newId}.cw_min`,
            String(initialFilters.context_window_min),
          );
        if (initialFilters?.context_window_max !== undefined)
          params.set(
            `${newId}.cw_max`,
            String(initialFilters.context_window_max),
          );
        if (initialFilters?.max_tokens_min !== undefined)
          params.set(`${newId}.mt_min`, String(initialFilters.max_tokens_min));
        if (initialFilters?.max_tokens_max !== undefined)
          params.set(`${newId}.mt_max`, String(initialFilters.max_tokens_max));
      });
    },
    [push, tabIds],
  );

  const closeTab = useCallback(
    (id: string) => {
      if (tabIds.length <= 1) return;
      push((params) => {
        const newIds = tabIds.filter((t) => t !== id);
        params.set("tabs", newIds.join(","));
        // Clear all params for this tab
        Array.from(params.keys())
          .filter((k) => k.startsWith(`${id}.`))
          .forEach((k) => params.delete(k));
        // Switch active if needed
        if (activeTabId === id) {
          const idx = tabIds.indexOf(id);
          const next = newIds[Math.max(0, idx - 1)];
          params.set("active", next);
        }
      });
    },
    [push, tabIds, activeTabId],
  );

  const renameTab = useCallback(
    (id: string, label: string) => {
      push((params) => params.set(`${id}.label`, label));
    },
    [push],
  );

  const updateTabState = useCallback(
    (id: string, patch: Partial<Omit<TabState, "id">>) => {
      push((params) => {
        const current = deserializeTabState(params, id);
        const updated: TabState = { ...current, ...patch, id };
        // Merge filters if provided
        if (patch.filters) {
          updated.filters = { ...current.filters, ...patch.filters };
        }
        serializeTabState(params, updated);
      });
    },
    [push],
  );

  return {
    tabIds,
    activeTabId,
    tabStates,
    activeTab,
    setActiveTab,
    openTab,
    closeTab,
    renameTab,
    updateTabState,
  };
}

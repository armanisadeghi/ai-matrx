import type { EntityListSurfaceController } from "@/lib/entity-list/components/EntityListPage";
import type { EntityFilters, EntityListQuery } from "@/lib/entity-list/types";
import { countActiveFilters, NONE_VALUE } from "@/lib/entity-list/types";
import { makeScope } from "@/lib/list-scope/types";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import { parseAgentsHubCatalogFilters } from "@/features/agents/agents-hub-catalog-filter-contract";
import { getPeekedAgentId } from "@/features/agents/components/agent-listings/agent-peek-tracker";
import { SORT_OPTIONS } from "@/features/agents/components/agent-listings/core/types";
import {
  AGENTS_HUB_SURFACE_NAME,
  createAgentsHubScope,
} from "@/features/surfaces/manifests/agents-hub.manifest";
import type { AgentBrowseRow } from "./types";

const AGENT_BROWSE_OWNERSHIP_TABS = [
  "mine",
  "orgs",
  "shared",
  "public",
] as const;

const AGENT_SORT_VIEW = {
  "updated-desc": { sort: "updated", direction: "desc" },
  "created-desc": { sort: "created", direction: "desc" },
  "name-asc": { sort: "name", direction: "asc" },
  "name-desc": { sort: "name", direction: "desc" },
  "category-asc": { sort: "category", direction: "asc" },
} as const;

function selectFilterValues(filters: EntityFilters, key: string): string[] {
  const filter = filters[key];
  return filter?.kind === "select" ? filter.values : [];
}

function favoriteFilterValue(filters: EntityFilters): "all" | "yes" | "no" {
  const filter = filters.favorite;
  if (filter?.kind !== "boolean") return "all";
  return filter.value ? "yes" : "no";
}

function archivedFilterValue(
  archived: EntityListQuery["archived"],
): "active" | "archived" | "both" {
  return archived === "all" ? "both" : archived;
}

function facetVocabulary(
  list: EntityListSurfaceController<AgentBrowseRow>,
  key: string,
): string[] {
  return (list.facets.byKind[key] ?? [])
    .map((entry) => entry.value)
    .filter((value) => value !== NONE_VALUE);
}

export function createAgentBrowseSurfaceScope(
  list: EntityListSurfaceController<AgentBrowseRow>,
) {
  const categories = facetVocabulary(list, "category");
  const tags = facetVocabulary(list, "tag");
  const includedCategories = selectFilterValues(list.query.filters, "category");
  const includedTags = selectFilterValues(list.query.filters, "tags");
  const favoritesFilter = favoriteFilterValue(list.query.filters);
  const archivedFilter = archivedFilterValue(list.query.archived);
  const sortBy = `${list.view.sort}-${list.view.direction}`;
  const peekedAgentId = getPeekedAgentId();
  const peekedAgent = peekedAgentId
    ? list.rows.find((row) => row.id === peekedAgentId)
    : undefined;
  const ownershipTab = AGENT_BROWSE_OWNERSHIP_TABS.find(
    (tab) => tab === list.query.scope.kind,
  );
  if (!ownershipTab) {
    throw new Error(
      `Agents Hub cannot emit unsupported ownership scope ${list.query.scope.kind}.`,
    );
  }
  const hasActiveFilters =
    Boolean(list.query.search.trim()) ||
    countActiveFilters(list.query) > 0 ||
    ownershipTab !== "mine";

  return createAgentsHubScope({
    visible_agents: list.rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
    })),
    visible_agent_count: list.rows.length,
    owned_agent_count: list.counts.byKind.mine ?? 0,
    shared_agent_count: list.counts.byKind.shared ?? 0,
    shared_agents_total: list.counts.byKind.shared ?? 0,
    list_loading: list.isLoading,
    search_query: list.query.search,
    deep_search: list.query.deep,
    ownership_tab: ownershipTab,
    sort_by: sortBy,
    included_categories: includedCategories,
    included_tags: includedTags,
    favorites_filter: favoritesFilter,
    archived_filter: archivedFilter,
    favorites_first: list.view.favoritesFirst,
    has_active_filters: hasActiveFilters,
    filters: {
      ownership_tab: ownershipTab,
      sort_by: sortBy,
      search_query: list.query.search,
      deep_search: list.query.deep,
      included_categories: includedCategories,
      included_tags: includedTags,
      favorites_filter: favoritesFilter,
      archived_filter: archivedFilter,
      favorites_first: list.view.favoritesFirst,
    },
    available_categories: categories,
    available_tags: tags,
    ...(peekedAgentId ? { peeked_agent_id: peekedAgentId } : {}),
    ...(peekedAgent ? { peeked_agent_name: peekedAgent.name } : {}),
  });
}

function setSelectFilter(
  filters: EntityFilters,
  key: string,
  values: string[],
): void {
  if (values.length === 0) delete filters[key];
  else filters[key] = { kind: "select", values };
}

export function createAgentBrowseSurfaceWriteHandlers(
  list: EntityListSurfaceController<AgentBrowseRow>,
) {
  return {
    catalog_filters: (value: unknown) => {
      const parsed = parseAgentsHubCatalogFilters(value, {
        categories: facetVocabulary(list, "category"),
        tags: facetVocabulary(list, "tag"),
        ownershipTabs: AGENT_BROWSE_OWNERSHIP_TABS,
        sortOptions: SORT_OPTIONS.map((option) => option.value),
        archivedOptions: ["active", "archived", "both"] as const,
      });
      const queryPatch: Partial<EntityListQuery> = {};
      const viewPatch: Partial<ListViewPrefs> = {};
      const filters: EntityFilters = { ...list.query.filters };
      let filtersChanged = false;

      if (parsed.search_query !== undefined)
        queryPatch.search = parsed.search_query;
      if (parsed.deep_search !== undefined)
        queryPatch.deep = parsed.deep_search;
      if (parsed.ownership_tab !== undefined)
        queryPatch.scope = makeScope(parsed.ownership_tab);
      if (parsed.sort_by !== undefined)
        Object.assign(viewPatch, AGENT_SORT_VIEW[parsed.sort_by]);
      if (parsed.included_categories !== undefined) {
        setSelectFilter(filters, "category", parsed.included_categories);
        filtersChanged = true;
      }
      if (parsed.included_tags !== undefined) {
        setSelectFilter(filters, "tags", parsed.included_tags);
        filtersChanged = true;
      }
      if (parsed.favorites_filter !== undefined) {
        if (parsed.favorites_filter === "all") delete filters.favorite;
        else {
          filters.favorite = {
            kind: "boolean",
            value: parsed.favorites_filter === "yes",
          };
        }
        filtersChanged = true;
      }
      if (parsed.archived_filter !== undefined)
        queryPatch.archived =
          parsed.archived_filter === "both" ? "all" : parsed.archived_filter;
      if (parsed.favorites_first !== undefined)
        viewPatch.favoritesFirst = parsed.favorites_first;
      if (filtersChanged) queryPatch.filters = filters;

      if (Object.keys(queryPatch).length > 0) list.patchQuery(queryPatch);
      if (Object.keys(viewPatch).length > 0) list.patchView(viewPatch);
    },
  };
}

export const AGENT_BROWSE_SURFACE = {
  surfaceName: AGENTS_HUB_SURFACE_NAME,
  getScope: createAgentBrowseSurfaceScope,
  getWriteHandlers: createAgentBrowseSurfaceWriteHandlers,
};

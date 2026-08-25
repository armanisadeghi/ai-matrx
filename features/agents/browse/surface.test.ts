import type { EntityListSurfaceController } from "@/lib/entity-list/components/EntityListPage";
import type { AgentBrowseRow } from "./types";
import {
  createAgentBrowseSurfaceScope,
  createAgentBrowseSurfaceWriteHandlers,
} from "./surface";

function makeListController(): EntityListSurfaceController<AgentBrowseRow> {
  return {
    query: {
      scope: { kind: "mine" },
      search: "research",
      deep: false,
      archived: "active",
      filters: {},
      page: 1,
    },
    rows: [],
    total: 0,
    counts: { byKind: { mine: 4, shared: 2 }, narrow: {} },
    facets: {
      byKind: {
        category: [{ value: "Analysis", count: 3 }],
        tag: [{ value: "seo", count: 2 }],
      },
    },
    isLoading: false,
    isFetching: false,
    error: null,
    view: {
      sort: "updated",
      direction: "desc",
      favoritesFirst: true,
      pageSize: 25,
    },
    setScope: jest.fn(),
    setFilters: jest.fn(),
    setSearch: jest.fn(),
    setDeep: jest.fn(),
    patchQuery: jest.fn(),
    setPage: jest.fn(),
    resetFilters: jest.fn(),
    refresh: jest.fn(),
    removeRow: jest.fn(),
    patchRow: jest.fn(),
    patchView: jest.fn(),
  };
}

describe("Agents Hub canonical list surface", () => {
  it("emits the live query, view, counts, and facet vocabulary", () => {
    const scope = createAgentBrowseSurfaceScope(makeListController());

    expect(scope.search_query).toBe("research");
    expect(scope.ownership_tab).toBe("mine");
    expect(scope.sort_by).toBe("updated-desc");
    expect(scope.owned_agent_count).toBe(4);
    expect(scope.shared_agent_count).toBe(2);
    expect(scope.available_categories).toEqual(["Analysis"]);
    expect(scope.available_tags).toEqual(["seo"]);
  });

  it("applies one validated composite write through query and view setters", () => {
    const list = makeListController();
    const handlers = createAgentBrowseSurfaceWriteHandlers(list);

    handlers.catalog_filters({
      search_query: "planning",
      ownership_tab: "orgs",
      sort_by: "name-asc",
      included_categories: ["Analysis"],
      favorites_filter: "yes",
      archived_filter: "both",
      favorites_first: false,
    });

    expect(list.patchQuery).toHaveBeenCalledWith({
      search: "planning",
      scope: { kind: "orgs", organizationId: null },
      archived: "all",
      filters: {
        category: { kind: "select", values: ["Analysis"] },
        favorite: { kind: "boolean", value: true },
      },
    });
    expect(list.patchView).toHaveBeenCalledWith({
      sort: "name",
      direction: "asc",
      favoritesFirst: false,
    });
  });

  it("rejects an invented facet without changing either state channel", () => {
    const list = makeListController();
    const handlers = createAgentBrowseSurfaceWriteHandlers(list);

    expect(() =>
      handlers.catalog_filters({ included_tags: ["invented"] }),
    ).toThrow('"invented" is not a value');
    expect(list.patchQuery).not.toHaveBeenCalled();
    expect(list.patchView).not.toHaveBeenCalled();
  });
});

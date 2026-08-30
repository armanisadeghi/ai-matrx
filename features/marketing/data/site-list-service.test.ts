import type { EntityListQuery, EntityListSort } from "@/lib/entity-list/types";
import { listSites } from "./service";
import { siteListService, toSiteTableQueryState } from "./site-list-service";

jest.mock("./service", () => ({
  listSites: jest.fn(),
}));

const QUERY: EntityListQuery = {
  scope: { kind: "orgs", organizationId: null },
  search: " matrx ",
  deep: false,
  archived: "active",
  filters: {
    name: { kind: "text", value: "AI" },
    status: { kind: "select", values: ["active"] },
    visible: { kind: "boolean", value: true },
  },
  page: 3,
};

const SORT: EntityListSort = {
  sort: "domain",
  direction: "asc",
  favoritesFirst: false,
  pageSize: 25,
};

describe("site list service", () => {
  beforeEach(() => {
    jest.mocked(listSites).mockReset();
  });

  it("maps the generic query to the canonical table query without losing paging, filters, or sort", () => {
    expect(toSiteTableQueryState(QUERY, SORT)).toEqual({
      page: 3,
      pageSize: 25,
      search: " matrx ",
      anyOf: "",
      columnFilters: {
        name: { kind: "text", value: "AI" },
        status: { kind: "select", value: "active", values: ["active"] },
        visible: { kind: "boolean", value: true },
      },
      sort: { id: "domain", direction: "asc" },
    });
  });

  it("delegates pages and exact filtered counts to listSites with brand scope intact", async () => {
    const page = { rows: [], total: 12 };
    jest.mocked(listSites).mockResolvedValue(page);
    const service = siteListService("brand-7");

    await expect(service.fetchPage(QUERY, SORT)).resolves.toBe(page);
    await expect(service.fetchCounts(QUERY)).resolves.toEqual({
      byKind: { orgs: 12 },
      narrow: {},
    });

    expect(jest.mocked(listSites)).toHaveBeenNthCalledWith(
      1,
      toSiteTableQueryState(QUERY, SORT),
      undefined,
      "brand-7",
    );
    expect(jest.mocked(listSites)).toHaveBeenNthCalledWith(
      2,
      toSiteTableQueryState(
        { ...QUERY, page: 1 },
        {
          sort: "updated_at",
          direction: "desc",
          favoritesFirst: false,
          pageSize: 1,
        },
      ),
      undefined,
      "brand-7",
    );
  });

  it("does not fabricate facets from the loaded page", async () => {
    await expect(siteListService().fetchFacets(QUERY)).resolves.toEqual({
      byKind: {},
    });
    expect(listSites).not.toHaveBeenCalled();
  });
});

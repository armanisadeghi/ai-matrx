/**
 * H6b: what the hub's container groups do with their filters — the retired
 * list pages' own narrowing, record-page addresses, and the catalog's agent
 * write target now acting on the hub.
 */
import {
  catalogFiltersToGroup,
  catalogRecordHref,
  dataStoreRecordHref,
  filterCatalog,
  filterDataStores,
  libraryAdapters,
  libraryLane,
  libraryRecordHref,
  rulebookHandoff,
} from "@/features/knowledge/hub/containerGroups/groupFilters";
import { buildHubWriteHandlers } from "@/features/knowledge/hub/hubAgentSurface";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";

const label = (t: string) => ({ data_store: "Knowledge library", seo_starter_pack: "Industry starter pack", rulebook: "Rulebook" })[t] ?? t;

const item = (o: Partial<Parameters<typeof filterCatalog>[0][number]> & { name: string; entityType: string }) => ({
  description: null,
  slug: null,
  entitledVia: null,
  entitledIndustryName: null,
  ...o,
});

describe("record pages a group row opens", () => {
  it("each container's own page", () => {
    expect(dataStoreRecordHref("ds 1")).toBe("/knowledge/data-stores?store_id=ds%201");
    expect(libraryRecordHref("lib-1")).toBe("/libraries/lib-1");
    expect(catalogRecordHref("rb-1", "rulebook")).toBe("/knowledge/library-catalog?id=rb-1&type=rulebook");
  });
  it("the registry opens a data store at its record page (so the hub's container view links to it)", () => {
    expect(tryGetEntityInfo("data_store")?.hrefFor?.("ds-1")).toBe("/knowledge/data-stores?store_id=ds-1");
  });
});

describe("Data stores group", () => {
  const stores = [
    { id: "1", name: "Smith case", kind: "legal", description: null, shortCode: "SMITH" },
    { id: "2", name: "Pricing", kind: "general", description: "Price sheets", shortCode: null },
  ];
  it("narrows by name, description, kind and short code", () => {
    expect(filterDataStores(stores, { q: "smith" }).map((s) => s.id)).toEqual(["1"]);
    expect(filterDataStores(stores, { q: "sheets" }).map((s) => s.id)).toEqual(["2"]);
    expect(filterDataStores(stores, { q: "LEGAL" }).map((s) => s.id)).toEqual(["1"]);
    expect(filterDataStores(stores, {})).toHaveLength(2);
  });
});

describe("Libraries group", () => {
  it("lane defaults to mine; unknown lanes fall back", () => {
    expect(libraryLane({})).toBe("mine");
    expect(libraryLane({ lane: "public" })).toBe("public");
    expect(libraryLane({ lane: "bogus" })).toBe("mine");
  });
  it("adapters from the comma list", () => {
    expect(libraryAdapters({ adapter: "youtube, podcast_rss" })).toEqual(["youtube", "podcast_rss"]);
    expect(libraryAdapters({})).toEqual([]);
  });
  it("the Rulebook handoff offers the way back only for a real id", () => {
    expect(rulebookHandoff({})).toBeNull();
    expect(rulebookHandoff({ from: "rulebook", rulebook_id: "nope" })).toEqual({ backHref: null });
    expect(rulebookHandoff({ from: "rulebook", rulebook_id: "7d0a6f1e-1111-4222-8333-944445555666" })).toEqual({
      backHref: "/masterwork/7d0a6f1e-1111-4222-8333-944445555666/sources",
    });
  });
});

describe("Library catalog group", () => {
  const items = [
    item({ name: "Tax law", entityType: "data_store", entitledVia: "industry", entitledIndustryName: "Accounting" }),
    item({ name: "Dental pack", entityType: "seo_starter_pack", entitledVia: null }),
    item({ name: "Refund rules", entityType: "rulebook", entitledVia: "organization", slug: "refunds" }),
  ];
  it("defaults to what my organization has", () => {
    expect(filterCatalog(items, {}, label).map((i) => i.name)).toEqual(["Tax law", "Refund rules"]);
  });
  it("g.all=1 shows everything; g.type narrows; words match name, slug, industry and type label", () => {
    expect(filterCatalog(items, { all: "1" }, label)).toHaveLength(3);
    expect(filterCatalog(items, { all: "1", type: "seo_starter_pack" }, label).map((i) => i.name)).toEqual(["Dental pack"]);
    expect(filterCatalog(items, { q: "refunds" }, label).map((i) => i.name)).toEqual(["Refund rules"]);
    expect(filterCatalog(items, { q: "accounting" }, label).map((i) => i.name)).toEqual(["Tax law"]);
    expect(filterCatalog(items, { all: "1", q: "starter" }, label).map((i) => i.name)).toEqual(["Dental pack"]);
  });
  it("catalog_filters (the agent target) maps onto the group and refuses unknown keys by name", () => {
    expect(catalogFiltersToGroup({}, { search_query: "legal", entitled_only: false, type_filter: "rulebook" })).toEqual({
      q: "legal",
      all: "1",
      type: "rulebook",
    });
    expect(catalogFiltersToGroup({ q: "x", all: "1", type: "rulebook" }, '{"search_query":"","entitled_only":"true","type_filter":"all"}')).toEqual({});
    expect(() => catalogFiltersToGroup({}, { subscribe: true })).toThrow(/unknown key\(s\): subscribe/);
    expect(() => catalogFiltersToGroup({}, {})).toThrow(/needs at least one/);
    expect(() => catalogFiltersToGroup({}, { type_filter: "cars" })).toThrow(/type_filter expects one of/);
  });
  it("the hub registers catalog_filters on the Knowledge Library surface", () => {
    const applied: unknown[] = [];
    const handlers = buildHubWriteHandlers({
      setSearch: () => {},
      showAllSources: () => {},
      listedSourceIds: () => new Set(),
      openSource: () => {},
      setCatalogFilters: (v) => applied.push(v),
    });
    handlers.catalog_filters({ search_query: "legal" });
    expect(applied).toEqual([{ search_query: "legal" }]);
  });
});

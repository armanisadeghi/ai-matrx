/**
 * H6b: the Data Stores, Library catalog and Libraries LIST pages are live
 * pages at their own addresses (no page is retired into the hub — Arman,
 * 2026-09-29); the hub shows the same lists as container groups
 * (`view=group:<token>`) and the `*ToHubHref` helpers build those addresses with
 * the old filters carried over. The real route modules run; only `redirect`
 * and the heavy page bodies are doubles.
 */
const redirect = jest.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { to });
});
jest.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
jest.mock("@/features/rag/components/data-stores/DataStoresPage", () => ({ DataStoresPage: () => "DATA_STORE_RECORD" }));
jest.mock("@/features/rag/components/library-catalog/LibraryCatalogPage", () => ({
  LibraryCatalogPage: () => "CATALOG_RECORD",
}));
jest.mock("@/features/auth/components/module-landing/landings/KnowledgeLanding", () => ({
  __esModule: true,
  default: () => "LANDING",
}));
jest.mock("@/utils/supabase/sessionVerdict", () => ({
  getSessionVerdict: async () => ({ isAuthenticated: true }),
}));

import DataStoresRoute from "@/app/(core)/knowledge/data-stores/page";
import CatalogRoute from "@/app/(core)/knowledge/library-catalog/page";
import LibrariesRoute from "@/app/(core)/libraries/page";
import { DEFAULT_HUB_STATE, hubHref, hubStateFromParams } from "@/features/knowledge/hub/hubState";
import {
  HUB_DATA_STORES_HREF,
  HUB_LIBRARIES_HREF,
  HUB_LIBRARY_CATALOG_HREF,
  dataStoresToHubHref,
  libraryCatalogToHubHref,
  librariesToHubHref,
  researchTopicHubHref,
} from "@/features/knowledge/hub/legacyRoutes";

type Params = Record<string, string>;
type Route = (p: { searchParams: Promise<Params> }) => unknown;

async function stays(page: Route, search: Params): Promise<void> {
  redirect.mockClear();
  await page({ searchParams: Promise.resolve(search) });
  expect(redirect).not.toHaveBeenCalled();
}
const stateOf = (href: string) => hubStateFromParams(new URL(href, "https://x").searchParams);

describe("the group view round-trips through the address", () => {
  it("view=group:<token> with its g.* filters", () => {
    const href = hubHref({
      ...DEFAULT_HUB_STATE,
      view: { kind: "group", token: "media_source_library" },
      group: { lane: "orgs", q: "ted talks", adapter: "youtube,podcast_rss" },
    });
    const s = stateOf(href);
    expect(s.view).toEqual({ kind: "group", token: "media_source_library" });
    expect(s.group).toEqual({ lane: "orgs", q: "ted talks", adapter: "youtube,podcast_rss" });
  });
  it("group filters never leak into another view, and an unknown group falls back to Everything", () => {
    const href = hubHref({ ...DEFAULT_HUB_STATE, view: { kind: "everything" }, group: { q: "x" } });
    expect(href).toBe("/knowledge/hub");
    expect(stateOf("/knowledge/hub?view=group:nonsense&g.q=x").view).toEqual({ kind: "everything" });
    expect(stateOf("/knowledge/hub?view=group:nonsense&g.q=x").group).toEqual({});
  });
});

describe("Data Stores list → a live page; the hub's Data stores group is one helper away", () => {
  it("the list page renders at its own address and never redirects", async () => {
    await stays(DataStoresRoute as unknown as Route, { q: "smith" });
  });
  it("dataStoresToHubHref builds the group address with the words kept", () => {
    const href = dataStoresToHubHref({ q: "smith" })!;
    const s = stateOf(href);
    expect(new URL(href, "https://x").pathname).toBe("/knowledge/hub");
    expect(s.view).toEqual({ kind: "group", token: "data_store" });
    expect(s.group).toEqual({ q: "smith" });
  });
  it("a store's record page (?store_id=) and its create form (?new=1) have no hub address", async () => {
    await stays(DataStoresRoute as unknown as Route, { store_id: "ds-1" });
    await stays(DataStoresRoute as unknown as Route, { new: "1" });
    expect(dataStoresToHubHref({ store_id: "ds-1" })).toBeNull();
    expect(dataStoresToHubHref({ new: "1" })).toBeNull();
  });
  it("the shared link", () => {
    expect(stateOf(HUB_DATA_STORES_HREF).view).toEqual({ kind: "group", token: "data_store" });
  });
});

describe("Library catalog list → a live page; the hub's Library catalog group is one helper away", () => {
  it("the list page renders at its own address and never redirects", async () => {
    await stays(CatalogRoute as unknown as Route, { q: "legal", type: "rulebook", all: "1" });
  });
  it("libraryCatalogToHubHref carries type, everything and words", () => {
    const href = libraryCatalogToHubHref({ q: "legal", type: "rulebook", all: "1" })!;
    expect(href.startsWith("/knowledge/hub?")).toBe(true);
    const s = stateOf(href);
    expect(s.view).toEqual({ kind: "group", token: "library_catalog" });
    expect(s.group).toEqual({ q: "legal", type: "rulebook", all: "1" });
  });
  it("an item's record page (?id=&type=, or the old ?store_id=) stays", async () => {
    await stays(CatalogRoute as unknown as Route, { id: "rb-1", type: "rulebook" });
    await stays(CatalogRoute as unknown as Route, { store_id: "ds-1" });
    expect(libraryCatalogToHubHref({ id: "rb-1", type: "rulebook" })).toBeNull();
  });
  it("the shared link", () => {
    expect(stateOf(HUB_LIBRARY_CATALOG_HREF).view).toEqual({ kind: "group", token: "library_catalog" });
  });
});

describe("Libraries list → a live page; the hub's Libraries group is one helper away", () => {
  it("the list page renders at its own address and never redirects", async () => {
    await stays(LibrariesRoute as unknown as Route, { scope: "orgs:org-1", q: "ted" });
  });
  it("lane, words and the Acquisition console's adapter filter are kept by the helper", () => {
    const filters = JSON.stringify({ adapter: { kind: "select", values: ["youtube", "podcast_rss"] } });
    const href = librariesToHubHref({ scope: "orgs:org-1", q: "ted", filters });
    expect(href.startsWith("/knowledge/hub?")).toBe(true);
    const s = stateOf(href);
    expect(s.view).toEqual({ kind: "group", token: "media_source_library" });
    expect(s.group).toEqual({ lane: "orgs", q: "ted", adapter: "youtube,podcast_rss" });
  });
  it("the Rulebook handoff (?from=rulebook&rulebook_id=) rides along", () => {
    const s = stateOf(librariesToHubHref({ from: "rulebook", rulebook_id: "7d0a6f1e-1111-4222-8333-944445555666" }));
    expect(s.group).toEqual({ from: "rulebook", rulebook_id: "7d0a6f1e-1111-4222-8333-944445555666" });
  });
  it("the default lane (mine) and an unreadable filter bag add nothing", () => {
    expect(stateOf(librariesToHubHref({ scope: "mine", filters: "{not json" })).group).toEqual({});
    expect(stateOf(HUB_LIBRARIES_HREF).view).toEqual({ kind: "group", token: "media_source_library" });
  });
});

describe("Research sources: the topic page stays; the hub finds its pages", () => {
  it("Find in Knowledge opens the topic as a hub container, origin research", () => {
    const s = stateOf(researchTopicHubHref("t-1"));
    expect(s.view).toEqual({ kind: "container", type: "research_topic", id: "t-1" });
    expect(s.query.within).toEqual([{ type: "research_topic", id: "t-1" }]);
    expect(s.query.origin).toEqual(["research"]);
  });
});

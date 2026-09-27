/**
 * H6b: the Data Stores, Library catalog and Libraries LIST pages retire into
 * the hub's container groups (`view=group:<token>`) with their filters; each
 * one's RECORD page stays where it was (Linear: an old link keeps its filters,
 * and nothing the old page did is lost). The real route modules run; only
 * `redirect` and the heavy page bodies are doubles.
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
  librariesToHubHref,
  researchTopicHubHref,
} from "@/features/knowledge/hub/legacyRoutes";

type Params = Record<string, string>;
type Route = (p: { searchParams: Promise<Params> }) => unknown;

async function land(page: Route, search: Params): Promise<string> {
  redirect.mockClear();
  await expect(Promise.resolve().then(() => page({ searchParams: Promise.resolve(search) }))).rejects.toThrow("NEXT_REDIRECT");
  return redirect.mock.calls[0][0];
}
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
    expect(href).toBe("/knowledge");
    expect(stateOf("/knowledge?view=group:nonsense&g.q=x").view).toEqual({ kind: "everything" });
    expect(stateOf("/knowledge?view=group:nonsense&g.q=x").group).toEqual({});
  });
});

describe("Data Stores list → the hub's Data stores group", () => {
  it("the bare address lands on the group, words kept", async () => {
    const href = await land(DataStoresRoute as unknown as Route, { q: "smith" });
    const s = stateOf(href);
    expect(new URL(href, "https://x").pathname).toBe("/knowledge");
    expect(s.view).toEqual({ kind: "group", token: "data_store" });
    expect(s.group).toEqual({ q: "smith" });
  });
  it("a store's record page (?store_id=) and its create form (?new=1) stay", async () => {
    await stays(DataStoresRoute as unknown as Route, { store_id: "ds-1" });
    await stays(DataStoresRoute as unknown as Route, { new: "1" });
  });
  it("the shared link every retired pointer uses", () => {
    expect(stateOf(HUB_DATA_STORES_HREF).view).toEqual({ kind: "group", token: "data_store" });
  });
});

describe("Library catalog list → the hub's Library catalog group", () => {
  it("the bare address lands on the group with type, everything and words", async () => {
    const s = stateOf(await land(CatalogRoute as unknown as Route, { q: "legal", type: "rulebook", all: "1" }));
    expect(s.view).toEqual({ kind: "group", token: "library_catalog" });
    expect(s.group).toEqual({ q: "legal", type: "rulebook", all: "1" });
  });
  it("an item's record page (?id=&type=, or the old ?store_id=) stays", async () => {
    await stays(CatalogRoute as unknown as Route, { id: "rb-1", type: "rulebook" });
    await stays(CatalogRoute as unknown as Route, { store_id: "ds-1" });
  });
  it("the shared link", () => {
    expect(stateOf(HUB_LIBRARY_CATALOG_HREF).view).toEqual({ kind: "group", token: "library_catalog" });
  });
});

describe("Libraries list → the hub's Libraries group", () => {
  it("lane, words and the Acquisition console's adapter filter are kept", async () => {
    const filters = JSON.stringify({ adapter: { kind: "select", values: ["youtube", "podcast_rss"] } });
    const s = stateOf(await land(LibrariesRoute as unknown as Route, { scope: "orgs:org-1", q: "ted", filters }));
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

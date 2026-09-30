/**
 * H6a: no Knowledge page is retired into the hub (Arman, 2026-09-29). `/knowledge/library`
 * renders Sources, `/knowledge/search` the Search Lab, `/rag/*` is live, and the hub lives at
 * `/knowledge/hub`. `libraryToHubHref` still builds the hub's Sources view with filters carried.
 * Only `/knowledge/visualization` still redirects (to the flow animation). The real route
 * modules run; only `redirect` is a double (Next throws from it).
 */
const redirect = jest.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { to });
});
jest.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
jest.mock("@/utils/supabase/sessionVerdict", () => ({ getSessionVerdict: async () => ({ isAuthenticated: true }) }));
jest.mock("@/features/rag/components/search/RagSearchExperience", () => ({ RagSearchExperience: () => null }));
jest.mock("@/features/auth/components/module-landing/landings/KnowledgeLanding", () => ({ __esModule: true, default: () => null }));
jest.mock("@/features/sources/components/SourcesPage", () => ({ SourcesPage: () => null }));

import LibraryRoute from "@/app/(core)/knowledge/library/page";
import SearchRoute from "@/app/(core)/knowledge/search/page";
import VisualizationRoute from "@/app/(core)/knowledge/visualization/page";
import RagVisualizationRoute from "@/app/(core)/rag/visualization/page";
import { hubStateFromParams } from "@/features/knowledge/hub/hubState";
import { HUB_SOURCES_HREF, libraryToHubHref, SEARCH_LAB_ADMIN_PATH, SEARCH_LAB_PATH, searchLabHref } from "@/features/knowledge/hub/legacyRoutes";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// next.config.js copies files on require, so its redirect list is read as text.
const nextConfigText = readFileSync(join(__dirname, "..", "..", "..", "..", "next.config.js"), "utf8");

type Params = Record<string, string>;
async function land(page: (p: { searchParams: Promise<Params> }) => unknown, search: Params): Promise<string> {
  redirect.mockClear();
  await expect(Promise.resolve().then(() => page({ searchParams: Promise.resolve(search) }))).rejects.toThrow("NEXT_REDIRECT");
  return redirect.mock.calls[0][0];
}
const stateOf = (href: string) => hubStateFromParams(new URL(href, "https://x").searchParams);

describe("Sources page → a live page; the hub's Sources view is one helper away", () => {
  it("/knowledge/library renders Sources for a signed-in person and never redirects", async () => {
    redirect.mockClear();
    const tree = await (LibraryRoute as unknown as () => Promise<{ type: unknown }>)();
    expect(tree).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
  it("libraryToHubHref keeps the saved filter and the search words on /knowledge/hub", () => {
    const href = libraryToHubHref({ show: "saved", q: "invoice" });
    const s = stateOf(href);
    expect(new URL(href, "https://x").pathname).toBe("/knowledge/hub");
    expect(s.view).toEqual({ kind: "kind", key: "processed_document" });
    expect(s.query.types).toEqual(["processed_document"]);
    expect(s.query.state).toEqual(["kept"]);
    expect(s.query.text).toBe("invoice");
  });
  it("?show=all lists every capture (no saved filter)", () => {
    const s = stateOf(libraryToHubHref({ show: "all" }));
    expect(s.query.state).toBeUndefined();
    expect(s.query.types).toEqual(["processed_document"]);
  });
  it("the shared Sources link is the same view", () => {
    expect(stateOf(HUB_SOURCES_HREF).view).toEqual({ kind: "kind", key: "processed_document" });
  });
});

describe("the Search Lab is a kept, live user page (Arman, 2026-09-29)", () => {
  it("/knowledge/search renders the lab for a signed-in person — it never redirects", async () => {
    redirect.mockClear();
    const tree = await (SearchRoute as () => Promise<unknown>)();
    expect(tree).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
  it("the hub links to it with the search and the single data store carried over", () => {
    expect(searchLabHref({})).toBe("/knowledge/search");
    const u = new URL(searchLabHref({ text: " refund policy ", within: [{ type: "data_store", id: "ds-1" }] }), "https://x");
    expect(u.pathname).toBe(SEARCH_LAB_PATH);
    expect(Object.fromEntries(u.searchParams)).toEqual({ q: "refund policy", store_id: "ds-1" });
    // two stores (or a non-store scope) have no single ?store_id= — the search words still travel
    expect(new URL(searchLabHref({ text: "x", within: [{ type: "tag", id: "t" }] }), "https://x").search).toBe("?q=x");
  });
  it("the admin lab keeps its own address", () => {
    expect(SEARCH_LAB_ADMIN_PATH).toBe("/administration/knowledge/search-lab");
  });
});

describe("the graph demo and the /rag aliases", () => {
  it("/knowledge/visualization lands on the flow animation", async () => {
    redirect.mockClear();
    expect(() => (VisualizationRoute as () => void)()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/knowledge/flow");
    redirect.mockClear();
    expect(() => (RagVisualizationRoute as () => void)()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/knowledge/flow");
  });
  it("/rag/* is live: next.config.js carries no /rag redirect, and the route folder exists", () => {
    expect(nextConfigText).not.toMatch(/source:\s*["']\/rag(\/:path\*)?["']/);
    expect(existsSync(join(__dirname, "..", "..", "..", "..", "app", "(core)", "rag", "page.tsx"))).toBe(true);
    expect(existsSync(join(__dirname, "..", "..", "..", "..", "app", "(core)", "rag", "library", "page.tsx"))).toBe(true);
  });
});

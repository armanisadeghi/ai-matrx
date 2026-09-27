/**
 * H6a: every retired Knowledge address lands in the hub with its filters
 * (Linear: an old link keeps its filters). The real route modules run; only
 * `redirect` is a double (Next throws from it).
 */
const redirect = jest.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { to });
});
jest.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

import LibraryRoute from "@/app/(core)/knowledge/library/page";
import SearchRoute from "@/app/(core)/knowledge/search/page";
import VisualizationRoute from "@/app/(core)/knowledge/visualization/page";
import { hubStateFromParams } from "@/features/knowledge/hub/hubState";
import { HUB_SOURCES_HREF, libraryToHubHref, searchLabToHref } from "@/features/knowledge/hub/legacyRoutes";

import { readFileSync } from "node:fs";
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

describe("retired Sources page → the hub's Sources view", () => {
  it("?show=saved keeps the saved filter and the search words", async () => {
    const href = await land(LibraryRoute as never, { show: "saved", q: "invoice" });
    const s = stateOf(href);
    expect(new URL(href, "https://x").pathname).toBe("/knowledge");
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

describe("retired Search Lab", () => {
  it("?q= and ?store_id= become the hub's search within that data store", async () => {
    const s = stateOf(await land(SearchRoute as never, { q: "refund policy", store_id: "ds-1" }));
    expect(s.query.text).toBe("refund policy");
    expect(s.query.within).toEqual([{ type: "data_store", id: "ds-1" }]);
  });
  it("developer tabs land in the admin Search Lab with every param", () => {
    const href = searchLabToHref({ tab: "diagnostics", q: "x", store_id: "ds-1" });
    const u = new URL(href, "https://x");
    expect(u.pathname).toBe("/administration/knowledge/search-lab");
    expect(Object.fromEntries(u.searchParams)).toEqual({ tab: "diagnostics", q: "x", store_id: "ds-1" });
  });
});

describe("the graph demo and the /rag aliases", () => {
  it("/knowledge/visualization lands on the hub", async () => {
    redirect.mockClear();
    expect(() => (VisualizationRoute as () => void)()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/knowledge");
  });
  it("every /rag/* path redirects to its /knowledge/* twin (query kept by Next)", () => {
    expect(nextConfigText).toContain('{ source: "/rag", destination: "/knowledge", permanent: true }');
    expect(nextConfigText).toContain('{ source: "/rag/:path*", destination: "/knowledge/:path*", permanent: true }');
  });
});

jest.mock("@/components/favorites/usePinned", () => ({ usePinned: () => ({}), favoriteId: () => "" }));
jest.mock("@/components/favorites/PinButton", () => ({ PinButton: () => null }));
jest.mock("@/features/access-gate/hooks/useAccessStates", () => ({ useAccessStates: () => ({}) }));
jest.mock("@/features/board/tools/search-items", () => ({ searchItemsAsPerson: () => null }));
import { openableRecentAgents } from "../bodies/AgentsWidget";
import { START_WIDGET_CATALOG } from "../catalog";

it("lists only recent agents this person can open, and tells same-named ones apart", () => {
  const rows = [
    { entity_id: "a1", title: "news.coarse_relevance", subtitle: "Feeds" },
    { entity_id: "a2", title: "news.coarse_relevance", subtitle: "Digest" },
    { entity_id: "a3", title: "Org Chart Test — Content Team Lead", subtitle: null },
    { entity_id: "a4", title: "Writer", subtitle: null },
  ];
  const status = (id: string) => ({ a1: "ok", a2: "ok", a3: "denied", a4: "ok" })[id];
  const out = openableRecentAgents(rows, status);
  expect(out.map((r) => r.entity_id)).toEqual(["a1", "a2", "a4"]);
  expect(out.map((r) => r.tell)).toEqual(["Feeds", "Digest", null]);
});

it("files Favorites and Recent under Work in the Add picker", () => {
  const section = (k: string) => START_WIDGET_CATALOG.find((s) => s.key === k)?.section;
  expect(section("favorites")).toBe("work");
  expect(section("recent")).toBe("work");
});

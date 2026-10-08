/**
 * /applets asks for the same list at different moments (page, counts, facets, probe). One settled read
 * answers them all for a short while; a write on the page forgets it (bug desk 2026-10-08: 3 identical
 * app.definition reads within 2 s of one page load).
 */
import { DEFAULT_ENTITY_LIST_QUERY, type EntityListQuery } from "@/lib/entity-list/types";
import { createAppletListService, forgetAppletListReads, type AppletListRow } from "./service";

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

const row = (id: string): AppletListRow =>
  ({ id, name: id, is_mine: true, published_to_web: false, archived: false, organization_id: "o", updated_at: "2026-10-08T00:00:00Z", state: { label: "Draft" } }) as unknown as AppletListRow;

const query: EntityListQuery = { ...DEFAULT_ENTITY_LIST_QUERY, scope: { ...DEFAULT_ENTITY_LIST_QUERY.scope, kind: "all" }, archived: "active" };

describe("createAppletListService — one read per page load", () => {
  it("answers page, counts and a later ask from one settled read, and reads again after a write", async () => {
    const load = jest.fn(async () => [row("a"), row("b")]);
    const service = createAppletListService(load);
    await service.fetchPage(query, { sort: "updated_at", direction: "desc", favoritesFirst: false, pageSize: 50 } as never);
    await new Promise((r) => setTimeout(r, 20)); // a later tick, as the shell's counts read arrives
    await service.fetchCounts(query);
    expect(load).toHaveBeenCalledTimes(1);
    forgetAppletListReads();
    await service.fetchCounts(query);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

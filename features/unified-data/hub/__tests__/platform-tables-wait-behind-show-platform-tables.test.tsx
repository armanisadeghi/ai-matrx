// CHAIR-DOORS-2 (v6 lane 4 KINDS-GLUE, need N-C8) — the tables the app keeps for agents' outputs
// stay out of the data home, ⌘K and the pickers; "Show platform tables" in the data home's Filters panel
// is the one way in. The doors leave them out by default (scripts/campaign-tests/
// chairdoors2_f_app_tables_wait_behind_one_switch.sql proves that from the member's seat); this
// proves the client asks for them only when the switch is on, naming both arguments so PostgREST
// picks the (uuid, boolean) overload, and that the panel draws the switch and flips it.
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { RecordsDataSource } from "@ai-matrx/records";

import { dataHome, dataHomeSearch, dataHomeTables } from "../doors";
import { createDataHomeCorpus } from "@/features/unified-data/home/dataHomeCorpus";
import { EntityFilterPanel } from "@/lib/entity-list/components/EntityFilterPanel";
import { makeScope } from "@/lib/list-scope/types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Rpc = { fn: string; args: Record<string, unknown> };

function source(answer: unknown, calls: Rpc[]): RecordsDataSource {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: answer, error: null };
    },
  } as unknown as RecordsDataSource;
}

describe("the doors ask for platform tables only when told to", () => {
  it("data_home_tables: default sends what it always sent; the switch names both arguments", async () => {
    const calls: Rpc[] = [];
    await dataHomeTables(source([], calls), null);
    await dataHomeTables(source([], calls), "org-1");
    await dataHomeTables(source([], calls), null, { includePlatformTables: true });
    expect(calls.map((c) => c.args)).toEqual([
      {},
      { p_organization_id: "org-1" },
      { p_organization_id: null, p_include_app_tables: true },
    ]);
  });

  it("data_home and its search carry the switch, and only when on", async () => {
    const calls: Rpc[] = [];
    const home = { tables: [], items: [], changed_by: [] };
    await dataHome(source(home, calls), null);
    await dataHome(source(home, calls), null, { includePlatformTables: true });
    await dataHomeSearch(source({ ...home, search: "flashcards" }, calls), "flashcards", null, { includePlatformTables: true });
    expect(calls.map((c) => c.args)).toEqual([
      {},
      { p_include_app_tables: true },
      { p_search: "flashcards", p_include_app_tables: true },
    ]);
  });

  it("the data home's corpus reads with the switch it was made with", async () => {
    const asked: Array<boolean | undefined> = [];
    const fakeHome = (async (_ds: RecordsDataSource, _org: string | null, opts?: { includePlatformTables?: boolean }) => {
      asked.push(opts?.includePlatformTables);
      return { ok: false, error: { message: "stop here", code: null, hint: null, details: null } };
    }) as unknown as typeof dataHome;
    const client = {} as never;
    await createDataHomeCorpus(client, source(null, []), { dataHome: fakeHome }).load().catch(() => undefined);
    await createDataHomeCorpus(client, source(null, []), { dataHome: fakeHome, includePlatformTables: true })
      .load()
      .catch(() => undefined);
    expect(asked).toEqual([false, true]);
  });
});

describe("the Filters panel draws a page's switch", () => {
  it("shows 'Show platform tables' under its heading and hands the flip to the page", () => {
    const flips: boolean[] = [];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <EntityFilterPanel
          query={{ scope: makeScope("all"), orgId: null, search: "", deep: false, archived: "active", filters: {}, page: 1 }}
          facets={{} as never}
          columns={[]}
          hasFavorites={false}
          hasArchived={false}
          panelSwitches={[{ id: "platform_tables", section: "Platform tables", label: "Show platform tables", on: false, onChange: (on) => flips.push(on) }]}
          sort="updated"
          direction="desc"
          favoritesFirst={false}
          onPatchQuery={() => {}}
          onSortChange={() => {}}
          onFavoritesFirstChange={() => {}}
          onResetFilters={() => {}}
        />,
      );
    });
    // The panel's trigger exists because a switch is declared (a panel with nothing is absent).
    const trigger = document.body.querySelector("button");
    expect(trigger).not.toBeNull();
    act(() => trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const box = document.body.querySelector('[role="checkbox"][aria-label="Show platform tables"]');
    expect(box).not.toBeNull();
    expect(document.body.textContent).toContain("Platform tables");
    act(() => box!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(flips).toEqual([true]);
    act(() => root.unmount());
    host.remove();
  });
});

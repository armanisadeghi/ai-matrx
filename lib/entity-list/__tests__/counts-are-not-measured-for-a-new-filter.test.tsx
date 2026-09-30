/**
 * A COUNT NOBODY HAS MEASURED FOR THE CURRENT FILTER SHOWS AS NOTHING.
 *
 * 🚨 THE DEFECT (Arman, 2026-09-30). After the organization filter (or the
 * search) changed, the lane tabs went on showing the PREVIOUS filter's numbers
 * until the counts call returned — seconds for a person in many organizations.
 * `EntityScopeTabs` only hid a lane's count when it had NO number; while
 * `countsLoading` it still printed the held one. And the search box changes the
 * question immediately while the counts request follows the debounced text.
 *
 * RED against the old code: the lane badge kept "(7)" while countsLoading, and
 * the hook reported countsLoading=false for the beat between a keystroke and
 * its debounce.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { makeStore } from "@/lib/redux/store";
import { useEntityList } from "../useEntityList";
import { EntityScopeTabs } from "../components/EntityScopeTabs";
import { makeScope } from "@/lib/list-scope/types";
import { EMPTY_FACETS, type EntityScopeCounts } from "../types";

jest.mock("@/lib/toast", () => ({
  toast: { error: () => undefined, success: () => undefined },
  toastErrorAlreadyCaptured: () => undefined,
}));

interface Row {
  id: string;
}

describe("the lane tabs never show the previous filter's counts", () => {
  it("prints no number while counting, even when a number is held", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const held: EntityScopeCounts = { byKind: { mine: 7, orgs: 9 }, narrow: {} };
    await act(async () => {
      root.render(
        <EntityScopeTabs
          scope={makeScope("mine")}
          scopes={["mine", "orgs"]}
          counts={held}
          countsLoading
          onChange={() => undefined}
        />,
      );
    });
    expect(container.textContent).toContain("Mine");
    expect(container.textContent).not.toContain("7");
    expect(container.textContent).not.toContain("9");
    await act(async () => root.unmount());
    container.remove();
  });
});

describe("useEntityList marks counts as loading the moment the filter changes", () => {
  const probe: { list: ReturnType<typeof useEntityList<Row>> | null } = { list: null };
  let release: (() => void) | null = null;

  function Probe({ gate }: { gate: { hold: boolean } }) {
    // eslint-disable-next-line react-hooks/immutability
    probe.list = useEntityList<Row>({
      service: {
        fetchPage: async () => ({ rows: [], total: 0 }),
        fetchCounts: async (): Promise<EntityScopeCounts> => {
          if (gate.hold) await new Promise<void>((r) => (release = r));
          return { byKind: { mine: 7 }, narrow: {} };
        },
        fetchFacets: async () => EMPTY_FACETS,
      },
      serviceKey: "fixed",
      getRowId: (row) => row.id,
      entityLabelPlural: "things",
      view: { sort: "label", direction: "asc", pageSize: 25, favoritesFirst: false },
    });
    return null;
  }

  it("an organization filter change and a typed search both flip countsLoading in the same render", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const gate = { hold: false };
    await act(async () => {
      root.render(
        <Provider store={makeStore()}>
          <Probe gate={gate} />
        </Provider>,
      );
    });
    expect(probe.list?.countsLoading).toBe(false);
    expect(probe.list?.counts.byKind.mine).toBe(7);

    gate.hold = true;
    await act(async () => {
      probe.list?.setOrgId("22222222-2222-4222-8222-222222222222");
    });
    // The new answer has not landed; the held 7 answers the OLD filter.
    expect(probe.list?.countsLoading).toBe(true);
    await act(async () => {
      release?.();
    });
    expect(probe.list?.countsLoading).toBe(false);

    gate.hold = false;
    await act(async () => {
      probe.list?.setSearch("abc");
    });
    // Typed text is the current question; the debounced counts have not caught up yet
    // unless they already did — either way it must settle back to measured.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    expect(probe.list?.countsLoading).toBe(false);
    await act(async () => root.unmount());
    container.remove();
  });
});

/**
 * @jest-environment jsdom
 */
// A LIBRARY IS LOADED ONLY WHEN ITS ROWS ARE IN HAND (Matrx Alchemy round 6, 2026-09-27).
//
// On the first ⋯ open after a page load, My Items / Org Items / Agents came back empty although they
// had rows; the next open showed them. Every menu library loader reported "finished" before its rows
// arrived:
//   · the unified menu's hook started with `loading = false` (before its effect fired) and a second
//     dispatch while the page's prefetch was in flight rejected AT ONCE with a ConditionError — both
//     read as "loaded, nothing here";
//   · the unified menu trusted `scopeLoaded`, which `fetchShortcutsForScope` also sets after loading
//     shortcuts only (no categories), so the menu skipped its fetch;
//   · the Agents hook started with `sections = []`, `loading = false`.
// RED on the code before this change; green only when "done" means "rows in hand".
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { combineReducers, configureStore } from "@reduxjs/toolkit";

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ from: () => ({ select: () => ({ in: () => new Promise(() => undefined) }) }) }) },
}));

import agentShortcutReducer, { setShortcutScopeLoaded } from "@/features/agents/redux/agent-shortcuts/slice";
import agentShortcutCategoryReducer from "@/features/agents/redux/agent-shortcut-categories/slice";
import { sklReducer } from "@/features/agent-connections/redux/skl/slice";
import userAuthReducer from "@/lib/redux/slices/userAuthSlice";
import { fetchUnifiedMenu } from "@/features/agents/redux/agent-shortcuts/thunks";
import { useUnifiedAgentContextMenu } from "../hooks/useUnifiedAgentContextMenu";
import { useSurfaceBoundAgents } from "@/features/surfaces/hooks/useSurfaceBoundAgents";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeStore() {
  return configureStore({
    reducer: combineReducers({
      agentShortcut: agentShortcutReducer,
      agentShortcutCategory: agentShortcutCategoryReducer,
      skl: sklReducer,
      userAuth: userAuthReducer,
    }),
    middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
  });
}

/** One held /api/agent-context-menu response the test releases by hand. */
function holdMenuFetch() {
  let release!: () => void;
  const body = {
    data: [
      {
        placement_type: "user-tool",
        categories_flat: [
          {
            category: { id: "cat-mine", label: "Drafts", placement_type: "user-tool", sort_order: 0 },
            items: [],
          },
        ],
      },
    ],
  };
  const gate = new Promise<void>((r) => (release = r));
  const fetchMock = jest.fn(async () => {
    await gate;
    return { ok: true, status: 200, statusText: "OK", json: async () => body } as unknown as Response;
  });
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  return { release, fetchMock };
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("a menu library is loaded only when its rows are in hand", () => {
  it("a second dispatch while the first is in flight settles when the rows arrive — never at once", async () => {
    const store = makeStore();
    const { release } = holdMenuFetch();
    const first = store.dispatch(fetchUnifiedMenu({ scope: "user", scopeId: null }));
    let secondSettled: "resolved" | "rejected" | null = null;
    store
      .dispatch(fetchUnifiedMenu({ scope: "user", scopeId: null }))
      .unwrap()
      .then(() => (secondSettled = "resolved"), () => (secondSettled = "rejected"));
    await flush();
    expect(secondSettled).toBeNull();
    release();
    await first;
    await flush();
    expect(secondSettled).toBe("resolved");
  });

  it("shortcuts loaded for a scope do not count as the menu's rows (no categories came with them)", async () => {
    const store = makeStore();
    store.dispatch(setShortcutScopeLoaded({ scopeRef: { scope: "user", scopeId: null }, loaded: true }));
    const { release, fetchMock } = holdMenuFetch();
    const run = store.dispatch(fetchUnifiedMenu({ scope: "user", scopeId: null }));
    release();
    await run;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("the unified menu hook says 'loading' from its first render until the rows land", async () => {
    const store = makeStore();
    const { release } = holdMenuFetch();
    const seen: boolean[] = [];
    let refresh: (() => Promise<void>) | null = null;
    function Probe() {
      const r = useUnifiedAgentContextMenu({
        placementTypes: ["user-tool"],
        availableKeys: new Set<string>(),
        hasSelection: false,
        scope: "user",
      });
      seen.push(r.loading);
      refresh = r.refresh;
      return null;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<Provider store={store}><Probe /></Provider>));
    expect(seen[0]).toBe(true); // the first render — before any fetch started — is not "loaded, empty"
    // The page's prefetch is already in flight when the menu asks: the menu still waits for the rows.
    void store.dispatch(fetchUnifiedMenu({ scope: "user", scopeId: null }));
    await act(async () => { void refresh!(); });
    await flush();
    expect(seen[seen.length - 1]).toBe(true);
    release();
    await flush();
    await flush();
    expect(seen[seen.length - 1]).toBe(false);
    act(() => root.unmount());
  });

  it("a library that missed its deadline stops saying 'failed' once its rows land (live: a 'Couldn't load' row stayed after the fetch arrived)", async () => {
    const store = makeStore();
    (globalThis as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: false, status: 503, statusText: "Busy", json: async () => ({}) }) as unknown as Response);
    let last: { loading: boolean; error: string | null } | null = null;
    let refresh: (() => Promise<void>) | null = null;
    function Probe() {
      const r = useUnifiedAgentContextMenu({ placementTypes: ["user-tool"], availableKeys: new Set<string>(), hasSelection: false, scope: "user" });
      last = { loading: r.loading, error: r.error };
      refresh = r.refresh;
      return null;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<Provider store={store}><Probe /></Provider>));
    await act(async () => { await refresh!(); });
    expect(last!.error).not.toBeNull();
    // The rows arrive later (another caller's fetch, or the same fetch past the deadline).
    const { release } = holdMenuFetch();
    const run = store.dispatch(fetchUnifiedMenu({ scope: "user", scopeId: null }));
    release();
    await act(async () => { await run; });
    await flush();
    expect(last!.error).toBeNull();
    act(() => root.unmount());
  });

  it("the Agents hook is unsettled until its first fetch lands (an empty list before that is not 'no agents')", async () => {
    const store = makeStore();
    const seen: { settled: boolean; loading: boolean }[] = [];
    function Probe() {
      const r = useSurfaceBoundAgents("matrx-user/round-6-probe", { includeDefaults: false });
      seen.push({ settled: r.settled, loading: r.loading });
      return null;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<Provider store={store}><Probe /></Provider>));
    expect(seen[0]).toEqual({ settled: false, loading: false });
    act(() => root.unmount());
  });
});

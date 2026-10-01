/**
 * A RUN THAT LIVES IN THE TAB IS NEVER LOST IN SILENCE (V5-A.2, 2026-09-30).
 *
 * Verifier walk: on a deck page, "Add more cards" was started and the page
 * was reloaded mid-run. After the reload there was no progress, no notice and
 * the cards never came — the run (a browser-orchestrated fan-out + save) died
 * with the tab and nothing had recorded that it existed.
 *
 * SUT: the real `useTabBoundRun` over the real `wizardDraftSlice`, persisted
 * through its real sync policy bytes (`serialize` -> `deserialize` -> the real
 * rehydrate action). The reload is performed the way it happens: the run is
 * mid-flight, `beforeunload` fires, the bytes are persisted, the tree is thrown
 * away, and a NEW store rehydrates from those bytes in a page with no live run.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore, type Store } from "@reduxjs/toolkit";

import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { wizardDraftPolicy, type WizardDraftState } from "@/lib/redux/slices/wizardDraftSlice";
import { buildRehydrateAction } from "@/lib/sync/engine/rehydrate";
import {
  RUN_STALE_MS,
  forgetRunsInThisPageForTest,
  runMarkerState,
  useTabBoundRun,
  type TabBoundRun,
} from "@/lib/wizard-draft/useTabBoundRun";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Req = { count: number; material: string };
const restore = (r: Record<string, unknown>): Req | null =>
  typeof r.count === "number" && typeof r.material === "string"
    ? { count: r.count, material: r.material }
    : null;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let latest: TabBoundRun<Req> | null = null;

function Probe() {
  latest = useTabBoundRun<Req>("deck-1", restore);
  return null;
}

function makeStore(): Store {
  return configureStore({ reducer: createSlimRootReducer() });
}

function mount(store: Store) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <Provider store={store}>
        <Probe />
      </Provider>,
    );
  });
}

function unmount() {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  latest = null;
}

function persisted(store: Store): unknown {
  const state = store.getState() as { wizardDraft: WizardDraftState };
  return wizardDraftPolicy.config.serialize!(state.wizardDraft);
}

function reloadedStore(bytes: unknown): Store {
  const store = makeStore();
  act(() => {
    store.dispatch(
      buildRehydrateAction("wizardDraft", wizardDraftPolicy.config.deserialize!(bytes), {
        fromRehydrate: true,
      }),
    );
  });
  return store;
}

afterEach(() => {
  unmount();
  forgetRunsInThisPageForTest();
  jest.useRealTimers();
});

test("a reload mid-run comes back as a stopped run with its exact request", async () => {
  const store = makeStore();
  mount(store);
  expect(latest!.stopped).toBeNull();

  // Start a run that never finishes in this page (the tab is about to reload).
  act(() => {
    void latest!.track({ count: 3, material: "chapter 4" }, () => new Promise<never>(() => {}));
  });
  // The page that runs it never calls its own run "stopped".
  expect(latest!.stopped).toBeNull();

  act(() => {
    window.dispatchEvent(new Event("beforeunload"));
  });
  const bytes = persisted(store);
  unmount();
  forgetRunsInThisPageForTest(); // a fresh page: nothing is running in it

  mount(reloadedStore(bytes));
  expect(latest!.stopped?.request).toEqual({ count: 3, material: "chapter 4" });
  expect(latest!.runningElsewhere).toBe(false);

  // Dismissing (or redoing) clears it for good.
  act(() => latest!.dismiss());
  expect(latest!.stopped).toBeNull();
});

test("a run the closing page aborts is still reported after the reload", async () => {
  // Live walk, 2026-09-30: the unloading page aborts its streams, the run
  // rejects, and the error path cleared the marker before the pagehide flush —
  // the reload then showed nothing at all.
  const store = makeStore();
  mount(store);
  let abort: (e: Error) => void = () => {};
  const running = latest!.track(
    { count: 3, material: "chapter 4" },
    () => new Promise<never>((_, reject) => (abort = reject)),
  );
  act(() => {
    window.dispatchEvent(new Event("beforeunload"));
  });
  await act(async () => {
    abort(new Error("The user aborted a request."));
    await running.catch(() => undefined);
  });
  const bytes = persisted(store);
  unmount();
  forgetRunsInThisPageForTest();
  mount(reloadedStore(bytes));
  expect(latest!.stopped?.request).toEqual({ count: 3, material: "chapter 4" });
});

test("a run that finishes, or fails in place, leaves nothing behind", async () => {
  const store = makeStore();
  mount(store);
  await act(async () => {
    await latest!.track({ count: 2, material: "notes" }, async () => "done");
  });
  await act(async () => {
    await latest!
      .track({ count: 2, material: "notes" }, async () => {
        throw new Error("shown in place");
      })
      .catch(() => undefined);
  });
  const bytes = persisted(store);
  unmount();
  forgetRunsInThisPageForTest();
  mount(reloadedStore(bytes));
  expect(latest!.stopped).toBeNull();
});

test("another tab's live run is never called stopped; a silent (crashed) one is", () => {
  const now = 1_000_000;
  const marker = { runId: "r", startedAt: now - 5_000, beatAt: now - 1_000, request: {} };
  expect(runMarkerState(marker, now, false)).toBe("elsewhere");
  expect(runMarkerState(marker, now + RUN_STALE_MS + 1, false)).toBe("stopped");
  expect(runMarkerState({ ...marker, closedAt: now }, now, false)).toBe("stopped");
  expect(runMarkerState(marker, now, true)).toBe("none");
  expect(runMarkerState(null, now, false)).toBe("none");
});

// A SAVE IS NEVER REPEATED BLIND (2026-09-30): a reload in the instant after
// the deck / cards were saved but before the run was marked finished offered
// "Try again", which saved them a second time.
test("a run that stopped after sending its save is reported whileSaving, never as a blind redo", async () => {
  const store = makeStore();
  mount(store);
  await act(async () => {
    void latest!.track({ count: 3, material: "chapter 4" }, async (_settle, saving) => {
      await saving();
      return new Promise<never>(() => {}); // the save is in flight when the page closes
    });
    await Promise.resolve();
  });
  act(() => {
    window.dispatchEvent(new Event("beforeunload"));
  });
  const bytes = persisted(store);
  unmount();
  forgetRunsInThisPageForTest();
  mount(reloadedStore(bytes));
  expect(latest!.stopped?.whileSaving).toBe(true);
});

test("a run whose save resolves while the page is closing leaves nothing to redo", async () => {
  const store = makeStore();
  mount(store);
  await act(async () => {
    await latest!.track({ count: 3, material: "chapter 4" }, async () => {
      // The reload starts; the save's answer arrives a moment later.
      window.dispatchEvent(new Event("beforeunload"));
      return "saved";
    });
  });
  const bytes = persisted(store);
  unmount();
  forgetRunsInThisPageForTest();
  mount(reloadedStore(bytes));
  expect(latest!.stopped).toBeNull();
});

// ── ONE RUN, ONE DECK (2026-09-30) ──────────────────────────────────────────
// A deck can be created for a run's conversation before the run's own save
// (the chat renderer). If the page reloads then, "Try again" must continue
// THAT deck, so the stopped run hands back every conversation it ran in, and
// the retry carries them forward (a retry interrupted again still knows them).
test("a stopped run hands back the conversations it ran in, and a retry carries them on", async () => {
  const store = makeStore();
  mount(store);
  act(() => {
    void latest!.track({ count: 3, material: "chapter 4" }, (_settle, _saving, attach) => {
      attach("conv-first");
      return new Promise<never>(() => {});
    });
  });
  act(() => {
    window.dispatchEvent(new Event("beforeunload"));
  });
  const bytes = persisted(store);
  unmount();
  forgetRunsInThisPageForTest();

  const reloaded = reloadedStore(bytes);
  mount(reloaded);
  expect(latest!.stopped?.conversationIds).toEqual(["conv-first"]);

  // Try again: the retry continues the stopped run's conversations, and adds its own.
  const continues = latest!.stopped!.conversationIds;
  act(() => latest!.dismiss());
  act(() => {
    void latest!.track(
      { count: 3, material: "chapter 4" },
      (_settle, _saving, attach) => {
        attach("conv-second");
        return new Promise<never>(() => {});
      },
      { continues },
    );
  });
  act(() => {
    window.dispatchEvent(new Event("beforeunload"));
  });
  const again = persisted(reloaded);
  unmount();
  forgetRunsInThisPageForTest();
  mount(reloadedStore(again));
  expect(latest!.stopped?.conversationIds).toEqual(["conv-first", "conv-second"]);
});

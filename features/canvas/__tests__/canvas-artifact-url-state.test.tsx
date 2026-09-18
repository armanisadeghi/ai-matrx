/**
 * Guards for THE CLASS: "the open canvas item is NOT part of the page's
 * address, so a list route loses it."
 *
 * The live defect (`/artifacts`, recorded as an open item in this feature's
 * `FEATURE.md`): the canvas slice is deliberately not persisted, so a reload
 * emptied it. A chat room re-derives its artifacts from persisted tool-call
 * rows and never noticed. `/artifacts` has no such source — the artifact a
 * person was reading vanished, Back did nothing, and a link could not be
 * shared.
 *
 * The ruling (loop owner, 2026-09-18): the open artifact is part of the page's
 * address. Champion: Claude.ai's artifacts gallery, where the selected artifact
 * lives in the URL and reload / Back / Forward / share all restore it.
 *
 * Proven failing before passing — re-run each mutation to re-prove:
 *   a. restores-on-load → deleted the "URL MOVED"/first-reconcile arm of
 *      `useCanvasArtifactUrlState`; a load at `?open=<id>` opened nothing → RED
 *      ("restores the artifact named in the address on load").
 *   b. address-carries-the-open-artifact → deleted the "CANVAS MOVED" arm; a
 *      click opened the pane and the address stayed `/artifacts` → RED.
 *   c. closing-removes-it → made `closeCanvas` not clear the parameter (the
 *      `canvasArtifactId` read ignored `isOpen`); the address kept pointing at
 *      a closed artifact and a reload reopened it → RED.
 *   d. back-forward → replaced the value comparison with the tempting
 *      "ignore any URL we wrote ourselves" bookkeeping; Forward to an already
 *      visited artifact moved the address and left the canvas behind → RED.
 *   e. waits-for-availability → removed the `isAvailable` wait; the idle
 *      -deferred front door had not mounted yet, so the restore was refused
 *      with a FALSE "canvas is not available here" → RED.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import {
  canvasSlice,
  closeCanvas,
  setCanvasAvailable,
} from "@/features/canvas/redux/canvasSlice";
import {
  CANVAS_ARTIFACT_URL_PARAM,
  useCanvasArtifactUrlState,
} from "@/features/canvas/hooks/useCanvasArtifactUrlState";
import { useOpenCanvasItem } from "@/features/canvas/hooks/useOpenCanvasItem";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  },
}));

// The opener reads the row for its type when the caller does not know it.
jest.mock("@/features/canvas/services/canvasArtifactService", () => ({
  canvasArtifactService: {
    getById: jest.fn(async (id: string) => ({
      id,
      type: "html",
      title: `Artifact ${id.slice(0, 4)}`,
    })),
  },
}));

const ARTIFACT_A = "11111111-1111-4111-8111-111111111111";
const ARTIFACT_B = "22222222-2222-4222-8222-222222222222";

function makeStore() {
  return configureStore({
    reducer: { canvas: canvasSlice.reducer },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

type Store = ReturnType<typeof makeStore>;

/** jsdom's history is real; `useUrlState` reads `window.location` + popstate. */
function setAddress(search: string, mode: "push" | "replace" = "push") {
  const url = `/artifacts${search}`;
  if (mode === "replace") window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  act(() => {
    window.dispatchEvent(new Event("matrx:url-state"));
  });
}

function openParam(): string | null {
  return new URLSearchParams(window.location.search).get(
    CANVAS_ARTIFACT_URL_PARAM,
  );
}

interface Harness {
  root: Root;
  container: HTMLElement;
  open: (artifactId: string) => Promise<void>;
  unmount: () => void;
}

/** Mount the hook exactly as `/artifacts` mounts it, plus a click opener. */
function mount(store: Store): Harness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const api: { openItem: ((input: { artifactId: string }) => Promise<boolean>) | null } =
    { openItem: null };

  function Probe() {
    useCanvasArtifactUrlState();
    const { openItem } = useOpenCanvasItem();
    api.openItem = openItem;
    return null;
  }

  act(() => {
    root.render(
      <Provider store={store}>
        <Probe />
      </Provider>,
    );
  });

  return {
    root,
    container,
    open: async (artifactId: string) => {
      await act(async () => {
        await api.openItem?.({ artifactId });
      });
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** Let the opener's row fetch and the mirroring effect settle. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function openArtifactIdInCanvas(store: Store): string | null {
  const state = store.getState().canvas;
  if (!state.isOpen || !state.currentItemId) return null;
  const item = state.items.find((i) => i.id === state.currentItemId);
  return item?.content.metadata?.canvasItemId ?? null;
}

beforeEach(() => {
  toastError.mockClear();
  setAddress("", "replace");
});

describe("the open artifact is part of /artifacts' address", () => {
  it("restores the artifact named in the address on load (RELOAD)", async () => {
    setAddress(`?${CANVAS_ARTIFACT_URL_PARAM}=${ARTIFACT_A}`, "replace");
    const store = makeStore();
    store.dispatch(setCanvasAvailable(true));

    const h = mount(store);
    await settle();

    expect(openArtifactIdInCanvas(store)).toBe(ARTIFACT_A);
    expect(store.getState().canvas.isOpen).toBe(true);
    h.unmount();
  });

  it("waits for the idle-deferred canvas instead of a false refusal", async () => {
    setAddress(`?${CANVAS_ARTIFACT_URL_PARAM}=${ARTIFACT_A}`, "replace");
    const store = makeStore(); // front door has NOT mounted yet

    const h = mount(store);
    await settle();

    // Nothing opened, and crucially nothing LIED about it.
    expect(openArtifactIdInCanvas(store)).toBeNull();
    expect(toastError).not.toHaveBeenCalled();

    await act(async () => {
      store.dispatch(setCanvasAvailable(true));
    });
    await settle();

    expect(openArtifactIdInCanvas(store)).toBe(ARTIFACT_A);
    h.unmount();
  });

  it("puts the artifact a click opened into the address", async () => {
    const store = makeStore();
    store.dispatch(setCanvasAvailable(true));
    const h = mount(store);
    await settle();
    expect(openParam()).toBeNull();

    await h.open(ARTIFACT_A);
    await settle();

    expect(openParam()).toBe(ARTIFACT_A);
    h.unmount();
  });

  it("removes it from the address when the canvas closes", async () => {
    const store = makeStore();
    store.dispatch(setCanvasAvailable(true));
    const h = mount(store);
    await h.open(ARTIFACT_A);
    await settle();
    expect(openParam()).toBe(ARTIFACT_A);

    await act(async () => {
      store.dispatch(closeCanvas());
    });
    await settle();

    expect(openParam()).toBeNull();
    h.unmount();
  });

  it("follows Back and Forward, including forward to a visited artifact", async () => {
    const store = makeStore();
    store.dispatch(setCanvasAvailable(true));
    const h = mount(store);
    await h.open(ARTIFACT_A);
    await settle();
    await h.open(ARTIFACT_B);
    await settle();
    expect(openParam()).toBe(ARTIFACT_B);

    // Back → A. (jsdom does not run the history stack for us; the hook's
    // contract is "the address moved", which is what popstate delivers.)
    setAddress(`?${CANVAS_ARTIFACT_URL_PARAM}=${ARTIFACT_A}`, "replace");
    await settle();
    expect(openArtifactIdInCanvas(store)).toBe(ARTIFACT_A);

    // Forward → B. THE BOOKKEEPING TRAP: B is a value this hook itself wrote
    // earlier, so a "ignore URLs we wrote" guard swallows it here.
    setAddress(`?${CANVAS_ARTIFACT_URL_PARAM}=${ARTIFACT_B}`, "replace");
    await settle();
    expect(openArtifactIdInCanvas(store)).toBe(ARTIFACT_B);

    // Back past the first open → the canvas closes.
    setAddress("", "replace");
    await settle();
    expect(store.getState().canvas.isOpen).toBe(false);
    h.unmount();
  });

  it("adopts an artifact already open when the route is entered client-side", async () => {
    const store = makeStore();
    store.dispatch(setCanvasAvailable(true));

    // Opened elsewhere, then the person navigates to /artifacts.
    const opener = mount(store);
    await opener.open(ARTIFACT_A);
    await settle();
    opener.unmount();
    setAddress("", "replace");

    const h = mount(store);
    await settle();

    expect(openParam()).toBe(ARTIFACT_A);
    h.unmount();
  });
});

/**
 * Guards for THE CLASS: "an artifact/document the agent says it opened silently
 * fails to reach the canvas."
 *
 * The live defect (production chat route, conversation
 * bb458c1e-3222-4c16-9d29-77c48b186a02, 2026-09-14): a reviewer asked the chat
 * agent to create a markdown document and open it as a document artifact in the
 * canvas. The agent called the `document` tool, then said «Created and opened as
 * a document artifact: Canvas Hijack Check». Nothing opened. No tab by that name
 * existed and NO failure was shown.
 *
 * The frontend half of that is the class these guards pin, not the one tool:
 *
 *   1. An open-in-canvas request that cannot be honoured must ANNOUNCE itself
 *      with a remedy (law 4), never `return` silently. Dispatching into a route
 *      with no canvas surface is the worst case — the item is accepted and
 *      absolutely nothing renders.
 *   2. The canvas exists exactly where its ONE provider is mounted. There is no
 *      second availability flag a route could forget to raise.
 *
 * Runs against the real `@ai-matrx/canvas` controller and reducer (a
 * standalone store under a real CanvasProvider).
 *
 * Proven failing before passing — re-run these mutations to re-prove:
 *   a. announces-unreachable → removed the `!canvas` guard from
 *      `openArtifactContent`; the open threw / returned silently with no
 *      toast → RED.
 *   b. announces-no-data     → removed the `data == null` guard; the empty
 *      tab opened silently → RED.
 */

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { createCanvasStore, selectCanvasActiveItem, type CanvasStoreBinding } from "@ai-matrx/canvas";
import { CanvasProvider, useCanvas as useCanvasController } from "@ai-matrx/canvas/react";
import type { CanvasContent } from "@/features/canvas/canvasContent";
import { contentOf, readArtifactItemData } from "@/features/canvas/host/artifactItem";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";

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

type Store = CanvasStoreBinding;

/** Stands in for the shell's canvas column being on screen (it registers the
 *  presentation that makes the canvas available). */
function PresentedColumn() {
  const canvas = useCanvasController();
  useEffect(() => canvas.registerPresentation(), [canvas]);
  return null;
}

/** Mount a component that exposes `useCanvas().open` to the test. */
/** `store === null` mounts with NO canvas provider: a route with no canvas. */
function mountOpener(store: Store | null) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const api: { open: ((c: CanvasContent) => boolean) | null } = { open: null };

  function Probe() {
    const canvas = useCanvas();
    api.open = canvas.open;
    return null;
  }

  act(() => {
    root.render(
      store ? (
        <CanvasProvider store={store} persistence={null} hotkeys={false}>
          <PresentedColumn />
          <Probe />
        </CanvasProvider>
      ) : (
        <Probe />
      ),
    );
  });

  return {
    open: (content: CanvasContent) => {
      const open = api.open;
      if (!open) throw new Error("probe never mounted");
      let result: boolean | undefined;
      act(() => {
        result = open(content);
      });
      return result;
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const DOCUMENT_REQUEST: CanvasContent = {
  type: "udt_document",
  data: { documentId: "bb458c1e-3222-4c16-9d29-77c48b186a02" },
  metadata: {
    title: "Canvas Hijack Check",
    sourceMessageId: "udt:bb458c1e",
  },
};

beforeEach(() => {
  toastError.mockClear();
});

const itemCount = (store: Store) => Object.keys(store.getState().items).length;

describe("an open-in-canvas request never silently does nothing", () => {
  it("announces-unreachable: refusing an open on a route with no canvas surface is VISIBLE, not a no-op", () => {
    // No canvas provider mounted at all.
    const probe = mountOpener(null);
    const opened = probe.open(DOCUMENT_REQUEST);

    expect(opened).toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);
    const [headline, options] = toastError.mock.calls[0] as [
      string,
      { description?: string },
    ];
    // The person is told WHAT was dropped and WHAT to do — not just "error".
    expect(headline).toContain("Canvas Hijack Check");
    expect(headline.toLowerCase()).toContain("canvas");
    expect(options?.description ?? "").not.toHaveLength(0);

    probe.unmount();
  });

  it("announces-no-data: an open carrying no content is VISIBLE, not a no-op", () => {
    const store = createCanvasStore();
    const probe = mountOpener(store);
    const opened = probe.open({
      type: "udt_document",
      data: null,
      metadata: { title: "Canvas Hijack Check" },
    } as CanvasContent);

    expect(opened).toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(itemCount(store)).toBe(0);

    probe.unmount();
  });

  it("one-surface: where the provider is mounted, the open lands on screen", () => {
    const store = createCanvasStore();
    const probe = mountOpener(store);
    const opened = probe.open(DOCUMENT_REQUEST);

    expect(opened).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
    expect(itemCount(store)).toBe(1);
    const state = store.getState();
    expect(state.isOpen).toBe(true);
    const active = selectCanvasActiveItem(state);
    const data = active ? readArtifactItemData(active.data) : null;
    expect(data ? contentOf(data).type : null).toBe("udt_document");

    probe.unmount();
  });
});

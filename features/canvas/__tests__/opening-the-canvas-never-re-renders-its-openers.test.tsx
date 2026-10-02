/**
 * Guard for THE CLASS: "a component that can OPEN something in the canvas
 * re-renders every time the canvas opens, closes or switches tab."
 *
 * Measured live (2026-10-02, /chat with the canvas open): every markdown
 * block, every CodeBlock, the composer's "+" menu and the cloud-browser
 * openers called `useCanvas()` / `useArtifactCanvas()` only for `open`, yet
 * those hooks also subscribed to the canvas's open flag and active tab. So one
 * click on the canvas toggle re-rendered every opener on the page — in a long
 * conversation, every code block and every rich block — on the click path.
 *
 * An opener's verbs read the canvas at CALL time; they never subscribe. This
 * pins it against the real `@ai-matrx/canvas` controller and reducer.
 *
 * Proven failing before passing: with `useCanvas()` built on the subscribing
 * `useArtifactCanvas()` (the code before this guard), the opener rendered
 * once per show / activate / hide → RED.
 */

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { createCanvasStore } from "@ai-matrx/canvas";
import { CanvasProvider, useCanvas as useCanvasController } from "@ai-matrx/canvas/react";
import type { CanvasContent } from "@/features/canvas/canvasContent";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { useArtifactCanvasActions } from "@/features/canvas/host/useArtifactCanvas";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

function PresentedColumn() {
  const canvas = useCanvasController();
  useEffect(() => canvas.registerPresentation(), [canvas]);
  return null;
}

const content = (n: number): CanvasContent => ({
  type: "code",
  data: { language: "ts", code: `const n = ${n};` },
  metadata: { title: `Snippet ${n}` },
});

function mount() {
  const store = createCanvasStore();
  const renders = { useCanvas: 0, actions: 0 };
  const api: { open: ((c: CanvasContent) => boolean) | null } = { open: null };

  function BlockOpener() {
    renders.useCanvas += 1;
    const { open } = useCanvas();
    api.open = open;
    return null;
  }

  function ActionsOpener() {
    renders.actions += 1;
    useArtifactCanvasActions();
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let controller: ReturnType<typeof useCanvasController> | null = null;
  function Grab() {
    controller = useCanvasController();
    return null;
  }
  act(() => {
    root.render(
      <CanvasProvider store={store} persistence={null} hotkeys={false}>
        <PresentedColumn />
        <Grab />
        <BlockOpener />
        <ActionsOpener />
      </CanvasProvider>,
    );
  });
  return {
    renders,
    open: (c: CanvasContent) => {
      let ok = false;
      act(() => {
        ok = api.open?.(c) ?? false;
      });
      return ok;
    },
    act: (fn: (c: NonNullable<typeof controller>) => void) =>
      act(() => {
        if (controller) fn(controller);
      }),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("opening, hiding or switching the canvas never re-renders an opener", () => {
  it("useCanvas() and useArtifactCanvasActions() hold still while the canvas changes", () => {
    const probe = mount();
    const before = { ...probe.renders };

    expect(probe.open(content(1))).toBe(true);
    expect(probe.open(content(2))).toBe(true);
    probe.act((c) => c.hide());
    probe.act((c) => c.show());
    probe.act((c) => {
      const first = Object.keys(c.getState().items)[0];
      if (first) c.activate(first as Parameters<typeof c.activate>[0]);
    });
    probe.act((c) => c.toggle());

    // The verbs still work (two tabs opened) — they were simply never re-rendered for.
    expect(probe.renders).toEqual(before);
    probe.unmount();
  });
});

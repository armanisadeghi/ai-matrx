/**
 * Previewing a suggestion's source opens it as a canvas tab
 * (`kg-source-preview`) keyed by the source — never a floating panel. Every
 * decision card asks through `useOpenSourcePreview()`, so this is the opener
 * the whole feature uses. Where no canvas column is on screen the hook returns
 * `null`, which is what tells a card to fall back to a link-out.
 *
 * Proven failing before passing: with the hook returning a no-op opener (no
 * `openCanvasItem` call) the canvas holds nothing → RED.
 */

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { createCanvasStore, selectCanvasActiveItem, type CanvasStoreBinding } from "@ai-matrx/canvas";
import { CanvasProvider, useCanvas } from "@ai-matrx/canvas/react";
import { useOpenSourcePreview, type SourcePreviewTarget } from "../SourcePreviewContext";
import { SOURCE_PREVIEW_KIND } from "../sourcePreviewKind";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

function PresentedColumn() {
  const canvas = useCanvas();
  useEffect(() => canvas.registerPresentation(), [canvas]);
  return null;
}

function mount(presented: boolean) {
  const canvasStore: CanvasStoreBinding = createCanvasStore();
  const api: { open: ((t: SourcePreviewTarget) => void) | null } = { open: null };
  function Probe() {
    api.open = useOpenSourcePreview();
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <CanvasProvider store={canvasStore} persistence={null}>
        {presented ? <PresentedColumn /> : null}
        <Probe />
      </CanvasProvider>,
    );
  });
  return { canvasStore, api, unmount: () => act(() => root.unmount()) };
}

const NOTE: SourcePreviewTarget = { kind: "note", id: "n-1", snippet: "the evidence", title: "Q3 plan" };

describe("previewing a suggestion's source", () => {
  it("opens one canvas tab per source and focuses it on a second press", () => {
    const m = mount(true);
    expect(m.api.open).not.toBeNull();
    act(() => m.api.open?.(NOTE));
    act(() => m.api.open?.({ kind: "task", id: "t-1", snippet: null }));
    act(() => m.api.open?.(NOTE));
    const state = m.canvasStore.getState();
    expect(Object.keys(state.items)).toHaveLength(2);
    expect(selectCanvasActiveItem(state)).toMatchObject({
      kind: SOURCE_PREVIEW_KIND,
      key: "note:n-1",
      title: "Q3 plan",
      data: { kind: "note", id: "n-1", snippet: "the evidence", title: "Q3 plan" },
    });
    m.unmount();
  });

  it("offers no opener where no canvas column is on screen, so the card links out", () => {
    const m = mount(false);
    expect(m.api.open).toBeNull();
    m.unmount();
  });
});

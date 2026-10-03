/**
 * The tutor, a mind map's node detail and its sources, and a Rulebook's
 * Conductor and Interview open IN THE CANVAS as the page's own tab
 * (`CanvasPagePanel`) — never a docked side panel beside the canvas.
 *
 * The tutor is driven for real (its body mocked): opening shows it in the
 * `education-tutor` page-panel tab; closing the tab closes it on the page.
 * The other four are read from source: one that mounts its own panel again
 * goes RED.
 *
 * Proven failing before passing: against the pre-canvas AskTutorPanel there is
 * no tab and no body; every source case is RED on the pre-canvas files.
 */

import React, { act, useEffect } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureStore } from "@reduxjs/toolkit";
import { CanvasColumn, useCanvas } from "@ai-matrx/canvas/react";
import type { CanvasController } from "@ai-matrx/canvas";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { CanvasHostProvider } from "@/features/canvas/host/CanvasHostProvider";
import { pagePanelItemId } from "@/features/canvas/host/pagePanel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AskTutorPanel } from "@/features/education/tutor/components/AskTutorButton";
import type { TutorGroundingSeed } from "@/features/education/tutor/grounding";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

jest.mock("next/navigation", () => ({
  usePathname: () => "/education",
  useRouter: () => ({ push: () => undefined }),
}));
jest.mock("@/features/education/tutor/components/EducationTutorClient", () => ({
  EducationTutorClient: () => <p data-tutor-body="">tutor</p>,
}));

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await act(async () => {});
};

it("the tutor opens as the page's canvas tab; closing the tab closes it on the page", async () => {
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  const seen: { canvas: CanvasController | null } = { canvas: null };
  function Grab() {
    const canvas = useCanvas();
    useEffect(() => canvas.registerPresentation(), [canvas]);
    seen.canvas = canvas;
    return null;
  }
  const onOpenChange = jest.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <Provider store={store}>
          <TooltipProvider>
            <CanvasHostProvider>
              <CanvasColumn />
              <Grab />
              <AskTutorPanel seed={{ title: "Mitosis" } as TutorGroundingSeed} open onOpenChange={onOpenChange} />
            </CanvasHostProvider>
          </TooltipProvider>
        </Provider>
      </QueryClientProvider>,
    );
  });
  await flush();
  const id = pagePanelItemId("education-tutor");
  expect(store.getState().canvasHost.items[id]?.title).toBe("AI Tutor");
  expect(document.querySelector(`[data-page-panel-slot="${id}"] [data-tutor-body]`)).not.toBeNull();
  act(() => void seen.canvas?.close(id));
  await flush();
  expect(onOpenChange).toHaveBeenCalledWith(false);
  act(() => root.unmount());
  container.remove();
});

it("node detail, map sources, Conductor and Interview are the page's canvas tab", () => {
  const root = join(__dirname, "..", "..", "..");
  for (const file of [
    "education/tutor/components/AskTutorButton.tsx",
    "education/media/mindmap/components/MindMapView.tsx",
    "education/media/mindmap/components/MindMapDetail.tsx",
    "masterwork/conduct/ConductorPanel.tsx",
    "masterwork/components/detail/ScoutInterviewPanel.tsx",
  ]) {
    const source = readFileSync(join(root, file), "utf8");
    expect([file, source.includes("MatrxDynamicPanelHost")]).toEqual([file, false]);
    expect([file, source.includes("<CanvasPagePanel")]).toEqual([file, true]);
  }
});

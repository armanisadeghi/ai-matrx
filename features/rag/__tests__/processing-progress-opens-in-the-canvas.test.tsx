/**
 * Live processing progress opens IN THE CANVAS — the page's own jobs and
 * callbacks drawn in ONE `page-panel` tab (`processing-progress`) — never a
 * docked side panel. Closing the tab tells the page.
 *
 * Proven failing before passing: against the pre-canvas sheet
 * (MatrxDynamicPanelHost) no page-panel tab exists and the job body is not in it.
 */

import React, { act, useEffect } from "react";
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
import type { ProcessingJob } from "@/features/rag/hooks/useProcessingRunner";
import { ProcessingProgressSheet } from "@/features/rag/components/library/ProcessingProgressSheet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

jest.mock("next/navigation", () => ({
  usePathname: () => "/knowledge",
  useRouter: () => ({ push: () => undefined }),
}));
jest.mock("@/features/rag/components/library/ProcessingJobView", () => ({
  ProcessingJobView: ({ job }: { job: { title: string } }) => <p data-job-body="">{job.title}</p>,
}));

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await act(async () => {});
};

const job = {
  jobId: "j-1",
  title: "Annual report.pdf",
  subtitle: null,
  status: "running",
  frame: null,
} as unknown as ProcessingJob;

it("an open sheet is the page's canvas tab with the job in it; closing the tab closes it on the page", async () => {
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
              <ProcessingProgressSheet
                open
                onOpenChange={onOpenChange}
                jobs={[job]}
                onCancel={() => undefined}
                onDismiss={() => undefined}
              />
            </CanvasHostProvider>
          </TooltipProvider>
        </Provider>
      </QueryClientProvider>,
    );
  });
  await flush();
  const id = pagePanelItemId("processing-progress");
  expect(store.getState().canvasHost.items[id]?.title).toBe("Annual report.pdf");
  expect(document.querySelector(`[data-page-panel-slot="${id}"] [data-job-body]`)?.textContent).toBe("Annual report.pdf");

  act(() => void seen.canvas?.close(id));
  await flush();
  expect(onOpenChange).toHaveBeenCalledWith(false);
  act(() => root.unmount());
  container.remove();
});

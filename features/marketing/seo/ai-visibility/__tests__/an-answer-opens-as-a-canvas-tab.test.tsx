/**
 * "Read full answer" on an engine card opens that answer as a canvas tab
 * (`ai-visibility-answer`), keyed by the answer's id — never a second floating
 * right panel. Pressing it again focuses the same tab.
 *
 * Drives the real `AiVisibilityWorkspace` (its data hook stubbed with one saved
 * answer) under a real `@ai-matrx/canvas` controller.
 *
 * Proven failing before passing: with the card's `onOpen` reverted to local
 * state (no `openCanvasItem` call) the canvas holds nothing → RED.
 */

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { makeStore } from "@/lib/redux/store";
import { TooltipProvider } from "@/components/ui/tooltip";

import { createCanvasStore, selectCanvasActiveItem } from "@ai-matrx/canvas";
import { CanvasProvider, useCanvas } from "@ai-matrx/canvas/react";
import { AI_ANSWER_KIND } from "../canvas/aiAnswerKind";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SAVED_ID = "11111111-2222-3333-4444-555555555555";

jest.mock("../useAiVisibility", () => ({
  useAiVisibility: () => ({
    evidence: {
      data: {
        responses: [
          {
            id: "11111111-2222-3333-4444-555555555555",
            command_run_id: "run-1",
            engine: "chat_gpt",
            status: "completed",
            model_name: "gpt-test",
            answer_text: "Use **Acme** for widgets.",
            target_mentioned: true,
            target_cited: false,
            citation_count: 0,
            analysis: {},
          },
        ],
        claims: [],
        citations: [],
        signals: [],
      },
      isError: false,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    },
    evidenceRefreshError: null,
    retryEvidence: jest.fn(),
    run: { status: "idle", answers: {} },
    analyze: jest.fn(),
    watchProgress: jest.fn(),
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => "/marketing",
  useSearchParams: () => new URLSearchParams(),
}));

function PresentedColumn() {
  const canvas = useCanvas();
  useEffect(() => canvas.registerPresentation(), [canvas]);
  return null;
}

it("opens the engine's full answer as one canvas tab keyed by the answer", async () => {
  const { AiVisibilityWorkspace } = await import("../AiVisibilityWorkspace");
  const canvasStore = createCanvasStore();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const site = { id: "site-1", organization_id: "org-1", domain: "acme.test" } as never;
  await act(async () => {
    root.render(
      <Provider store={makeStore()}>
        <QueryClientProvider client={new QueryClient()}>
          <CanvasProvider store={canvasStore} persistence={null}>
            <PresentedColumn />
            <TooltipProvider>
              <AiVisibilityWorkspace site={site} sitePath="/marketing/sites/site-1" />
            </TooltipProvider>
          </CanvasProvider>
        </QueryClientProvider>
      </Provider>,
    );
  });

  const button = container.querySelector<HTMLButtonElement>('button[aria-label="Read full ChatGPT answer"]');
  expect(button).not.toBeNull();
  await act(async () => button!.click());
  await act(async () => button!.click());

  const state = canvasStore.getState();
  expect(Object.values(state.items)).toHaveLength(1);
  expect(selectCanvasActiveItem(state)).toMatchObject({
    kind: AI_ANSWER_KIND,
    key: SAVED_ID,
    data: { engine: "ChatGPT", model: "gpt-test", answer: "Use **Acme** for widgets." },
  });
  act(() => root.unmount());
});

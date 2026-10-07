/**
 * An agent's edit history (the in-session undo/redo timeline) opens IN THE
 * CANVAS beside the builder — never the overlay-registry side sheet it was.
 *
 * Real pieces: the app's root reducer, its ONE canvas binding
 * (`CanvasHostProvider` + `<CanvasColumn>`), and the same `useToolOpener` +
 * `agentEditHistoryInput` the builder's message editors call. The editors are
 * page-sized, so their wiring is read from source: an opener that goes back to
 * the overlay goes RED, and so does a catalogue that still names it.
 *
 * Proven failing before passing: against the overlay-era editors the source
 * case is RED; with the kind left out of FEATURE_CANVAS_KINDS the body case is RED.
 */

import React, { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureStore } from "@reduxjs/toolkit";
import { CanvasColumn } from "@ai-matrx/canvas/react";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { CanvasHostProvider } from "@/features/canvas/host/CanvasHostProvider";
import { useToolOpener } from "@/features/canvas/host/toolCanvas";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AGENT_EDIT_HISTORY_KIND, agentEditHistoryInput } from "../host/agent/agentEditHistoryKind";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

jest.mock("next/navigation", () => ({
  usePathname: () => "/agents/a-1/build",
  useRouter: () => ({ push: () => undefined }),
}));
jest.mock("@/features/agents/components/undo-history/AgentEditHistory", () => ({
  AgentEditHistory: ({ agentId }: { agentId: string }) => <p data-edit-history="">{agentId}</p>,
}));

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await act(async () => {});
};

it("View history opens one edit-history tab per agent; asking again focuses it", async () => {
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  const seen: { open: ((o: { agentId: string }) => unknown) | null } = { open: null };
  function Opener() {
    seen.open = useToolOpener(agentEditHistoryInput);
    return null;
  }
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
              <Opener />
            </CanvasHostProvider>
          </TooltipProvider>
        </Provider>
      </QueryClientProvider>,
    );
  });
  const ids = () => Object.keys(store.getState().canvasHost.items);

  act(() => void seen.open?.({ agentId: "a-1" }));
  await flush();
  expect(ids()).toEqual([`${AGENT_EDIT_HISTORY_KIND}::a-1`]);
  expect(document.querySelector("[data-edit-history]")?.textContent).toBe("a-1");

  act(() => void seen.open?.({ agentId: "a-1" }));
  await flush();
  expect(ids()).toEqual([`${AGENT_EDIT_HISTORY_KIND}::a-1`]);
  act(() => root.unmount());
  container.remove();
});

it("the builder's message editors open the canvas tab — the overlay is gone", () => {
  const repo = join(__dirname, "..", "..", "..");
  for (const file of [
    "features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx",
    "features/agents/components/builder/message-builders/MessageItem.tsx",
  ]) {
    const source = readFileSync(join(repo, file), "utf8");
    expect(source).toContain("useToolOpener(agentEditHistoryInput)");
    expect(source).not.toContain('"undoHistory"');
  }
  expect(readFileSync(join(repo, "features/overlays/catalogue.ts"), "utf8")).not.toMatch(/\bundoHistory:/);
});

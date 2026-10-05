/**
 * @jest-environment jsdom
 *
 * WIRING: the composer's chips row closes the canvas tab when the item in
 * front is gone — real store, real edit stager. Live walk 2026-10-05: reverting
 * an edit removed its chip but left the diff open beside the chat.
 *
 * Use case: Priya opens the diff chip for her edit to the caching answer, then
 * reverts the edit.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { stageAnswerEditRemark } from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/answer-edit-remark";
import { selectInstanceResources } from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/instance-resources.selectors";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toggle = jest.fn();
let selected: string | null = null;
jest.mock("@ai-matrx/chat/host/canvas", () => ({
  useChatCanvasTab: () => ({ isAvailable: true, isVisible: selected !== null, selected, toggle }),
}));
jest.mock("@/features/files/components/preview/FileResourceChip", () => ({ FileResourceChip: () => null }));

import { SmartAgentResourceChips } from "@ai-matrx/chat/agents/components/inputs/resources/SmartAgentResourceChips";

const CID = "5e1d2c3b-4a59-4687-9a1b-2c3d4e5f6a7b";
const MID = "7f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2f10";

test("removing the edit chip whose diff is in front closes the tab", () => {
  toggle.mockReset();
  selected = null;
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (d) => d({ serializableCheck: false }),
  });
  const host = document.createElement("div");
  const root = createRoot(host);
  const mount = () =>
    act(() =>
      root.render(
        <Provider store={store}>
          <TooltipProvider>
            <SmartAgentResourceChips conversationId={CID} />
          </TooltipProvider>
        </Provider>,
      ),
    );
  act(() => {
    store.dispatch(
      stageAnswerEditRemark({ conversationId: CID, messageId: MID, beforeText: "Use Redis.", afterText: "Use SQLite." }),
    );
  });
  mount();
  const resources = selectInstanceResources(CID)(store.getState());
  expect(resources).toHaveLength(1);
  // The person presses that chip: it asks the canvas to show its item.
  document.body.appendChild(host);
  const press = host.querySelector<HTMLElement>("button");
  expect(press).not.toBeNull();
  act(() => press!.click());
  expect(toggle).toHaveBeenCalledTimes(1);
  const shownId = (toggle.mock.calls[0][0] as { selected: string }).selected;
  toggle.mockReset();
  selected = shownId;
  mount();
  expect(toggle).not.toHaveBeenCalled();
  // Reverting the edit removes the chip.
  act(() => {
    store.dispatch(
      stageAnswerEditRemark({ conversationId: CID, messageId: MID, beforeText: "Use Redis.", afterText: "Use Redis." }),
    );
  });
  mount();
  expect(selectInstanceResources(CID)(store.getState())).toHaveLength(0);
  expect(toggle).toHaveBeenCalledTimes(1);
  expect(toggle.mock.calls[0][0]).toMatchObject({ selected: shownId });
  act(() => root.unmount());
  host.remove();
});

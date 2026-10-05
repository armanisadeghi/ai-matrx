/**
 * @jest-environment jsdom
 *
 * A signed-out person on a shared view interacts with a block: nothing can be
 * saved, and the page SAYS so under the block (never a silent drop, never a write).
 * Use case: a stranger opens a shared recipe link, ticks "Flour" — "Sign in to keep your answers."
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const setBlockState = jest.fn();
jest.mock("../blockStateService", () => ({
  ...jest.requireActual("../blockStateService"),
  setBlockState: (...a: unknown[]) => setBlockState(...a),
  listConversationBlockStates: jest.fn(async () => []),
  listEntityBlockStates: jest.fn(async () => []),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => null }));

import { blockStatesReducer } from "../redux/blockStatesSlice";
import { BlockStateHost } from "../BlockStateContext";
import { useBlockState } from "../useBlockState";

function Tick() {
  const { patch } = useBlockState<{ checkedIngredients: string[] }>();
  return <button onClick={() => patch({ checkedIngredients: ["Flour"] })}>tick</button>;
}

it("tells a signed-out person their answers are not kept, and writes nothing", async () => {
  const store = configureStore({ reducer: { blockStates: blockStatesReducer } as never });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Provider store={store}>
        {/* a shared view: the block has no durable answer id to belong to */}
        <BlockStateHost kind="recipe" messageId={null} conversationId={null} blockIndex={0}>
          <Tick />
        </BlockStateHost>
      </Provider>,
    );
  });
  await act(async () => {
    container.querySelector("button")!.click();
  });
  expect(container.textContent).toContain("Sign in to keep your answers");
  expect(setBlockState).not.toHaveBeenCalled();
  act(() => root.unmount());
});

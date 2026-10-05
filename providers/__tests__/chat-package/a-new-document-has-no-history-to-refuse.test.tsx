/**
 * A new chat's working document is reserved (it has an id) but not written
 * (no row). Asking `version_list` for it can only be refused — "access denied"
 * printed in red where an empty history belongs. Version history asks only
 * once the row exists, and says "No versions yet" until then.
 *
 * Proven failing before passing: without the `materialized` gate the reserved
 * case calls the read and renders its refusal.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import {
  markWorkingDocMaterialized,
  setWorkingDocBinding,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-working-document/instance-working-document.slice";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const listVersions = jest.fn(async (): Promise<never> => {
  throw new Error("[working-document] version_list failed: access denied");
});
jest.mock(
  "@ai-matrx/chat/agents/redux/execution-system/instance-working-document/cx-working-document.service",
  () => ({
    listWorkingDocumentVersions: () => listVersions(),
    getWorkingDocumentVersionContent: async () => null,
    restoreWorkingDocumentVersion: async () => 0,
  }),
);
jest.mock("@ai-matrx/chat/agents/hooks/useWorkingDocument", () => ({
  useWorkingDocument: () => ({ draft: "", onChange: () => undefined, flush: () => undefined, viewOnly: false }),
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";
import { WorkingDocumentVersionHistory } from "@ai-matrx/chat/agents/components/working-document/WorkingDocumentVersionHistory";

// The host draws the note version panel (P20 slot); this test registers an empty one.
registerChatUi({ NoteVersionHistoryPanel: () => null });

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await act(async () => {});
};

function mount(materialized: boolean) {
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(
    setWorkingDocBinding({
      conversationId: "c-1",
      kind: "working",
      binding: { kind: "cx_working_document", id: "d-1" },
    }),
  );
  if (materialized) store.dispatch(markWorkingDocMaterialized({ conversationId: "c-1", kind: "working" }));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <Provider store={store}>
        <WorkingDocumentVersionHistory conversationId="c-1" />
      </Provider>,
    );
  });
  return {
    container,
    done: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

beforeEach(() => listVersions.mockClear());

it("a reserved, unwritten document shows an honest empty history and never asks", async () => {
  const view = mount(false);
  await flush();
  expect(listVersions).not.toHaveBeenCalled();
  expect(view.container.textContent).toContain("No versions yet");
  expect(view.container.textContent).not.toContain("access denied");
  view.done();
});

it("a written document reads its versions", async () => {
  const view = mount(true);
  await flush();
  expect(listVersions).toHaveBeenCalledTimes(1);
  view.done();
});

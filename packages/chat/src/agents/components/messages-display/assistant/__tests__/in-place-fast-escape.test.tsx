/**
 * verify-RC-B5 F3 — a fast Escape must not drop what was just typed.
 *
 * THE ONE editor reports text changes ~120 ms after a keystroke. Escape
 * pressed inside that window used to read the stale draft ("unchanged") and
 * close without asking. The editor here is a stand-in with the same contract:
 * a contenteditable document whose input is reported to `onChange` only after
 * the debounce.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createSandboxTestStore, SandboxStoreProvider } from "@/test-utils/sandbox-store";

jest.mock("@/components/rich-editor/RichEditor", () => {
  function StandInEditor(props: { value: string; onChange?: (t: string) => void; onCancel?: () => void }) {
    return (
      <div>
        <div role="tablist" aria-label="View" />
        <div
          className="ProseMirror"
          contentEditable
          suppressContentEditableWarning
          onInput={(event) => {
            const text = (event.target as HTMLElement).textContent ?? "";
            setTimeout(() => props.onChange?.(text), 120);
          }}
        >
          {props.value}
        </div>
        <button type="button" onClick={props.onCancel}>
          Close
        </button>
      </div>
    );
  }
  return { __esModule: true, default: StandInEditor };
});

jest.mock("@/features/agents/redux/execution-system/message-crud/save-answer-edit.thunk", () => ({
  fetchStoredAnswer: async () => ({ content: [{ type: "text", text: "Stored answer." }], text: "Stored answer." }),
  saveAnswerEdit: Object.assign(() => ({ type: "noop" }), { rejected: { match: () => false } }),
}));

import { InPlaceAnswerEditor } from "../InPlaceAnswerEditor";

let host: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function mountEditor() {
  const store = createSandboxTestStore({
    userId: "87a6e699-3622-4869-8843-d0867456c0dd",
    organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    adminLevel: null,
  });
  await act(async () => {
    root.render(
      <SandboxStoreProvider store={store}>
        <InPlaceAnswerEditor conversationId="c1" messageId="m1" />
      </SandboxStoreProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const doc = host.querySelector(".ProseMirror") as HTMLElement;
  expect(doc).not.toBeNull();
  return doc;
}

test("Escape within the report window after typing asks before discarding", async () => {
  const doc = await mountEditor();
  await act(async () => {
    doc.textContent = "Stored answer. QQQ";
    doc.dispatchEvent(new InputEvent("input", { bubbles: true }));
    // Immediately — well inside the editor's 120 ms report delay.
    doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
  expect(document.body.textContent).toContain("Discard your edit?");
});

test("Close right after typing asks too", async () => {
  const doc = await mountEditor();
  await act(async () => {
    doc.textContent = "Stored answer. QQQ";
    doc.dispatchEvent(new InputEvent("input", { bubbles: true }));
    (host.querySelector("button") as HTMLButtonElement).click();
  });
  expect(document.body.textContent).toContain("Discard your edit?");
});

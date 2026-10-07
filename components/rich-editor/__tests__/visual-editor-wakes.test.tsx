/**
 * The Visual view keeps the person's text when its effects pause and resume
 * without an unmount — a board tile that sleeps under React's `<Activity>`.
 * Tiptap destroys its editor on the pause and builds a new one on the resume;
 * the new one was built from the text given at mount, so a woken note showed
 * stale text and the next keystroke reported it over every later edit.
 *
 * The REAL RichEditorImpl (Visual view, real Tiptap); only chrome hooks are
 * stubbed, as in save-under-latency.test.tsx.
 */
import React, { Activity, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));
jest.mock("@ai-matrx/kit/media-query", () => ({ ...jest.requireActual("@ai-matrx/kit/media-query"), useIsMobile: () => false }));
jest.mock("@/features/context-menu-v3/EditableContextMenu", () => ({
  EditableContextMenu: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/features/context-menu-v3/utils/build-application-scope", () => ({
  buildApplicationScopeFromMenuContext: () => ({}),
}));
jest.mock("@/features/audio/hooks/useMicField", () => ({
  useMicField: () => ({ start: jest.fn(), stop: jest.fn(), state: "idle", isRecording: false, supported: false }),
}));
jest.mock("@/features/files/handler/hooks/useFileUpload", () => ({ useFileUpload: () => ({ upload: jest.fn() }) }));
jest.mock("@ai-matrx/rich-content/rich-document/RichDocument", () => ({ RichDocument: () => null }));
(globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};
document.elementFromPoint = () => null;
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;
Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect;
Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;

import RichEditorImpl from "@ai-matrx/rich-editor/editor/RichEditorImpl";

const ORIGINAL = "Tonight's handover: drain the print queue.";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function liveEditor() {
  const prose = container.querySelector(".ProseMirror") as (HTMLElement & { editor?: import("@tiptap/core").Editor }) | null;
  if (!prose?.editor) throw new Error("the Visual editor did not mount");
  return prose.editor;
}

/** Type at the end of the handover paragraph, as a person would. */
function typeText(text: string) {
  const editor = liveEditor();
  let end = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.isTextblock && node.textContent.includes("handover")) end = pos + 1 + node.content.size;
    return true;
  });
  if (end < 0) throw new Error("the handover paragraph is gone");
  editor.view.dispatch(editor.state.tr.insertText(text, end));
}

it("a sleep and wake keeps every edit, and the next keystroke reports all of them", async () => {
  const reported: string[] = [];
  const ui = (mode: "visible" | "hidden") => (
    <Activity mode={mode}>
      <RichEditorImpl value={ORIGINAL} defaultView="visual" onChange={(text) => reported.push(text)} />
    </Activity>
  );

  await act(async () => {
    root.render(ui("visible"));
    await tick(50);
  });
  await act(async () => {
    typeText(" Swap the label printer.");
    await tick(200);
  });
  expect(reported.at(-1)).toBe(`${ORIGINAL} Swap the label printer.`);

  // Sleep long enough for Tiptap to destroy the editor, then wake.
  await act(async () => {
    root.render(ui("hidden"));
    await tick(50);
  });
  await act(async () => {
    root.render(ui("visible"));
    await tick(50);
  });

  expect(container.querySelector(".ProseMirror")?.textContent).toContain("Swap the label printer.");
  await act(async () => {
    typeText(" Re-scan bay B3.");
    await tick(200);
  });
  expect(reported.at(-1)).toBe(`${ORIGINAL} Swap the label printer. Re-scan bay B3.`);
}, 60_000);

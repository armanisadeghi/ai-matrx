/**
 * A whole-text replace in the rich editor yields exactly ONE copy of the text.
 *
 * The context menu's `onTextReplace` contract is full-content: Cut / Paste /
 * an AI result's Replace / an agent's widget_text_replace hand over the ENTIRE
 * new value. The rich editor wired it to `replaceSelection`, so the whole note
 * was spliced in at the caret and the note held two copies. The REAL
 * RichEditorImpl (Visual view, real Tiptap); only chrome hooks are stubbed.
 */
import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));
jest.mock("@ai-matrx/kit/media-query", () => ({ ...jest.requireActual("@ai-matrx/kit/media-query"), useIsMobile: () => false }));
const menuProps: { onTextReplace?: (text: string) => void } = {};
jest.mock("@/features/context-menu-v3/EditableContextMenu", () => ({
  EditableContextMenu: (props: { children: React.ReactNode; onTextReplace?: (text: string) => void }) => {
    menuProps.onTextReplace = props.onTextReplace;
    return props.children;
  },
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

import RichEditorImpl, { type RichEditorController } from "@ai-matrx/rich-editor/editor/RichEditorImpl";

const ORIGINAL = "Skip to main content | Patient portal\n\nHours: 9-5";
const CLEANED = "Patient portal\n\nHours: 9-5";

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

async function mount() {
  const changes: string[] = [];
  const controller = createRef<RichEditorController>();
  await act(async () => {
    root.render(
      <RichEditorImpl value={ORIGINAL} onChange={(t) => changes.push(t)} controllerRef={controller} />,
    );
    await tick(50);
  });
  return { changes, controller };
}

it("the editor's own menu: onTextReplace(whole text) leaves exactly one copy", async () => {
  const { changes, controller } = await mount();
  expect(menuProps.onTextReplace).toBeDefined();
  await act(async () => {
    menuProps.onTextReplace!(CLEANED);
    await tick(50);
  });
  const text = controller.current!.flush();
  expect(text.trim()).toBe(CLEANED);
  expect(text.split("Hours: 9-5")).toHaveLength(2);
  expect(changes.at(-1)?.trim()).toBe(CLEANED);
  expect(container.querySelector(".ProseMirror")?.textContent).not.toContain("Skip to main content");
}, 60_000);

it("a host menu: controller.setText(whole text) leaves exactly one copy", async () => {
  const { controller } = await mount();
  await act(async () => {
    controller.current!.setText(CLEANED);
    await tick(50);
  });
  const text = controller.current!.flush();
  expect(text.trim()).toBe(CLEANED);
  expect(text.split("Patient portal")).toHaveLength(2);
}, 60_000);

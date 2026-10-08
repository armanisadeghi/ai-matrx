/**
 * In Write, a ```matrx fence shows as the chip / card readers see — through the
 * ONE shared renderer (IslandPreview → MarkdownStream → MatrxEnvelopeBlock) —
 * never as a code block with a "matrx" language picker and its JSON.
 *
 * The REAL RichEditorImpl (Visual view, real Tiptap, real node views); chrome
 * hooks are stubbed as in visual-editor-wakes.test.tsx, and MarkdownStream is a
 * marker so the test sees exactly what the shared renderer was handed.
 *
 * Breaks: the fence routed to the code-block chrome again (language picker /
 * "Edit its source") → red; a second renderer that bypasses the shared one →
 * red (the marker never receives the fence).
 */
import React, { act } from "react";
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
jest.mock("@ai-matrx/chat/ui/markdown-stream/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="shared-renderer">{content}</div>,
}));
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

const REFERENCE =
  '```matrx\n{"__kind":"directive_v1_reference_note","items":[{"id":"3f2b9c1e-6a4d-4e8f-9b2a-1c5d7e9f0a11","title":"Dock schedule"}]}\n```';
const CODE = "```python\nprint(1)\n```";
const STORED = `Trucks arrive at 6.\n\n${REFERENCE}\n\n${CODE}\n`;

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

it("a reference fence renders through the shared renderer with no code chrome", async () => {
  await act(async () => {
    root.render(<RichEditorImpl value={STORED} defaultView="visual" onChange={() => {}} />);
    await tick(100);
  });
  const reference = container.querySelector('[data-island-type="matrx"]');
  expect(reference).not.toBeNull();
  expect(reference!.querySelector('[data-testid="shared-renderer"]')?.textContent).toBe(REFERENCE);
  expect(reference!.querySelector('[aria-label="Code language"]')).toBeNull();
  expect(reference!.querySelector('[title="Edit its source"]')).toBeNull();
  // An ordinary code block keeps its code chrome (the branch is the fence's, not every fence's).
  const code = container.querySelector('[data-island-type="fence"]');
  expect(code?.querySelector('[aria-label="Code language"]')).not.toBeNull();
}, 60_000);

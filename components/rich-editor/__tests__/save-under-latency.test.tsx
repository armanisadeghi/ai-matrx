/**
 * A save under latency never persists without the typed content (verify-RC-B4 R6-4).
 *
 * The REAL RichEditorImpl (Visual view, real Tiptap) with a host shaped like
 * the Studio proving-copy host: onSave is slow, and when it settles the host
 * re-sends `value` = what was saved. The person types, presses Save, keeps
 * typing while the save is in flight, then saves again — the second save must
 * carry everything typed. Only chrome hooks (redux, toast, menus, uploads,
 * mic, preview) are stubbed.
 */
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
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
jest.mock("@/features/rich-document/RichDocument", () => ({ RichDocument: () => null }));
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

import RichEditorImpl from "@/components/rich-editor/RichEditorImpl";

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

function editorView(): { dispatchText: (text: string) => void } {
  // Tiptap hangs the editor on its DOM node; read it fresh each time (a remount replaces it).
  const current = () => {
    const prose = container.querySelector(".ProseMirror") as (HTMLElement & { editor?: import("@tiptap/core").Editor }) | null;
    if (!prose?.editor) throw new Error("the Visual editor did not mount");
    return prose.editor;
  };
  current();
  return {
    dispatchText: (text: string) => {
      const editor = current();
      // Type at the end of the handover paragraph, as a person would.
      let end = -1;
      editor.state.doc.descendants((node, pos) => {
        if (node.isTextblock && node.textContent.includes("handover")) end = pos + 1 + node.content.size;
        return true;
      });
      if (end < 0) throw new Error("the handover paragraph is gone");
      editor.view.dispatch(editor.state.tr.insertText(text, end));
    },
  };
}

it("keeps typing done while a slow save is in flight, and the next save carries it", async () => {
  const saved: string[] = [];
  let settle: (() => void) | null = null;

  function Host() {
    const [value, setValue] = useState(ORIGINAL);
    return (
      <RichEditorImpl
        value={value}
        onSave={(text) =>
          new Promise<string>((resolve) => {
            settle = () => {
              saved.push(text);
              setValue(text); // the Studio host re-sends what it stored
              resolve(text);
            };
          })
        }
      />
    );
  }

  await act(async () => {
    root.render(<Host />);
    await tick(50);
  });
  const view = editorView();
  const saveButton = () => Array.from(container.querySelectorAll("button")).find((b) => /^(Save|Saved)$/.test(b.textContent?.trim() ?? ""))!;

  await act(async () => {
    view.dispatchText(" Swap the label printer.");
    await tick(10);
  });
  await act(async () => {
    saveButton().click();
    await tick(10);
  });
  if (!settle) throw new Error(`Save did not call onSave; buttons: ${Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim()).join(" / ")}; text: ${container.querySelector(".ProseMirror")?.textContent}; toasts: ${JSON.stringify((jest.requireMock("@/lib/toast") as { toast: Record<string, jest.Mock> }).toast.info.mock.calls)} ${JSON.stringify((jest.requireMock("@/lib/toast") as { toast: Record<string, jest.Mock> }).toast.error.mock.calls)}`);
  // The save is in flight; the person keeps typing.
  await act(async () => {
    view.dispatchText(" Re-scan bay B3.");
    await tick(10);
  });
  // The slow save settles; the host re-sends the saved text.
  await act(async () => {
    settle?.();
    await tick(50);
  });
  expect(saved[0]).toBe(`${ORIGINAL} Swap the label printer.`);
  // The later typing is still in the editor…
  expect(container.querySelector(".ProseMirror")?.textContent).toContain("Re-scan bay B3.");
  // …and the next save carries it.
  await act(async () => {
    saveButton().click();
    await tick(10);
    settle?.();
    await tick(50);
  });
  expect(saved[1]).toBe(`${ORIGINAL} Swap the label printer. Re-scan bay B3.`);
}, 60_000);

it("a host that re-sends the saved text BEFORE its save promise settles never wipes later typing", async () => {
  const saved: string[] = [];
  let echo: (() => void) | null = null;
  let settle: (() => void) | null = null;

  function Host() {
    const [value, setValue] = useState(ORIGINAL);
    return (
      <RichEditorImpl
        value={value}
        onSave={(text) =>
          new Promise<string>((resolve) => {
            echo = () => {
              saved.push(text);
              setValue(text); // the host updates its record first (Studio: setCopy)…
            };
            settle = () => resolve(text); // …and only later does the save promise settle.
          })
        }
      />
    );
  }

  await act(async () => {
    root.render(<Host />);
    await tick(50);
  });
  const view = editorView();
  const saveButton = () => Array.from(container.querySelectorAll("button")).find((b) => /^(Save|Saved)$/.test(b.textContent?.trim() ?? ""))!;
  await act(async () => {
    view.dispatchText(" Swap the label printer.");
    await tick(10);
    saveButton().click();
    await tick(10);
  });
  await act(async () => {
    view.dispatchText(" Re-scan bay B3.");
    await tick(10);
  });
  // The host's echo renders (and its effects run) while the save is still in flight.
  await act(async () => {
    echo?.();
  });
  await act(async () => {
    await tick(30);
  });
  await act(async () => {
    settle?.();
    await tick(50);
  });
  expect(container.querySelector(".ProseMirror")?.textContent).toContain("Re-scan bay B3.");
  await act(async () => {
    saveButton().click();
    await tick(10);
  });
  await act(async () => {
    echo?.();
  });
  await act(async () => {
    settle?.();
    await tick(50);
  });
  expect(saved[1]).toBe(`${ORIGINAL} Swap the label printer. Re-scan bay B3.`);
}, 60_000);

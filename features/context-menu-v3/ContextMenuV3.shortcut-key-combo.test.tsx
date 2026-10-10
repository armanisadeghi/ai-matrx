/**
 * AN ADVERTISED KEY COMBO RUNS ITS SHORTCUT — as a guard.
 *
 * The break (2026-10-02 → 10-05, /notes): the "Summarize Content" menu item
 * printed "Alt+Shift+S" and pressing it in the note editor did nothing — no
 * listener existed. On macOS Option rewrites the character, so the event is
 * `key: "Í"`, `code: "KeyS"`; a `key` match would still miss it.
 *
 * SUT: the real ContextMenuV3 shell (via EditableContextMenu) and the real
 * key-combo reader. Replaced: the lazy bodies (a probe records the props the
 * shell hands them) and the store (a plain object behind ReactReduxContext).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReactReduxContext } from "react-redux";
import { EditableContextMenu } from "./EditableContextMenu";
import { NonEditableContextMenu } from "./NonEditableContextMenu";
import { parseKeyCombo, eventMatchesCombo } from "./utils/key-combo";

const mounted: Record<string, unknown>[] = [];
jest.mock("next/dynamic", () => () => (props: Record<string, unknown>) => {
  mounted.push(props);
  return null;
});
jest.mock("@ai-matrx/kit/media-query", () => ({ ...jest.requireActual("@ai-matrx/kit/media-query"), useIsMobile: () => false }));
jest.mock("@ai-matrx/chat/agents/hooks/useWidgetHandle", () => ({ useOptionalWidgetHandle: () => null }));
jest.mock("@ai-matrx/chat/agents/redux/agent-shortcuts/thunks", () => ({
  fetchUnifiedMenu: () => ({ type: "test/fetchUnifiedMenu" }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SUMMARIZE = { id: "sc-summarize", label: "Summarize Content", keyboardShortcut: "Alt+Shift+S", isActive: true };
const state = { agentShortcut: { shortcuts: { [SUMMARIZE.id]: SUMMARIZE } } };
const store = {
  getState: () => state,
  dispatch: () => Promise.resolve(),
  subscribe: () => () => undefined,
};

const macAltShiftS = { key: "Í", code: "KeyS", altKey: true, shiftKey: true, bubbles: true, cancelable: true };

describe("an advertised key combo runs its shortcut", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    mounted.length = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("matches on code, so macOS Alt+Shift+S ('Í') is Alt+Shift+S", () => {
    const combo = parseKeyCombo("Alt+Shift+S");
    expect(combo).not.toBeNull();
    expect(eventMatchesCombo(macAltShiftS as KeyboardEvent, combo!)).toBe(true);
    expect(eventMatchesCombo({ ...macAltShiftS, shiftKey: false } as KeyboardEvent, combo!)).toBe(false);
    expect(eventMatchesCombo({ ...macAltShiftS, code: "KeyD" } as KeyboardEvent, combo!)).toBe(false);
  });

  it("a combo it cannot run is not advertised (plain keys, the palette key)", () => {
    expect(parseKeyCombo("S")).toBeNull();
    expect(parseKeyCombo("Shift+S")).toBeNull();
    expect(parseKeyCombo("Ctrl+Shift+K")).toBeNull();
    expect(parseKeyCombo("Ctrl+Shift+P")).not.toBeNull();
  });

  it("pressing it in the editor runs that shortcut and types nothing", () => {
    act(() => {
      root.render(
        <ReactReduxContext.Provider value={{ store, subscription: {} } as never}>
          <EditableContextMenu sourceFeature="notes" onTextReplace={() => undefined}>
            <textarea data-testid="editor" defaultValue="Ingrid Strand — crown seat prep" />
          </EditableContextMenu>
          <NonEditableContextMenu sourceFeature="notes">
            <p>Sibling surface</p>
          </NonEditableContextMenu>
        </ReactReduxContext.Provider>,
      );
    });
    const editor = host.querySelector("textarea")!;
    editor.focus();
    // Combos answer only after a menu has been opened once on the page (nothing loads before).
    // (Opened on a sibling surface: the flag is page-wide, the editor's own shell stays closed.)
    act(() => {
      host.querySelector("p")!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    const ev = new KeyboardEvent("keydown", macAltShiftS);
    act(() => {
      editor.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    const run = mounted.find((p) => p.shortcutId === SUMMARIZE.id);
    expect(run).toBeDefined();
    expect(run?.sourceFeature).toBe("notes");
  });

  it("any other Alt combo passes through untouched", () => {
    act(() => {
      root.render(
        <ReactReduxContext.Provider value={{ store, subscription: {} } as never}>
          <EditableContextMenu sourceFeature="notes" onTextReplace={() => undefined}>
            <textarea defaultValue="x" />
          </EditableContextMenu>
        </ReactReduxContext.Provider>,
      );
    });
    const editor = host.querySelector("textarea")!;
    const ev = new KeyboardEvent("keydown", { ...macAltShiftS, code: "KeyD", key: "Î" });
    act(() => {
      editor.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(false);
    expect(mounted.some((p) => "shortcutId" in p)).toBe(false);
  });
});

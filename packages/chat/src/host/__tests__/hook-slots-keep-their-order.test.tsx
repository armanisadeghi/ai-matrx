/**
 * Guard: a host HOOK slot never changes implementation under a mounted component.
 *
 * Live 2026-10-05 (/chat/new, + > From your workspace > Notes): ErrorBoundary
 * "Cannot read properties of undefined (reading 'length')" with "change in the order of
 * Hooks ... ComposerPlusMenu" and a useMemoCache size mismatch. `useRunControlCounts` is a
 * host slot whose stand-in has no hooks while the registered hook has several; the
 * registration landing between two renders changed the component's hook count.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { registerChatUi, resetChatUiForTests, useRunControlCounts } from "../ui-slots";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ trailing }: { trailing: boolean }) {
  const counts = useRunControlCounts("c1") as { tools?: number };
  const [x] = useState(1); // a hook AFTER the slot: the one that shifts when the slot's count changes
  return <span>{String(counts.tools ?? "none")}:{x}{trailing ? "!" : ""}</span>;
}

describe("host hook slots", () => {
  let errors: jest.SpyInstance;
  beforeEach(() => {
    resetChatUiForTests();
    errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => errors.mockRestore());

  it("keeps one hook order when the slot registers after the first render", () => {
    const el = document.createElement("div");
    const root = createRoot(el);
    act(() => root.render(<Probe trailing={false} />));
    expect(el.textContent).toBe("none:1");

    registerChatUi({
      useRunControlCounts: () => {
        const [n] = useState(7);
        useEffect(() => undefined, []);
        return { tools: n };
      },
    });
    act(() => root.render(<Probe trailing />));

    const hookOrderErrors = errors.mock.calls.filter((c) => /order of Hooks|Rendered (more|fewer) hooks/.test(String(c[0])));
    expect(hookOrderErrors).toEqual([]);
    act(() => root.unmount());
  });

  it("a component mounted after registration gets the registered hook", () => {
    registerChatUi({ useRunControlCounts: () => ({ tools: 3 }) });
    const el = document.createElement("div");
    const root = createRoot(el);
    act(() => root.render(<Probe trailing={false} />));
    expect(el.textContent).toBe("3:1");
    act(() => root.unmount());
  });
});

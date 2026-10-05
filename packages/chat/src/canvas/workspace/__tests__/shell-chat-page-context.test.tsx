/**
 * A page hands the ONE chat its context (useShellChatContext) instead of
 * owning a chat. The dock reads the page on screen; leaving the page takes its
 * context away; the reader always answers with the page's LATEST state.
 */
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  resetShellChatPageContextForTest,
  useShellChatContext,
  useShellChatPageContext,
  type ShellChatPageContext,
} from "../shell-chat-page-context";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let seen: ShellChatPageContext | null = null;
let setCount: (n: number) => void = () => {};

function Dock() {
  seen = useShellChatPageContext();
  return null;
}

function Page() {
  const [count, set] = useState(1);
  setCount = set;
  useShellChatContext({
    getCanvasContext: () => ({ key: "shapes", type: "json", label: "Shapes", value: { count } }),
  });
  return null;
}

afterEach(() => {
  resetShellChatPageContextForTest();
  seen = null;
});

describe("useShellChatContext", () => {
  it("hands the dock the page's entry, always as it is now, and takes it away on leave", () => {
    const dockRoot = createRoot(document.createElement("div"));
    const pageRoot = createRoot(document.createElement("div"));
    act(() => dockRoot.render(<Dock />));
    expect(seen).toBeNull();

    act(() => pageRoot.render(<Page />));
    expect(seen?.getCanvasContext?.().value).toEqual({ count: 1 });

    act(() => setCount(7));
    expect(seen?.getCanvasContext?.().value).toEqual({ count: 7 });

    act(() => pageRoot.unmount());
    expect(seen).toBeNull();
    act(() => dockRoot.unmount());
  });

  it("a page with nothing to hand registers nothing", () => {
    function Bare() {
      useShellChatContext(null);
      return null;
    }
    const dockRoot = createRoot(document.createElement("div"));
    const pageRoot = createRoot(document.createElement("div"));
    act(() => dockRoot.render(<Dock />));
    act(() => pageRoot.render(<Bare />));
    expect(seen).toBeNull();
    act(() => pageRoot.unmount());
    act(() => dockRoot.unmount());
  });
});

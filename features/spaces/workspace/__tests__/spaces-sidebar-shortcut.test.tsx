/**
 * ⌘\ ON /spaces collapses the Spaces sidebar and does NOT also toggle the
 * shell chat (reviewer defect on f8382673d7). Spaces takes the key first
 * (capture phase) and marks it handled; the shell chat's listener — registered
 * earlier, as the shell mounts before the page — respects `defaultPrevented`.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { shellChatTakesToggleKey } from "@ai-matrx/chat/canvas/workspace/shell-chat-dock-owners";
import { useSpacesSidebarShortcut } from "../useSpacesSidebarShortcut";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function press() {
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", { key: "\\", metaKey: true, bubbles: true, cancelable: true }),
  );
}

describe("⌘\\ on /spaces", () => {
  const chatToggle = jest.fn();
  const dockListener = (e: KeyboardEvent) => {
    if (!shellChatTakesToggleKey(e)) return;
    e.preventDefault();
    chatToggle();
  };
  beforeEach(() => {
    chatToggle.mockClear();
    window.addEventListener("keydown", dockListener);
  });
  afterEach(() => window.removeEventListener("keydown", dockListener));

  it("collapses the Spaces sidebar only", () => {
    const sidebarToggle = jest.fn();
    function Spaces() {
      useSpacesSidebarShortcut(sidebarToggle);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<Spaces />));
    act(() => press());
    expect(sidebarToggle).toHaveBeenCalledTimes(1);
    expect(chatToggle).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("anywhere else it still toggles the chat", () => {
    act(() => press());
    expect(chatToggle).toHaveBeenCalledTimes(1);
  });
});

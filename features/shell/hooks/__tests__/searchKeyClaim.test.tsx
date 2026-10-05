/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const openBar = jest.fn();
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => false }));
jest.mock("@/lib/redux/slices/overlaySlice", () => ({ selectIsOverlayOpen: () => false }));
jest.mock("@/features/overlays/openers/knowledgeCommandBar", () => ({ useOpenKnowledgeCommandBar: () => openBar }));

function render(el: React.ReactElement) {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(el));
  return { unmount: () => act(() => root.unmount()) };
}
import { isSearchKeyClaimed, claimSearchKeys, searchKeyOf } from "../searchKeyClaim";
import { useClaimSearchKeys } from "../useClaimSearchKeys";
import CommandBarHotkey from "@/features/knowledge/command-bar/CommandBarHotkey";

function Claimer({ onKey }: { onKey: (k: string) => boolean | void }) {
  useClaimSearchKeys(["k", "p"], onKey);
  return null;
}

function press(key: string, init: KeyboardEventInit = { metaKey: true }) {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    window.dispatchEvent(e);
  });
  return e;
}

describe("route-owned Cmd+K / Cmd+P", () => {
  it("claims while mounted and releases on unmount", () => {
    expect(isSearchKeyClaimed("k")).toBe(false);
    const { unmount } = render(<Claimer onKey={() => {}} />);
    expect(isSearchKeyClaimed("k")).toBe(true);
    expect(isSearchKeyClaimed("P")).toBe(true);
    unmount();
    expect(isSearchKeyClaimed("k")).toBe(false);
  });

  it("runs the route handler, suppresses default, and keeps the global handler's guard true", () => {
    const seen: string[] = [];
    const { unmount } = render(<Claimer onKey={(k) => void seen.push(k)} />);
    const globalSeen = jest.fn();
    window.addEventListener("keydown", globalSeen);
    const k = press("k");
    const p = press("p", { ctrlKey: true });
    expect(seen).toEqual(["k", "p"]);
    expect(k.defaultPrevented).toBe(true);
    expect(p.defaultPrevented).toBe(true);
    expect(globalSeen).not.toHaveBeenCalled(); // stopPropagation from capture
    window.removeEventListener("keydown", globalSeen);
    unmount();
  });

  it("returning false declines the press so the global handler gets it", () => {
    const { unmount } = render(<Claimer onKey={() => false} />);
    const globalSeen = jest.fn();
    window.addEventListener("keydown", globalSeen);
    const k = press("k");
    expect(k.defaultPrevented).toBe(false);
    expect(globalSeen).toHaveBeenCalledTimes(1);
    window.removeEventListener("keydown", globalSeen);
    unmount();
  });

  it("ignores other keys and modifier combos", () => {
    const fn = jest.fn();
    const { unmount } = render(<Claimer onKey={fn} />);
    press("j");
    press("k", { metaKey: true, shiftKey: true });
    press("k", {});
    expect(fn).not.toHaveBeenCalled();
    unmount();
  });

  it("nested claims count; one release keeps the other", () => {
    const a = claimSearchKeys(["k"]);
    const b = claimSearchKeys(["k"]);
    a();
    expect(isSearchKeyClaimed("k")).toBe(true);
    b();
    expect(isSearchKeyClaimed("k")).toBe(false);
  });

  it("the global Cmd+K opens the bar, unless a route claimed it", () => {
    const bar = render(<CommandBarHotkey />);
    openBar.mockClear();
    press("k");
    expect(openBar).toHaveBeenCalledTimes(1);

    openBar.mockClear();
    const claim = render(<Claimer onKey={() => {}} />);
    press("k");
    expect(openBar).not.toHaveBeenCalled();
    claim.unmount();

    press("k");
    expect(openBar).toHaveBeenCalledTimes(1);
    bar.unmount();
  });

  it("searchKeyOf accepts Cmd/Ctrl+K/P only", () => {
    const base = { key: "K", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false };
    expect(searchKeyOf(base)).toBe("k");
    expect(searchKeyOf({ ...base, key: "P", metaKey: false, ctrlKey: true })).toBe("p");
    expect(searchKeyOf({ ...base, shiftKey: true })).toBeNull();
  });
});

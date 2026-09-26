/**
 * A peek is transient: Escape closes it wherever focus is, topmost first.
 * (Before 2026-09-26 every Dialog-based peek was a design-system WINDOW that
 * ignored Escape unless focus was inside it.)
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useTransientPeek } from "../useTransientPeek";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  roots.push(root);
  return { unmount: () => act(() => root.unmount()) };
}
function escape(key = "Escape") {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}
afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots = [];
});

function Peek({ open, onClose }: { open: boolean; onClose: () => void }) {
  useTransientPeek(open, onClose);
  return null;
}

describe("useTransientPeek", () => {
  it("closes on Escape while focus is on the page", () => {
    const onClose = jest.fn();
    render(<Peek open onClose={onClose} />);
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes only the topmost of two open peeks", () => {
    const first = jest.fn();
    const second = jest.fn();
    render(
      <>
        <Peek open onClose={first} />
        <Peek open onClose={second} />
      </>,
    );
    escape();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("does nothing when closed or for other keys", () => {
    const onClose = jest.fn();
    render(<Peek open={false} onClose={onClose} />);
    escape();
    render(<Peek open onClose={onClose} />);
    escape("Enter");
    expect(onClose).not.toHaveBeenCalled();
  });
});

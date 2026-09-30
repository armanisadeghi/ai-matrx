import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pushFullScreenLayer } from "../open-layer";

function escape(target: EventTarget = document.body): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

describe("full-screen layers — one Escape leaves only the top one", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
    document.body.innerHTML = "";
  });

  it("exits the most recently opened layer first, then the one under it", () => {
    const outer = jest.fn();
    const inner = jest.fn();
    cleanups.push(pushFullScreenLayer(outer)); // e.g. the chat workspace's full screen
    cleanups.push(pushFullScreenLayer(inner)); // then a board tile's full screen over it
    escape();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    cleanups.pop()?.(); // the inner layer closed itself
    escape();
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it("runs before content handlers, from inside a composer", () => {
    const exit = jest.fn();
    cleanups.push(pushFullScreenLayer(exit));
    const box = document.createElement("textarea");
    document.body.appendChild(box);
    const contentSaw = jest.fn();
    box.addEventListener("keydown", contentSaw);
    const e = escape(box);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(contentSaw).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
  });

  it("an open menu, popover or listbox keeps the key", () => {
    const exit = jest.fn();
    cleanups.push(pushFullScreenLayer(exit));
    document.body.innerHTML = '<div data-radix-popper-content-wrapper><div role="menu"></div></div>';
    escape();
    expect(exit).not.toHaveBeenCalled();
  });

  it("with no layer open, Escape is left alone", () => {
    const e = escape();
    expect(e.defaultPrevented).toBe(false);
  });

  it("while any full-screen layer is open the page is marked, so top toasts clear its exit bar", () => {
    expect(document.documentElement.dataset.fullScreenLayer).toBeUndefined();
    const popOuter = pushFullScreenLayer(jest.fn());
    const popInner = pushFullScreenLayer(jest.fn());
    expect(document.documentElement.dataset.fullScreenLayer).toBe("open");
    popInner();
    expect(document.documentElement.dataset.fullScreenLayer).toBe("open");
    popOuter();
    expect(document.documentElement.dataset.fullScreenLayer).toBeUndefined();
  });

  it("the stylesheet moves top toasts below the exit bar while a layer is open", () => {
    const css = readFileSync(join(__dirname, "../../../../app/globals.css"), "utf8");
    expect(css).toMatch(/html\[data-full-screen-layer\][^{]*\[data-sonner-toaster\]\[data-y-position="top"\][^{]*\{[^}]*top:[^}]*!important/);
  });
});

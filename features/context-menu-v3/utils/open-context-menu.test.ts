import { openContextMenuForElement } from "./open-context-menu";

describe("openContextMenuForElement", () => {
  it("dispatches the bubbling right-click gesture used by ContextMenuV3", () => {
    const parent = document.createElement("div");
    const row = document.createElement("div");
    parent.appendChild(row);
    document.body.appendChild(parent);
    row.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 20,
        width: 100,
        height: 40,
      }) as DOMRect;

    const rowHandler = jest.fn();
    const parentHandler = jest.fn();
    row.addEventListener("contextmenu", rowHandler);
    parent.addEventListener("contextmenu", parentHandler);

    openContextMenuForElement(row);

    expect(rowHandler).toHaveBeenCalledTimes(1);
    expect(parentHandler).toHaveBeenCalledTimes(1);
    const event = rowHandler.mock.calls[0][0] as MouseEvent;
    expect(event.button).toBe(2);
    expect(event.buttons).toBe(2);
    expect(event.clientX).toBe(60);
    expect(event.clientY).toBe(40);
    expect(event.bubbles).toBe(true);
    expect(event.cancelable).toBe(true);

    parent.remove();
  });

  it("is a no-op before a row ref is available", () => {
    expect(() => openContextMenuForElement(null)).not.toThrow();
  });
});

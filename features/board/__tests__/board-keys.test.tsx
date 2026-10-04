import { act } from "react";
import { createRoot } from "react-dom/client";
import { useBoardKeys } from "../board/useBoardKeys";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(deleteSelected: jest.Mock) {
  function Probe() {
    useBoardKeys({ undo: jest.fn(), redo: jest.fn(), deleteSelected, enabled: () => true });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  return root;
}

function key(target: EventTarget, k: string) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
}

describe("useBoardKeys — Delete belongs to the board, never to tile content", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("Backspace on the page takes the selected tile off", () => {
    const del = jest.fn();
    const root = mount(del);
    key(document.body, "Backspace");
    expect(del).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("Backspace in a grid cell or a Monaco EditContext inside a tile does nothing to the board", () => {
    const del = jest.fn();
    const root = mount(del);
    const body = document.createElement("div");
    body.setAttribute("data-spatial-body", "");
    const cell = document.createElement("div");
    cell.setAttribute("role", "gridcell");
    body.appendChild(cell);
    const monaco = document.createElement("div");
    Object.defineProperty(monaco, "editContext", { value: {} });
    body.appendChild(monaco);
    document.body.appendChild(body);
    key(cell, "Backspace");
    key(monaco, "Delete");
    expect(del).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});

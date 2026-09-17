// 🚨 ARROWS MOVE BETWEEN RECORDS (Arman, 2026-09-17: "Escape closes, ARROWS
// move between records, Cmd+Enter saves").
//
// The hook bound `[` and `]` only, so the binding he asked for did nothing
// (VERIFY-U-P1: "Arrows move between records — Not met"). Arrows are now the
// primary binding and the brackets are aliases; both are read only when focus
// is outside an editable, where an arrow belongs to the caret.
//
// Cmd/Ctrl+Enter is asserted here too, because until this branch NOTHING in
// the repo called `registerSave` and the chord saved nothing anywhere.

import * as React from "react";
import { act } from "react";

import { useDetailKeyboard, type DetailKeyboard } from "../useDetailKeyboard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot } from "react-dom/client";

function setup(handlers: {
  onClose?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let keyboard: DetailKeyboard | null = null;
  function Harness() {
    const kb = useDetailKeyboard(handlers);
    keyboard = kb;
    return (
      <div {...kb.rootProps} data-root>
        <input aria-label="a field" />
        <button type="button">plain</button>
      </div>
    );
  }
  act(() => root.render(<Harness />));
  const rootEl = container.querySelector("[data-root]") as HTMLElement;
  const field = container.querySelector("input") as HTMLInputElement;
  const button = container.querySelector("button") as HTMLButtonElement;
  const press = (key: string, target: HTMLElement = button, init: KeyboardEventInit = {}) => {
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
    });
  };
  return {
    press,
    rootEl,
    field,
    button,
    get keyboard() {
      return keyboard as DetailKeyboard;
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("the detail keyboard model", () => {
  it("moves on the arrows, in both axes", () => {
    const onPrev = jest.fn();
    const onNext = jest.fn();
    const h = setup({ onPrev, onNext });

    h.press("ArrowUp");
    h.press("ArrowLeft");
    expect(onPrev).toHaveBeenCalledTimes(2);

    h.press("ArrowDown");
    h.press("ArrowRight");
    expect(onNext).toHaveBeenCalledTimes(2);
    h.unmount();
  });

  it("keeps the brackets as aliases", () => {
    const onPrev = jest.fn();
    const onNext = jest.fn();
    const h = setup({ onPrev, onNext });
    h.press("[");
    h.press("]");
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  it("leaves arrows alone inside a field, and when a modifier is held", () => {
    const onPrev = jest.fn();
    const onNext = jest.fn();
    const h = setup({ onPrev, onNext });

    h.press("ArrowUp", h.field);
    h.press("ArrowDown", h.field);
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();

    h.press("ArrowDown", h.button, { metaKey: true });
    h.press("ArrowUp", h.button, { altKey: true });
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
    h.unmount();
  });

  it("closes on Escape outside a field", () => {
    const onClose = jest.fn();
    const h = setup({ onClose });
    h.press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    h.press("Escape", h.field);
    expect(onClose).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  it("saves on Cmd/Ctrl+Enter once something registers a save — including from inside a field", () => {
    const h = setup({});
    const save = jest.fn();
    expect(h.keyboard.hasSave()).toBe(false);

    let unregister: (() => void) | null = null;
    act(() => {
      unregister = h.keyboard.registerSave(save);
    });
    expect(h.keyboard.hasSave()).toBe(true);

    h.press("Enter", h.field, { metaKey: true });
    h.press("Enter", h.button, { ctrlKey: true });
    expect(save).toHaveBeenCalledTimes(2);

    act(() => unregister?.());
    h.press("Enter", h.button, { metaKey: true });
    expect(save).toHaveBeenCalledTimes(2);
    h.unmount();
  });
});

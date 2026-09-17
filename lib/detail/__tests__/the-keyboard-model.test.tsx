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
      // The shells put the detail inside their own scroll area, so the harness
      // does too — `data-scroller` is the element a test makes scrollable.
      <div data-scroller style={{ overflowY: "auto" }}>
        <div {...kb.rootProps} data-root>
          {/* An expanded Collapsible / Accordion section inside a record type's
              own body — the shape NEW-11 was reproduced with. */}
          <div data-state="open">
            <button type="button" data-inside-open-section>
              inside an expanded section
            </button>
          </div>
          {/* A closed combobox input: expanded is false, so Escape is the detail's. */}
          <input aria-label="a closed combobox" role="combobox" aria-expanded="false" />
          {/* An OPEN menu's item, in a Radix popper layer. */}
          <div data-radix-popper-content-wrapper>
            <div role="menu">
              <button type="button" role="menuitem" data-inside-open-menu>
                an item in an open menu
              </button>
            </div>
          </div>
          {/* The trigger of an open menu, which owns Escape itself. */}
          <button type="button" aria-haspopup="menu" aria-expanded="true" data-open-menu-trigger>
            an open menu's trigger
          </button>
          <input aria-label="a field" />
          <input type="checkbox" aria-label="a checkbox" />
          <select aria-label="a select">
            <option>one</option>
          </select>
          <button type="button" data-plain>plain</button>
        </div>
      </div>
    );
  }
  act(() => root.render(<Harness />));
  const rootEl = container.querySelector("[data-root]") as HTMLElement;
  const scroller = container.querySelector("[data-scroller]") as HTMLElement;
  const field = container.querySelector("input[aria-label='a field']") as HTMLInputElement;
  const checkbox = container.querySelector("input[type='checkbox']") as HTMLInputElement;
  const select = container.querySelector("select") as HTMLSelectElement;
  const button = container.querySelector("button[data-plain]") as HTMLButtonElement;
  const q = <T extends HTMLElement>(selector: string) =>
    container.querySelector(selector) as T;
  const press = (key: string, target: HTMLElement = button, init: KeyboardEventInit = {}) => {
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
    });
  };
  /** Make the detail body a real scroll target, the way a long record is. */
  const bodyScrolls = (yes: boolean) => {
    Object.defineProperty(scroller, "scrollHeight", { value: yes ? 2000 : 300, configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 300, configurable: true });
  };
  return {
    press,
    rootEl,
    scroller,
    bodyScrolls,
    field,
    checkbox,
    select,
    button,
    q,
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
    h.unmount();
  });

  // 🚨 NEW-6 (VERIFY-U-P1-R2) — ESCAPE IS NOT SWALLOWED BY A CHECKBOX. Every
  // INPUT counted as a typing target, and the presentation pane's "Only for
  // file records" control is an `<input type="checkbox">`: Escape pressed from
  // it closed nothing, so the one keyboard escape hatch was gone in the one
  // place a person is most likely to be tabbing around.
  it("closes on Escape from a control that is not a text field (NEW-6)", () => {
    const onClose = jest.fn();
    const h = setup({ onClose });
    h.press("Escape", h.checkbox);
    expect(onClose).toHaveBeenCalledTimes(1);
    h.press("Escape", h.button);
    expect(onClose).toHaveBeenCalledTimes(2);
    h.unmount();
  });

  it("leaves Escape to a text field with uncommitted edits, and to a select", () => {
    const onClose = jest.fn();
    const h = setup({ onClose });

    // Untouched: there is nothing to undo, so Escape means "close this".
    h.press("Escape", h.field);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Edited: Escape belongs to the field (revert), not to the presentation.
    h.field.value = "half a sentence";
    h.press("Escape", h.field);
    expect(onClose).toHaveBeenCalledTimes(1);

    // A select may have its list open, and jsdom cannot tell us — the control keeps it.
    h.press("Escape", h.select);
    expect(onClose).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  // 🚨 NEW-5 (VERIFY-U-P1-R2) — THE ARROWS DO NOT COST THE BODY ITS SCROLLING.
  // With a list context every ArrowUp/ArrowDown was `preventDefault`ed, so a
  // keyboard-only reader could not scroll a long dossier at all. The ruling
  // (Linear and Notion peeks behave the same): arrows move between records only
  // when the body is NOT the scroll target; when it is, they scroll it and the
  // brackets stay the always-available record navigation.
  describe("arrows versus reading a long record", () => {
    it("scrolls instead of moving when the detail body can scroll", () => {
      const onPrev = jest.fn();
      const onNext = jest.fn();
      const h = setup({ onPrev, onNext });
      h.bodyScrolls(true);

      h.press("ArrowDown");
      h.press("ArrowUp");

      expect(onNext).not.toHaveBeenCalled();
      expect(onPrev).not.toHaveBeenCalled();
      // And the browser is left to do the scrolling.
      const event = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
      act(() => {
        h.button.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(false);
      h.unmount();
    });

    it("keeps the brackets moving between records even then", () => {
      const onPrev = jest.fn();
      const onNext = jest.fn();
      const h = setup({ onPrev, onNext });
      h.bodyScrolls(true);

      h.press("[");
      h.press("]");

      expect(onPrev).toHaveBeenCalledTimes(1);
      expect(onNext).toHaveBeenCalledTimes(1);
      h.unmount();
    });

    it("moves on the arrows when the record is short enough to need no scrolling", () => {
      const onNext = jest.fn();
      const h = setup({ onNext });
      h.bodyScrolls(false);

      h.press("ArrowDown");

      expect(onNext).toHaveBeenCalledTimes(1);
      h.unmount();
    });
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

// 🚨 NEW-11 (VERIFY-U-P1-R3) — ESCAPE IS OWNED BY THE CONTROLS THAT ACTUALLY
// OWN IT, NOT BY ANYTHING EXPANDED.
//
// Reproduced at `e64a912f`: the predicate matched any ANCESTOR carrying
// `data-state="open"` or `aria-expanded="true"`, so an expanded Collapsible or
// Accordion section in a record type's own body — and a Drawer's content, which
// is what the docked and window presentations are on a phone — swallowed Escape
// for everything inside it. The chair's ruling was "an open menu/select or a
// text field with uncommitted edits".
describe("who owns Escape", () => {
  it("closes from inside an expanded Collapsible / Accordion section", () => {
    const onClose = jest.fn();
    const h = setup({ onClose });
    h.press("Escape", h.q("[data-inside-open-section]"));
    expect(onClose).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  it("closes from a combobox input that is not open", () => {
    const onClose = jest.fn();
    const h = setup({ onClose });
    h.press("Escape", h.q("input[role='combobox']"));
    expect(onClose).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  it("leaves Escape to an OPEN menu's item", () => {
    const onClose = jest.fn();
    const h = setup({ onClose });
    h.press("Escape", h.q("[data-inside-open-menu]"));
    expect(onClose).not.toHaveBeenCalled();
    h.unmount();
  });

  it("leaves Escape to the trigger of a menu that is open", () => {
    const onClose = jest.fn();
    const h = setup({ onClose });
    h.press("Escape", h.q("[data-open-menu-trigger]"));
    expect(onClose).not.toHaveBeenCalled();
    h.unmount();
  });
});

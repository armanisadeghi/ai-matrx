// 🚨 NEW-22 (VERIFY-U-P1-R4, residue found in R5) — ESCAPE ANSWERS FROM THE
// SHELL'S OWN CHROME, IN ALL THREE PRESENTATIONS.
//
// Round 4 bound the keyboard model on every slot the PRESENTATION fills
// (`data-detail-root`, `data-detail-keyboard-slot`). Round 5 found what was left:
// `WindowPanel`'s close / minimize / pop-out buttons, `SidePanelSurface`'s close
// button and drag handle and the page's `RouteHeader` render OUTSIDE those slots,
// in a portal, and neither component contains any keystroke handling — while
// `DetailDockedShell`'s own header comment told the next agent that the docked
// panel closes on Escape. A comment that lies about the code beneath it is the
// sentence a future agent trusts.
//
// The behaviour chosen is the one `@ai-matrx/detail`'s keyboard model specifies:
// "Escape → close", from any control inside the detail — chrome included. The
// exclusions are the model's own two: something OPEN over the detail, and a text
// field holding uncommitted edits.
//
// Red before `useShellChromeEscape` existed: the hook did not exist and no shell
// called it (the second test here is the census that holds all three).

import { readFileSync } from "node:fs";
import path from "node:path";

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { useShellChromeEscape } from "../shells/useShellChromeEscape";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ onClose }: { onClose: () => void }) {
  useShellChromeEscape(onClose);
  return (
    <div>
      {/* The shell's chrome: outside every slot the primitive binds. */}
      <button type="button" data-chrome-close aria-label="Close">
        ×
      </button>
      {/* The primitive's own root, which answers for itself. */}
      <div data-detail-root tabIndex={-1}>
        <input data-dirty defaultValue="before" />
        <select data-select>
          <option>a</option>
        </select>
      </div>
      <input data-outside-dirty defaultValue="before" />
    </div>
  );
}

function mount(onClose: () => void) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Harness onClose={onClose} />));
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function pressEscape(target: Element, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe("Escape from the shell's own chrome", () => {
  it("closes the detail when the keystroke lands on the chrome", () => {
    const onClose = jest.fn();
    const m = mount(onClose);
    pressEscape(m.container.querySelector("[data-chrome-close]")!);
    expect(onClose).toHaveBeenCalledTimes(1);
    m.unmount();
  });

  it("never answers for a keystroke inside the primitive's own slots", () => {
    const onClose = jest.fn();
    const m = mount(onClose);
    // The presentation's capture handler owns these, and it is the one that knows
    // when Escape belongs to the control instead. Answering here too would close
    // a detail whose dirty field just meant "put it back".
    pressEscape(m.container.querySelector("[data-detail-root]")!);
    pressEscape(m.container.querySelector("[data-dirty]")!);
    expect(onClose).not.toHaveBeenCalled();
    m.unmount();
  });

  it("does not answer a second time for an event the primitive already consumed", () => {
    const onClose = jest.fn();
    const m = mount(onClose);
    const chrome = m.container.querySelector("[data-chrome-close]")!;
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    // `preventDefault()` is exactly what the primitive's handler calls when it
    // closes; an event carrying it has been answered already.
    event.preventDefault();
    act(() => {
      chrome.dispatchEvent(event);
    });
    expect(onClose).not.toHaveBeenCalled();
    m.unmount();
  });

  it("leaves Escape to a text field holding uncommitted edits", () => {
    const onClose = jest.fn();
    const m = mount(onClose);
    const field = m.container.querySelector<HTMLInputElement>("[data-outside-dirty]")!;
    field.value = "after";
    pressEscape(field);
    expect(onClose).not.toHaveBeenCalled();
    // …and answers once the field is back to what it was (control).
    field.value = "before";
    pressEscape(field);
    expect(onClose).toHaveBeenCalledTimes(1);
    m.unmount();
  });

  it("leaves Escape to an open select", () => {
    const onClose = jest.fn();
    const m = mount(onClose);
    pressEscape(m.container.querySelector("[data-select]")!);
    expect(onClose).not.toHaveBeenCalled();
    m.unmount();
  });

  it("ignores a modified Escape (the browser's, not ours)", () => {
    const onClose = jest.fn();
    const m = mount(onClose);
    pressEscape(m.container.querySelector("[data-chrome-close]")!, { metaKey: true });
    expect(onClose).not.toHaveBeenCalled();
    m.unmount();
  });

  it("stops answering once the shell unmounts", () => {
    const onClose = jest.fn();
    const m = mount(onClose);
    const chrome = m.container.querySelector("[data-chrome-close]")!;
    m.unmount();
    document.body.appendChild(chrome);
    pressEscape(chrome);
    expect(onClose).not.toHaveBeenCalled();
    chrome.remove();
  });

  // 🚨 THE CLASS, NOT THE INSTANCE. Round 4 fixed the slots and left the chrome;
  // this is the census that all THREE shells answer, so a fourth shell cannot be
  // added without it — and so the docked shell's comment cannot drift back into a
  // claim nothing implements.
  it("is called by all three shells, each with its own exit", () => {
    const shells = path.resolve(__dirname, "../shells");
    const expectations: [string, string][] = [
      ["DetailWindowShell.tsx", "useShellChromeEscape(onClose)"],
      ["DetailDockedShell.tsx", "useShellChromeEscape(onClose)"],
      // The page's exit is the ONE guarded exit (D1), never a raw close.
      ["DetailPageShell.tsx", "useShellChromeEscape(onBack)"],
    ];
    const missing = expectations.filter(
      ([file, call]) => !readFileSync(path.join(shells, file), "utf8").includes(call),
    );
    expect(missing).toEqual([]);
  });
});

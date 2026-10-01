// verify-6 #3 (2026-10-01): the flashcards "Number of cards" field showed
// "04". A number field bound straight to a number state turns a cleared field
// into "0" (parseInt("") || 0), and the next keystroke lands after it: "04",
// which React leaves because "04" == 4. ClampedNumberInput keeps a text draft,
// so clearing leaves the field empty and the next keystroke reads "4".

import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ClampedNumberInput, clampDraft } from "../ClampedNumberInput";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const setNativeValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

/** What the browser does when the person clears the field and types "4". */
function clearThenType4(input: HTMLInputElement) {
  setNativeValue(input, "");
  const afterClear = input.value;
  setNativeValue(input, `${input.value}4`);
  return { afterClear, afterTyping: input.value };
}

/** The old binding (CreateDeckPage / AddMoreCardsButton before 2026-10-01). */
function OldBinding() {
  const [count, setCount] = useState(10);
  return (
    <input
      type="number"
      value={count}
      onChange={(e) => setCount(Number.parseInt(e.target.value, 10) || 0)}
    />
  );
}

describe("ClampedNumberInput", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("the old binding is the bug: a cleared field reads 0 and typing 4 reads 04", () => {
    act(() => root.render(<OldBinding />));
    const { afterClear, afterTyping } = clearThenType4(host.querySelector("input")!);
    expect(afterClear).toBe("0");
    expect(afterTyping).toBe("04");
  });

  it("clearing leaves the field empty, typing 4 reads 4, and blur commits 4", () => {
    const changes: number[] = [];
    function Host() {
      const [count, setCount] = useState(10);
      return (
        <ClampedNumberInput
          min={1}
          max={50}
          value={count}
          onChange={(n) => {
            changes.push(n);
            setCount(n);
          }}
        />
      );
    }
    act(() => root.render(<Host />));
    const input = host.querySelector("input")!;
    const { afterClear, afterTyping } = clearThenType4(input);
    expect(afterClear).toBe("");
    expect(afterTyping).toBe("4");
    act(() => {
      input.focus();
      input.blur();
    });
    expect(input.value).toBe("4");
    expect(changes).toEqual([4]);
  });

  it("clamps to the range and restores the last value when the draft is not a number", () => {
    expect(clampDraft("04", 1, 50)).toBe(4);
    expect(clampDraft("0", 1, 50)).toBe(1);
    expect(clampDraft("900", 1, 50)).toBe(50);
    expect(clampDraft("900", 1, null)).toBe(900);
    expect(clampDraft("", 1, 50)).toBeNull();
  });
});

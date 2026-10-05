/**
 * A VARIABLE KEEPS ITS AUTHOR'S RULES (2026-10-04, found by the variables sweep on
 * /agents/<id>/run). RED before:
 *   - number: an agent declared min 10 / max 50; typing past it ("3012") stayed 3012 —
 *     only the − / + buttons honoured the limits.
 *   - checkbox: the agent's default "Saturday, Sunday" showed in the row but NO box was
 *     ticked, and ticking Monday saved "Saturday, Sunday\nMonday".
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { NumberInput } from "../NumberInput";
import { CheckboxGroupInput } from "../CheckboxGroupInput";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

it("brings a typed number back inside the agent's min and max when the field is left", () => {
  const changes: string[] = [];
  act(() =>
    root.render(
      <NumberInput value="3012" onChange={(v) => changes.push(v)} min={10} max={50} step={2} variableName="cards" />,
    ),
  );
  const input = host.querySelector("input") as HTMLInputElement;
  act(() => {
    input.focus();
    input.blur();
  });
  expect(changes.at(-1)).toBe("50");
});

it("leaves an in-range number alone", () => {
  const changes: string[] = [];
  act(() =>
    root.render(<NumberInput value="30" onChange={(v) => changes.push(v)} min={10} max={50} variableName="cards" />),
  );
  const input = host.querySelector("input") as HTMLInputElement;
  act(() => {
    input.focus();
    input.blur();
  });
  expect(changes).toEqual([]);
});

it("ticks the boxes of a comma-written default and saves one choice per line", () => {
  const changes: string[] = [];
  const days = ["Monday", "Saturday", "Sunday"];
  act(() =>
    root.render(
      <CheckboxGroupInput value="Saturday, Sunday" onChange={(v) => changes.push(v)} options={days} variableName="days" />,
    ),
  );
  const boxes = Array.from(host.querySelectorAll('[role="checkbox"]'));
  const checked = boxes.map((box) => box.getAttribute("aria-checked") === "true" || box.getAttribute("data-state") === "checked");
  expect(checked).toEqual([false, true, true]);
  act(() => (boxes[0] as HTMLElement).click());
  expect(changes.at(-1)).toBe("Saturday\nSunday\nMonday");
});

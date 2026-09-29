/**
 * The compact composer's input cap (Amendment 1, A5): the textarea grows to
 * the `compact_input_max_height_pct` share of the PANEL the host measures,
 * and every compact host (canvas chat, Quick Chat, the Chat window, the
 * builder's test panel, a record chat, AskTutor) reads it from the ONE hook.
 *
 * Proven failing before passing: with the knob answering 40, a 500px panel
 * must cap at 200px — the canvas's former inline copy is what this replaced,
 * and a host that forgot to attach `measureRef` stays at `undefined` (the
 * classic 200px cap), never 0.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let knob: unknown = 40;
jest.mock("@/lib/scoped-config/sessionKnob", () => ({
  useSessionKnob: () => knob,
}));

import { useCompactInputMaxHeight } from "../composer/useCompactInputMaxHeight";

type ObserverCallback = () => void;
const observers: ObserverCallback[] = [];

class FakeResizeObserver {
  constructor(private cb: ObserverCallback) {
    observers.push(cb);
  }
  observe() {
    this.cb();
  }
  disconnect() {}
  unobserve() {}
}

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let seen: number | undefined | "unset" = "unset";

function Host({ attach, height }: { attach: boolean; height: number }) {
  const { measureRef, maxInputHeightPx } = useCompactInputMaxHeight();
  seen = maxInputHeightPx;
  return (
    <div
      ref={(el) => {
        if (el) Object.defineProperty(el, "clientHeight", { configurable: true, value: height });
        if (attach) measureRef(el);
      }}
    />
  );
}

describe("useCompactInputMaxHeight", () => {
  let container: HTMLDivElement;
  let root: Root;
  const realObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    seen = "unset";
    knob = 40;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = realObserver;
  });

  it("caps at the knob's share of the measured panel", () => {
    act(() => root.render(<Host attach height={500} />));
    expect(seen).toBe(200);
  });

  it("falls back to 50% when the knob has not answered", () => {
    knob = undefined;
    act(() => root.render(<Host attach height={500} />));
    expect(seen).toBe(250);
  });

  it("is undefined (the classic cap) until a panel is measured — never 0", () => {
    act(() => root.render(<Host attach={false} height={500} />));
    expect(seen).toBeUndefined();
  });
});

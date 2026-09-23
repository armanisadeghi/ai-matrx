/**
 * A COUNT OF ONE IS SINGULAR — cold walk 22 (friction).
 *
 * The Bench's statistics bar read "1 paragraphs": every label on the bar was
 * one fixed plural string. The guard renders the real `PlainTextMetricsBar`
 * at full width (every label spelled out) and collapsed (the one-chip form)
 * and asserts no count of one is followed by a plural unit.
 *
 * RED before the fix: "1 lines" and "1 paragraphs" at full width, "1 chars"
 * collapsed.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { PlainTextMetricsBar } from "../PlainTextMetricsBar";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
  TestResizeObserver;

let host: HTMLDivElement;
let root: Root;
let width = 600;
const original = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "clientWidth",
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => width,
  });
});
afterAll(() => {
  if (original)
    Object.defineProperty(HTMLElement.prototype, "clientWidth", original);
});

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(text: string): string {
  act(() => root.render(<PlainTextMetricsBar text={text} />));
  // Each chip read on its own, spaced, so "1 line" and "1 paragraph" are
  // separate phrases rather than one run of text.
  const chips = Array.from(host.querySelectorAll("span.whitespace-nowrap, button"));
  return chips.map((chip) => (chip.textContent ?? "").replace(/(\d)([a-z])/gi, "$1 $2")).join(" | ");
}

const PLURAL_AFTER_ONE =
  /(?<![\d,.])1\s+(chars|words|lines|paragraphs|non-space chars)\b/;

describe("the statistics bar agrees in number", () => {
  it("full width: one line, one paragraph — never '1 lines' or '1 paragraphs'", () => {
    width = 600;
    const text = render("Regrout the shower");
    expect(text).not.toMatch(PLURAL_AFTER_ONE);
    expect(text).toMatch(/1\s*line\b/);
    expect(text).toMatch(/1\s*paragraph\b/);
    expect(text).toMatch(/3\s*words\b/);
  });

  it("full width: a single word is '1 word'", () => {
    width = 600;
    const text = render("greenboard");
    expect(text).not.toMatch(PLURAL_AFTER_ONE);
    expect(text).toMatch(/1\s*word\b/);
  });

  it("collapsed: a single character is '1 char'", () => {
    width = 100;
    const text = render("a");
    expect(text).not.toMatch(PLURAL_AFTER_ONE);
    expect(text).toMatch(/1\s*char\b/);
  });
});

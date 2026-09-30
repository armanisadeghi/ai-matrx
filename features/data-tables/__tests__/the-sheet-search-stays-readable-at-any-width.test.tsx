/**
 * THE SHEET'S SEARCH STAYS READABLE AT ANY WIDTH (BREAKER-2 B2-33, BREAKER-3 B3-26b).
 *
 * MEASURED at 390 px (2026-09-30): with the "Your look" chip in the Sheet toolbar the search field
 * shrank until it read "Sea". The box now reads the room its slot has: "Search rows" fits → the
 * field; it does not → a search button that opens the field across the row, folds back when left
 * empty, and shows a dot while a search is active.
 *
 * THE REAL USE CASE: the Cedar Ridge front desk opens the referral log on a phone and looks for
 * "Delgado".
 *
 * RED PROOF: the toolbar's old search was an always-on field with no width reading at all, so there
 * is no older component to run this against in jsdom; the red half is the live 390 px measurement
 * recorded in the lane report (field room below what "Search rows" needs). This suite holds the
 * folding rule itself.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { SEARCH_FIELD_ROOM, SheetSearchBox } from "@/features/data-tables/components/SheetSearchBox";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A ResizeObserver that reports the slot at the width each test sets. */
let slotWidth = 300;
const observers: Array<{ cb: ResizeObserverCallback; el: Element }> = [];
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
  cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(el: Element) {
    observers.push({ cb: this.cb, el });
    this.cb([{ contentRect: { width: slotWidth } } as ResizeObserverEntry], this as never);
  }
  unobserve() {}
  disconnect() {}
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  observers.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function Harness({ initial = "" }: { initial?: string }) {
  const [term, setTerm] = React.useState(initial);
  return (
    <div style={{ position: "relative" }}>
      <SheetSearchBox searchTerm={term} onSearchTermChange={setTerm} onSubmit={(e) => e.preventDefault()} onClear={() => setTerm("")} />
    </div>
  );
}

const field = () => host.querySelector('input[placeholder="Search rows"]') as HTMLInputElement | null;
const searchButton = () => host.querySelector('button[aria-label="Search rows"]') as HTMLButtonElement | null;

describe("the Sheet's search box", () => {
  it("is the field when 'Search rows' fits", () => {
    slotWidth = 300;
    act(() => root.render(<Harness />));
    expect(field()).not.toBeNull();
    expect(searchButton()).toBeNull();
  });

  it("is a search button — never a cut 'Sea' — when the slot is narrower than the words", () => {
    slotWidth = SEARCH_FIELD_ROOM - 40;
    act(() => root.render(<Harness />));
    expect(field()).toBeNull();
    expect(searchButton()).not.toBeNull();
  });

  it("opens the field across the row on a tap, focused, and folds back when left empty", () => {
    slotWidth = 90;
    act(() => root.render(<Harness />));
    act(() => searchButton()!.click());
    const input = field();
    expect(input).not.toBeNull();
    expect(input!.closest(".absolute")).not.toBeNull();
    expect(document.activeElement).toBe(input);
    act(() => {
      input!.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(field()).toBeNull();
  });

  it("shows an active search on the folded button, so a filtered Sheet never looks unfiltered", () => {
    slotWidth = 90;
    act(() => root.render(<Harness initial="Delgado" />));
    expect(searchButton()!.getAttribute("title")).toContain("Delgado");
    expect(searchButton()!.querySelector("span.rounded-full")).not.toBeNull();
  });
});

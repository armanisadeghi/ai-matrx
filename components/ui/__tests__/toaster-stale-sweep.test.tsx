/**
 * ── A TOAST MUST NEVER BECOME A CLICK SHIELD (FIX-11b) ────────────────────────
 *
 * THE DEFECT, measured on production while diagnosing a "the second save did
 * nothing / then broke" report: sonner PAUSES a toast's dismiss timer while the
 * document is hidden, so in a background tab nothing ever expires and toasts
 * stack. Nine were stacked at once, and `document.elementFromPoint()` at the
 * centre of the shortcut editor's sticky-footer Save button returned the sonner
 * `<li>` rather than the button. The control was enabled, looked alive, and
 * silently ate the click — a dead control wearing an honest face.
 *
 * THE RULE, which is this campaign's own (FIX-9): the toast is the courtesy,
 * the panel is the record. A notice nobody could see has already failed at
 * being a notice; leaving it on top of the page's primary action is worse than
 * dropping it. So the BACKLOG is swept when the tab returns — and only the
 * backlog: a toast raised while visible has a running timer and is untouched.
 *
 * 🚨 RED-THEN-GREEN: delete `useStaleToastSweepOnReturn()` from `Toaster` (or
 * its `toast.dismiss()` call) and the first two cases fail; the last two are
 * the anti-vacuity half and pass either way, which is the point of them.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const dismiss = jest.fn();

jest.mock("sonner", () => ({
  __esModule: true,
  Toaster: (props: Record<string, unknown>) => <div data-testid="sonner" {...{}} />,
  toast: { dismiss: (...args: unknown[]) => dismiss(...args) },
}));

jest.mock("@/styles/themes/useThemeMode", () => ({
  __esModule: true,
  useThemeMode: () => "light",
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Toaster } = require("../sonner") as typeof import("../sonner");

let host: HTMLDivElement;
let root: Root;
let visibility: DocumentVisibilityState = "visible";
let warn: jest.SpyInstance;

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

/** N toasts on screen, exactly as sonner marks them. */
function stackToasts(n: number) {
  for (let i = 0; i < n; i += 1) {
    const li = document.createElement("li");
    li.setAttribute("data-sonner-toast", "");
    document.body.appendChild(li);
  }
}

beforeEach(() => {
  dismiss.mockClear();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(<Toaster />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.querySelectorAll("li[data-sonner-toast]").forEach((li) => li.remove());
  warn.mockRestore();
  jest.useRealTimers();
});

describe("stale toasts are swept when the tab comes back", () => {
  it("dismisses the backlog that could not expire while hidden", () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(1_000_000);
    setVisibility("hidden");
    stackToasts(9);
    now.mockReturnValue(1_060_000); // a minute in the background
    setVisibility("visible");

    expect(dismiss).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  it("says what it did and why — a sweep is never silent", () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(2_000_000);
    setVisibility("hidden");
    stackToasts(3);
    now.mockReturnValue(2_060_000);
    setVisibility("visible");

    const said = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(said).toContain("dismissed 3 toast(s)");
    expect(said).toContain("swallows clicks");
    now.mockRestore();
  });

  it("leaves a tab flicker alone — under a second is not a backlog", () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(3_000_000);
    setVisibility("hidden");
    stackToasts(2);
    now.mockReturnValue(3_000_400);
    setVisibility("visible");

    expect(dismiss).not.toHaveBeenCalled();
    now.mockRestore();
  });

  it("does nothing when there was no backlog to sweep", () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(4_000_000);
    setVisibility("hidden");
    now.mockReturnValue(4_060_000);
    setVisibility("visible");

    expect(dismiss).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    now.mockRestore();
  });
});

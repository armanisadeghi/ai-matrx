/**
 * A DIALOG'S PRIMARY ACTION IS ALWAYS PRESSABLE (V1 round 4, R4-1).
 *
 * 🚨 THE DEFECT: the admin Create Category dialog rendered **851px tall in a
 * 657px viewport** with `overflow-y: visible`. Its Create button sat below the
 * fold with no way to scroll to it, and the only exit — a backdrop click —
 * dismisses WITHOUT writing, which from the person's side is indistinguishable
 * from a save that silently failed.
 *
 * 🚨 THE CLASS, not the instance: `DialogContent`'s MOBILE branch has carried
 * the law since it was written ("a short viewport can never hide a dialog's
 * confirm/submit control off-screen") and the DESKTOP branch never got it. 128
 * of this repo's 365 `<DialogContent>` call sites had already hand-rolled a
 * `max-h-[..dvh]` for themselves — a missing shell law being paid for 128
 * times. The cap and the sticky footer now live in the shell, so the other ~237
 * inherit them.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE. jsdom has no layout engine: it cannot
 * measure 851px against 657px, and a test that pretended to would be the
 * manufactured-evidence defect this repo treats as a bug. So this pins the
 * CONTRACT that makes the geometry impossible — the cap, the internal scroll,
 * the sticky footer, and that a caller can still override — and the geometric
 * proof is the production walk at a 657px viewport.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "../dialog";

const REPO_ROOT = join(__dirname, "..", "..", "..");

let container: HTMLDivElement;
let root: Root;

/**
 * THE VIEWPORT THE DEFECT WAS FOUND IN: 1280 × 657, a desktop window — not a
 * phone. `useIsMobile` must answer NO here, or the dialog would take the mobile
 * sheet branch that was never broken and the test would prove nothing.
 */
beforeAll(() => {
  Object.defineProperty(window, "innerHeight", { value: 657, writable: true });
  Object.defineProperty(window, "innerWidth", { value: 1280, writable: true });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderDialog(className?: string) {
  act(() => {
    root.render(
      <Dialog open>
        <DialogContent className={className}>
          <DialogTitle>Create New Category</DialogTitle>
          <div>a form tall enough to overflow a short viewport</div>
          <DialogFooter>
            <button type="button">Create Category</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
  });
  // Radix portals to document.body, not into `container`.
  const content = document.querySelector<HTMLElement>("[role='dialog']");
  if (!content) throw new Error("the dialog did not render");
  return content;
}

describe("the desktop dialog can never hide its own action", () => {
  it("clamps to the viewport and scrolls inside itself", () => {
    const content = renderDialog();
    const classes = content.className;
    expect(classes).toContain("max-h-[85dvh]");
    expect(classes).toContain("overflow-y-auto");
  });

  it("keeps the footer — and therefore the primary action — stuck to the bottom", () => {
    renderDialog();
    const footer = document.querySelector<HTMLElement>(
      "[data-slot='dialog-footer']",
    );
    expect(footer).not.toBeNull();
    expect(footer?.className).toContain("sticky");
    expect(footer?.className).toContain("bottom-0");
    // It bleeds to the card's edges so scrolled content cannot appear beneath
    // it in the shell's own padding.
    expect(footer?.className).toContain("var(--dialog-pad,0px)");
    // And the primary action is inside it, which is the whole point.
    expect(footer?.textContent).toContain("Create Category");
  });

  it("still lets a caller that manages its own scrolling win", () => {
    // `max-w-2xl` — exactly what the Create Category dialog passes — must not
    // disturb the cap; a caller's own `max-h` must replace it.
    expect(renderDialog("max-w-2xl").className).toContain("max-h-[85dvh]");
    const own = renderDialog("max-h-[70dvh]").className;
    expect(own).toContain("max-h-[70dvh]");
    expect(own).not.toContain("max-h-[85dvh]");
  });
});

describe("nobody re-opens the hole", () => {
  /** Every `.tsx` under the app's own source trees. */
  function sourceFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "node_modules" || entry === "__tests__") continue;
          walk(full);
          continue;
        }
        if (entry.endsWith(".tsx") && !entry.includes(".test.")) out.push(full);
      }
    };
    for (const tree of ["app", "components", "features"]) {
      walk(join(REPO_ROOT, tree));
    }
    return out;
  }

  it("no DialogContent uncaps its own height or turns overflow back to visible", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/<DialogContent[^>]*>/g)) {
        const tag = match[0];
        if (!/max-h-none|overflow-y-visible|overflow-visible/.test(tag)) continue;
        const line = source.slice(0, match.index ?? 0).split("\n").length;
        offenders.push(`${relative(REPO_ROOT, file)}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("reads real files — a sweep that looked nowhere is not a guard", () => {
    expect(sourceFiles().length).toBeGreaterThan(500);
  });
});

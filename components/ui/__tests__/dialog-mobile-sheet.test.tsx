/**
 * Mobile DialogContent inherits the shared `.matrx-mobile-sheet` form-control
 * rule from app/globals.css. iOS Safari zooms focused form controls whose
 * computed font size is below 16px, so the marker is part of the primitive's
 * behavior contract rather than something each dialog caller must remember.
 *
 * jsdom has no layout or computed responsive CSS engine. This test therefore
 * pins the real class/CSS seam and the mobile geometry; live Browser evidence
 * supplies the viewport and focus proof.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MOTION_BOTTOM_SHEET } from "@ai-matrx/design-system";

import { Dialog, DialogContent, DialogTitle } from "../dialog";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  Object.defineProperty(window, "innerWidth", { value: 390, writable: true });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query.includes("max-width: 767px"),
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

it("renders the canonical mobile bottom sheet with the no-zoom marker", () => {
  act(() => {
    root.render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Edit name</DialogTitle>
          <input aria-label="Name" className="text-sm" />
        </DialogContent>
      </Dialog>,
    );
  });

  const content = document.querySelector<HTMLElement>("[role='dialog']");
  expect(content).not.toBeNull();
  expect(content?.className).toContain("matrx-mobile-sheet");
  expect(content?.className).toContain("bottom-0");
  expect(content?.className).toContain("top-auto");
  expect(content?.className).toContain("w-full");
  expect(content?.className).toContain("max-w-full");
  expect(content?.className).toContain("rounded-t-2xl");
  expect(content?.className).toContain("overflow-y-auto");
  /**
   * The rise-from-the-bottom motion is the design system's own class
   * (`matrx-motion-bottom-sheet`), NOT Tailwind's `slide-in-from-bottom`: the
   * C26 motion-layer extraction (2026-08-30) moved every keyframe into
   * @ai-matrx/design-system/styles.css and put `slide-in-from` on that
   * package's FORBIDDEN_HOST_MOTION_UTILITIES list. Asserting the exported
   * constant AND the keyframes behind it guards the actual behaviour — a sheet
   * that enters from off the bottom edge — instead of a utility name.
   */
  expect(content?.className).toContain(MOTION_BOTTOM_SHEET);

  const packageCss = readFileSync(
    join(
      __dirname,
      "..",
      "..",
      "..",
      "node_modules",
      "@ai-matrx",
      "design-system",
      "dist",
      "styles.css",
    ),
    "utf8",
  );
  expect(packageCss).toMatch(
    /\.matrx-mobile-sheet input,[\s\S]*?\.matrx-mobile-sheet textarea,[\s\S]*?\.matrx-mobile-sheet select,[\s\S]*?font-size:\s*16px/,
  );
  expect(packageCss).toMatch(
    /@keyframes matrx-bottom-sheet-in\s*\{[\s\S]*?transform:\s*translateY\(100%\)/,
  );
  expect(packageCss).toContain(`.${MOTION_BOTTOM_SHEET}[data-state="open"]`);

  const layout = readFileSync(
    join(__dirname, "..", "..", "..", "app", "layout.tsx"),
    "utf8",
  );
  expect(layout).toContain('import "@ai-matrx/design-system/styles.css"');
});

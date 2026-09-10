/**
 * The dialog close button's 44px touch floor used to be asserted by grepping
 * `components/ui/dialog.tsx`. That file is now a pure re-export of
 * `@ai-matrx/design-system` (39ca19cdb0, "adopt shared design system
 * primitives"), so the grep was measuring nothing. This renders the REAL
 * shared DialogContent and reads the close button out of the DOM instead —
 * which is what the app ships, wherever the implementation lives.
 *
 * jsdom has no layout engine, so the responsive geometry is pinned as the
 * class seam; live Browser evidence supplies the viewport proof.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("GovernedActionDialog responsive contract", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("enforces the shared 44px touch floor for every dialog action", () => {
    const dialog = readFileSync(
      join(__dirname, "GovernedActionDialog.tsx"),
      "utf8",
    );
    const globals = readFileSync(
      join(__dirname, "../../../app/globals.css"),
      "utf8",
    );

    expect(dialog).toContain(
      '<DialogContent className="matrx-touch-targets sm:max-w-xl">',
    );
    expect(globals).toContain("@media (pointer: coarse), (max-width: 1023px)");
    expect(globals).toContain("min-height: 2.75rem; /* 44px */");
    expect(globals).toContain("min-width: 2.75rem;");

    act(() => {
      root.render(
        createElement(
          Dialog,
          { open: true },
          createElement(
            DialogContent,
            { className: "matrx-touch-targets sm:max-w-xl" },
            createElement(DialogTitle, null, "Governed action"),
          ),
        ),
      );
    });

    const closeButton = document.querySelector<HTMLElement>(
      "[role='dialog'] [aria-label='Close']",
    );
    expect(closeButton).not.toBeNull();
    expect(closeButton?.className).toContain("h-11");
    expect(closeButton?.className).toContain("w-11");
    expect(closeButton?.className).toContain("items-center");
    expect(closeButton?.className).toContain("justify-center");
    expect(closeButton?.className).toContain("rounded-sm");
    // Below the 44px floor only on pointer-fine desktop widths.
    expect(closeButton?.className).toContain("lg:h-10");
    expect(closeButton?.className).toContain("lg:w-10");
  });
});

/**
 * A MENU TALLER THAN THE VIEWPORT MAY NOT HIDE ITS DESTRUCTIVE SECTION.
 *
 * 🚨 Measured on production `/agents/all` at 1024x768 (one-resolution
 * FIX-Q13): the grid card's "…" menu ran past the bottom of the screen and its
 * DANGER section sat at y~735, out of sight. It was reachable — the panel has
 * capped at Radix's measured available height for months and scrolls — but the
 * only thing saying so was a `mask-image` fade that renders the very control
 * it is hinting at as a half-transparent smear. The walker read Delete as
 * dead. A screen is absent or honest, never disabled-looking (law 4).
 *
 * `ItemMenu` is the shared primitive behind every entity list (agents,
 * mandates, notes, conversations…), so this is asserted once, here.
 *
 * RED against HEAD before the fix: no scroll viewport, no affordance element,
 * and the panel itself was the scroller wearing `matrx-scroll-fade`.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/toast", () => ({
  toast: { error: () => undefined, success: () => undefined },
  toastErrorAlreadyCaptured: () => undefined,
}));

import { ItemMenu } from "../ItemMenu";
import type { ItemMenuConfig } from "../types";

// ── A viewport too short for the menu ───────────────────────────────────────
// jsdom does no layout, so the overflow is declared on the element itself:
// every element reports a content taller than its box, which is exactly the
// state a real 768px-tall viewport puts this panel in.
const VIEWPORT_H = 768;
const CONTENT_H = 1400;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return VIEWPORT_H / 2;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return CONTENT_H;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTop", {
    configurable: true,
    get() {
      return 0;
    },
    set() {},
  });
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      class {
        observe() {}
        disconnect() {}
      };
  }
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
});

/** A rich record-action menu: many entries, DANGER last — the shipped shape. */
const config: ItemMenuConfig = {
  sections: [
    {
      id: "open",
      label: "Open",
      items: Array.from({ length: 18 }, (_, i) => ({
        kind: "command" as const,
        id: `cmd-${i}`,
        label: `Action ${i}`,
        onSelect: () => undefined,
      })),
    },
    {
      id: "danger",
      label: "DANGER",
      items: [
        {
          kind: "command" as const,
          id: "delete",
          label: "Delete",
          tone: "destructive" as const,
          onSelect: () => undefined,
        },
      ],
    },
  ],
};

describe("an overflowing ItemMenu declares its overflow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <ItemMenu config={config} open presentation="dropdown">
          <button type="button">Actions</button>
        </ItemMenu>,
      );
    });
    // The fade/overflow measurement runs on a frame after the panel mounts.
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const panel = () =>
    document.querySelector<HTMLElement>('[data-slot="dropdown-menu-content"]');

  it("caps at the height Radix measured and hands the scrolling to an inner viewport", () => {
    const content = panel();
    expect(content).not.toBeNull();
    expect(content!.className).toContain(
      "max-h-[var(--radix-dropdown-menu-content-available-height)]",
    );
    // The panel is the FRAME. If it were also the scroller there would be
    // nowhere to pin an affordance that stays put while the entries move.
    expect(content!.className).toContain("overflow-hidden");
    const viewport = content!.querySelector<HTMLElement>(
      '[data-slot="item-menu-viewport"]',
    );
    expect(viewport).not.toBeNull();
    expect(viewport!.className).toContain("overflow-y-auto");
  });

  it("says in words that there is more below", () => {
    const more = panel()!.querySelector<HTMLElement>(
      '[data-slot="item-menu-more-below"]',
    );
    expect(more).not.toBeNull();
    expect(more!.textContent).toContain("More actions below");
  });

  it("does not fade the live destructive control into looking disabled", () => {
    const content = panel()!;
    // `matrx-scroll-fade` paints a mask that renders the bottom-most entries —
    // here, Delete — as a half-transparent smear.
    expect(content.className).not.toContain("matrx-scroll-fade");
    expect(content.querySelector("[data-fade-bottom]")).toBeNull();
  });

  it("still renders the DANGER section, live, not disabled", () => {
    const items = [
      ...panel()!.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-item"]'),
    ];
    const del = items.find((el) => el.textContent?.includes("Delete"));
    expect(del).toBeDefined();
    expect(del!.hasAttribute("data-disabled")).toBe(false);
  });
});

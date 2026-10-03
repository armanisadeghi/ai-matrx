/**
 * Saved items with 700 items mounts a BOUNDED number of cards and "…" menus.
 *
 * 2026-10-02: the grid mounted every card — 741 cards, 34,107 DOM nodes, a
 * 640 ms long task to open, ~110 ms per keystroke — and the canvas keeps a
 * shown tab mounted for the life of the page. The grid is virtualized now;
 * this fails (700 cards) on the unvirtualized grid.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CanvasItemSummary } from "@/features/canvas/services/canvasItemsService";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockUseCanvasItems = jest.fn();
jest.mock("@/features/canvas/hooks/useCanvasItems", () => ({
  useCanvasItems: (...args: unknown[]) => mockUseCanvasItems(...args),
}));
jest.mock("@/features/canvas/hooks/useOpenCanvasItem", () => ({
  useOpenCanvasItem: () => ({ openItem: jest.fn() }),
}));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn() }));

import { SavedCanvasItems } from "../SavedCanvasItems";

const ITEM_COUNT = 700;
const VIEWPORT = { width: 400, height: 800 };
const ROW_PX = 172;

function makeItems(n: number, archivedEvery = 0): CanvasItemSummary[] {
  const now = new Date().toISOString();
  return Array.from({ length: n }, (_, i) => ({
    id: `item-${i}`,
    user_id: "u",
    type: "html",
    title: `Item ${i}`,
    description: null,
    is_favorited: false,
    is_archived: archivedEvery > 0 && i % archivedEvery === 0,
    tags: [],
    session_id: null,
    source_message_id: null,
    task_id: null,
    published_to_web: false,
    content_hash: null,
    created_at: now,
    updated_at: now,
    last_accessed_at: now,
  }));
}

// jsdom has no layout: give the scroller a viewport and every row a height,
// the two numbers a virtualizer reads.
const restore: Array<() => void> = [];
beforeAll(() => {
  const proto = HTMLElement.prototype;
  for (const [prop, value] of [
    ["offsetWidth", VIEWPORT.width],
    ["offsetHeight", VIEWPORT.height],
    ["clientWidth", VIEWPORT.width],
    ["clientHeight", VIEWPORT.height],
  ] as const) {
    const prev = Object.getOwnPropertyDescriptor(proto, prop);
    Object.defineProperty(proto, prop, { configurable: true, get: () => value });
    restore.push(() => prev && Object.defineProperty(proto, prop, prev));
  }
  const prevRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const h = this.hasAttribute("data-index") ? ROW_PX : VIEWPORT.height;
    return { x: 0, y: 0, top: 0, left: 0, right: VIEWPORT.width, bottom: h, width: VIEWPORT.width, height: h, toJSON: () => ({}) } as DOMRect;
  };
  restore.push(() => {
    Element.prototype.getBoundingClientRect = prevRect;
  });
});
afterAll(() => restore.forEach((r) => r()));

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

function hookState(items: CanvasItemSummary[]) {
  return {
    items,
    isLoading: false,
    loadError: null,
    load: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    toggleFavorite: jest.fn(),
    toggleArchive: jest.fn(),
    share: jest.fn(),
    updateFilters: jest.fn(),
  };
}

async function mount(items: CanvasItemSummary[]) {
  mockUseCanvasItems.mockReturnValue(hookState(items));
  await act(async () => {
    root.render(<SavedCanvasItems />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("Saved items with 700 items", () => {
  it("mounts a bounded number of cards and menus, not one per item", async () => {
    await mount(makeItems(ITEM_COUNT));
    const cards = host.querySelectorAll("[data-saved-canvas-card]").length;
    const menus = host.querySelectorAll('button[aria-label="More actions"]').length;
    // 800px viewport / 172px rows + overscan ≈ a dozen rows at one column.
    expect(cards).toBeGreaterThan(0);
    expect(cards).toBeLessThanOrEqual(20);
    expect(menus).toBeLessThanOrEqual(20);
    // The count still states every item.
    expect(host.textContent).toContain(String(ITEM_COUNT));
  });

  it("keeps the archived disclosure reachable at the end of the list", async () => {
    await mount(makeItems(40, 4));
    const scroller = host.querySelector<HTMLElement>("[data-saved-grid-scroll]")!;
    expect(scroller).not.toBeNull();
    const inner = scroller.firstElementChild as HTMLElement;
    // 30 active rows + the toggle row, each a measured/estimated row.
    expect(parseFloat(inner.style.height)).toBeGreaterThan(30 * ROW_PX - 1);
  });
});

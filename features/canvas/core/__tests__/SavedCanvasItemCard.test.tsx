/**
 * The Saved items card lays out against its OWN width (container queries),
 * never the viewport: in a narrow pane the secondary actions move into a "…"
 * menu and "Open" goes icon-only, the badge sits in flow (never absolutely
 * over the title), and the type reads as a label, not a raw key.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

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
async function mount(node: React.ReactElement) {
  await act(async () => {
    root.render(node);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}
const byText = (text: string) =>
  Array.from(host.querySelectorAll<HTMLElement>("*")).filter(
    (el) => el.children.length === 0 && el.textContent === text,
  );
import { SavedCanvasItemCard, SAVED_CARD_LAYOUT } from "../SavedCanvasItemCard";
import { SAVED_GRID_CLASS } from "../SavedCanvasItems";
import type { CanvasItemRow } from "@/features/canvas/services/canvasItemsService";

jest.mock("@/features/canvas/hooks/useCanvasItems", () => ({ useCanvasItems: jest.fn() }));
jest.mock("@/features/canvas/hooks/useOpenCanvasItem", () => ({ useOpenCanvasItem: jest.fn() }));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn() }));

const item = {
  id: "item-1",
  title: "Structured_info",
  type: "structured_info",
  created_at: new Date().toISOString(),
  is_favorited: false,
  is_archived: false,
  published_to_web: true,
  description: null,
} as unknown as CanvasItemRow;

const noop = () => {};

function renderCard() {
  return mount(
    <SavedCanvasItemCard
      item={item}
      isEditing={false}
      editingTitle=""
      onEditingTitleChange={noop}
      onStartEdit={noop}
      onSaveEdit={noop}
      onCancelEdit={noop}
      onOpen={noop}
      onToggleFavorite={noop}
      onShare={noop}
      onToggleArchive={noop}
      onDelete={noop}
    />,
  );
}

describe("SavedCanvasItemCard", () => {
  it("is its own size container", async () => {
    const container = await renderCard();
    const card = container.querySelector("[data-saved-canvas-card]")!;
    expect(card.className).toContain("@container/saved-card");
  });

  it("overflows secondary actions into a … menu at narrow card widths", async () => {
    const container = await renderCard();
    const inline = container.querySelector("[data-saved-card-inline-actions]")!;
    const overflow = container.querySelector("[data-saved-card-overflow]")!;
    // Inline actions are hidden until the CARD is wide enough…
    expect(inline.className.split(" ")).toEqual(expect.arrayContaining(["hidden", "@[11rem]/saved-card:flex"]));
    // …and the … menu is shown until then, holding the same actions.
    expect(overflow.className).toBe(SAVED_CARD_LAYOUT.overflowMenu);
    expect(overflow.className).toContain("/saved-card:hidden");
    expect(host.querySelector('button[aria-label="More actions"]')).not.toBeNull();
    // "Open" keeps an accessible name when its label is hidden.
    const openLabel = byText("Open")[0];
    expect(openLabel.className).toContain("hidden");
    expect(openLabel.className).toContain("/saved-card:inline");
    expect(host.querySelector('button[aria-label="Open Structured_info"]')).not.toBeNull();
  });

  it("puts the badge in flow beside a truncating title, labelled for people", async () => {
    await renderCard();
    const badge = byText("Structured info")[0].closest("[title]")!;
    expect(badge.className).not.toContain("absolute");
    expect(byText("structured_info")).toHaveLength(0);
    const title = host.querySelector("h3")!;
    expect(title.textContent).toBe("Structured_info");
    expect(title.className).toContain("line-clamp-2");
    expect(title.className).toContain("min-w-0");
  });
});

describe("Saved items grid", () => {
  it("chooses columns from the pane width, not the viewport", () => {
    expect(SAVED_GRID_CLASS).toContain("grid-cols-1");
    expect(SAVED_GRID_CLASS).toContain("/saved-grid:grid-cols-2");
    expect(SAVED_GRID_CLASS).not.toMatch(/(^|\s)(sm|md|lg|xl):grid-cols/);
  });
});

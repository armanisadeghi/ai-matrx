/**
 * Lane TRASH-COVERAGE. Deleting a map only sets `canvas.canvas_items.deleted_at`
 * (`canvasItemsService.delete`), and /trash lists canvas items
 * (`platform.entity_types.user_artifact_kind = 'canvas'`) and restores them. The
 * confirm used to say the map "will be permanently removed. This cannot be
 * undone." — this renders the real dialog from `useMapRowActions`, opens it
 * through the row menu's Delete item, and reads what a person sees.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useMapRowActions } from "../useMapRowActions";
import type { MapListRow } from "../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("@/features/canvas/services/canvasItemsService", () => ({
  canvasItemsService: { toggleFavorite: jest.fn() },
}));
jest.mock("../service", () => ({
  deleteMap: jest.fn(async () => ({ error: null })),
  duplicateMap: jest.fn(),
}));

const row = {
  id: "5b0e7a52-1f7e-4c1a-9d59-2f3f8f1c7a10",
  title: "Harborview service territory",
  is_favorited: false,
} as unknown as MapListRow;

let openDelete: (() => void) | null = null;

function Harness() {
  const list = {
    patchRow: jest.fn(),
    refresh: jest.fn(),
    removeRow: jest.fn(),
  } as unknown as Parameters<typeof useMapRowActions>[0];
  const { actions, modals } = useMapRowActions(list);
  const config = actions.menuFor!(row)();
  const del = config.sections
    .flatMap((s) => s.items)
    .find((i) => i.id === "delete") as { onSelect: () => void };
  openDelete = del.onSelect;
  return <>{modals}</>;
}

describe("map delete confirm", () => {
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
    document.body.innerHTML = "";
  });

  it("says the map is archived and restorable from Trash, never permanent", () => {
    act(() => root.render(<Harness />));
    act(() => openDelete!());
    const text = document.body.textContent ?? "";
    expect(text).toContain(
      'This archives "Harborview service territory". It leaves this list, and you can restore it from Trash.',
    );
    expect(text).not.toMatch(/cannot be undone|permanently/i);
  });
});

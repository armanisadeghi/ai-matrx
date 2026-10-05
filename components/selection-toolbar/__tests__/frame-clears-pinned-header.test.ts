/**
 * @jest-environment jsdom
 *
 * THE TOOLBAR NEVER HIDES UNDER A PINNED HEADER. Live walk 2026-10-05: a
 * selection near the top of the chat scroll area put the toolbar above it, under
 * the sticky page header (the scroll area runs beneath the header). The usable
 * top edge is the header's bottom, so the toolbar flips below the selection.
 *
 * Use case: a founder selects the first sentence of an answer, right under the header.
 */
import { placeFrame, visibleBoxOf } from "../SelectionToolbarFrame";

const VIEW = { w: 1200, h: 768 };
const SIZE = { w: 300, h: 36 };
const BOX = { top: 0, bottom: 768, left: 0, right: 1200 };

function pinnedHeader(bottom: number) {
  const header = document.createElement("header");
  header.style.position = "sticky";
  header.getBoundingClientRect = () => ({ top: 0, bottom, left: 0, right: 1200, width: 1200, height: bottom, x: 0, y: 0, toJSON() {} }) as DOMRect;
  document.body.appendChild(header);
  (document as unknown as { elementFromPoint: () => Element }).elementFromPoint = () => header;
  return header;
}

afterEach(() => {
  document.body.innerHTML = "";
  delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
});

it("the box top moves down to the bottom of a sticky header covering it", () => {
  pinnedHeader(44);
  expect(visibleBoxOf(BOX, null, { left: 400, width: 100 }).top).toBe(44);
});

it("a selection 30px under the header gets the toolbar BELOW it, fully visible", () => {
  pinnedHeader(44);
  const at = { left: 400, top: 74, bottom: 94, width: 100 };
  const placed = placeFrame(at, SIZE, visibleBoxOf(BOX, null, at), VIEW);
  expect(placed.top).toBeGreaterThanOrEqual(44);
  expect(placed.top).toBeGreaterThanOrEqual(at.bottom);
});

it("with room above the header line it stays above the selection", () => {
  pinnedHeader(44);
  const at = { left: 400, top: 300, bottom: 320, width: 100 };
  expect(placeFrame(at, SIZE, visibleBoxOf(BOX, null, at), VIEW).top).toBe(300 - SIZE.h - 8);
});

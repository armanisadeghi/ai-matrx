/**
 * THE AVATAR MENU MUST RECEIVE CLICKS WHILE THE CANVAS IS OPEN.
 *
 * THE BREAK: CanvasSideSheet is z-10000 over the top-right corner. A dropdown
 * painted inside the pane header hangs into the pane body and loses
 * hit-testing — the menu is visible, clicks land on the canvas. The class is
 * the same one MatrxDynamicPanel already solved: claim the glass-layer
 * stand-in and stack it ABOVE the covering surface.
 *
 * This gate reads the elevated menu's z-index out of `styles/shell.css` and
 * measures `elementFromPoint` in a real engine. Expected value: the menu
 * item. Reachable only if that z-index is greater than the canvas sheet's
 * 10000.
 *
 * `MATRX_LAYOUT_GATE_MUTATION=under-canvas` forces z-index 110 (the old
 * elevated value, above a dynamic panel but under the canvas). The case
 * goes RED — the point hits the sheet, not the item.
 *
 * Run: pnpm test:shell-layout
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

const SHELL_CSS = readFileSync(
  path.join(process.cwd(), "styles", "shell.css"),
  "utf8",
);

const MUTATION = process.env.MATRX_LAYOUT_GATE_MUTATION ?? "";

function elevatedMenuZIndex(): number {
  if (MUTATION === "under-canvas") return 110;
  const match = SHELL_CSS.match(
    /\.elevated-shell-user-menu-root\s*\{[^}]*z-index:\s*(\d+)/,
  );
  if (!match) {
    throw new Error(
      "styles/shell.css must declare z-index on .elevated-shell-user-menu-root",
    );
  }
  return Number(match[1]);
}

test("a click on the elevated avatar menu hits the item, not the canvas", async ({
  page,
}) => {
  const z = elevatedMenuZIndex();
  await page.setContent(`<!doctype html><html><body>
    <div
      data-testid="canvas-sheet"
      style="position:fixed;top:0;right:0;width:480px;height:100vh;z-index:10000;background:#fff"
    ></div>
    <div class="elevated-shell-user-menu-root" style="position:fixed;top:0;right:0;z-index:${z}">
      <button data-testid="menu-item" style="display:block;width:200px;height:36px;margin-top:48px">
        Preferences
      </button>
    </div>
  </body></html>`);

  const hit = await page.evaluate(() => {
    const item = document.querySelector("[data-testid=menu-item]");
    if (!(item instanceof HTMLElement)) return null;
    const r = item.getBoundingClientRect();
    const el = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    return el instanceof HTMLElement ? (el.dataset.testid ?? el.tagName) : null;
  });

  expect(hit).toBe("menu-item");
});

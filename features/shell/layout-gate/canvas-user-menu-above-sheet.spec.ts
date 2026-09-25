/**
 * The canvas close control must receive clicks at the top-right corner.
 * The retired elevated profile trigger used to mount at z-10001 when the
 * canvas opened, directly over this control at z-10000. Check every former
 * claimant and mount point so the browser fixture models the actual system.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const CANVAS_SOURCE = readFileSync(
  path.join(process.cwd(), "features/canvas/core/CanvasSideSheetImpl.tsx"),
  "utf8",
);
const PANEL_SOURCE = readFileSync(
  path.join(process.cwd(), "components/matrx/resizable/MatrxDynamicPanel.tsx"),
  "utf8",
);
const PUBLIC_LAYOUT_SOURCE = readFileSync(
  path.join(process.cwd(), "app/(public)/layout.tsx"),
  "utf8",
);
const APP_SHELL_SOURCE = readFileSync(
  path.join(process.cwd(), "features/shell/components/AppShell.tsx"),
  "utf8",
);

test("the canvas put-away control is not covered by the retired profile trigger", async ({ page }) => {
  const claimsAvatar =
    CANVAS_SOURCE.includes("claimDynamicPanelAvatarCover") ||
    PANEL_SOURCE.includes("claimDynamicPanelAvatarCover") ||
    PUBLIC_LAYOUT_SOURCE.includes("ElevatedShellUserMenuRoot") ||
    APP_SHELL_SOURCE.includes("ElevatedShellUserMenuRoot");
  await page.setContent(`<!doctype html><html><body>
    <div style="position:fixed;top:0;right:0;width:768px;height:100vh;z-index:10000;background:white">
      <button data-testid="canvas-put-away" style="position:absolute;top:0;right:0;width:44px;height:44px">
        Put away canvas
      </button>
    </div>
    ${claimsAvatar ? '<button data-testid="retired-profile-trigger" style="position:fixed;top:0;right:0;width:44px;height:44px;z-index:10001">Profile</button>' : ''}
  </body></html>`);

  const hit = await page.getByTestId("canvas-put-away").evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === button;
  });
  expect(hit).toBe(true);
});

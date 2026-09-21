/**
 * The SHELL LAYOUT gate (`pnpm test:shell-layout`).
 *
 * DELIBERATELY NOT `playwright.config.ts` — see the note in
 * `playwright.kind-sandbox.config.ts`. This is one gate for one boundary: the
 * geometry the repo's own `styles/shell.css` produces in a real engine, at the
 * two viewports the product is judged on. It needs NO running app and no
 * network: the spec loads the stylesheet off disk and measures rects.
 *
 * It exists because jsdom computes no layout, and the defect this pins — the
 * docked canvas' title bar and content switcher measured at y = -18.5 on
 * production — is layout and nothing else.
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./features/shell/layout-gate",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  reporter: [["list"]],
  projects: [
    {
      name: "desktop-1280x720",
      use: { viewport: { width: 1280, height: 720 } },
    },
    {
      name: "desktop-1440x900",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "phone-390x844",
      use: { viewport: { width: 390, height: 844 } },
    },
  ],
});

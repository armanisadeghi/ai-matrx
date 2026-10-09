/**
 * The HTML CARD REACHABILITY gate (`pnpm test:html-card-reachable`).
 *
 * Unlike the static-fixture layout gates, this one walks the REAL chat page on
 * the shared preview (`pnpm preview:start`, signed in through `pnpm dev-login`),
 * because the defect it pins lives in how two packages compose: the chat
 * package's message wrappers clipping the html card's wide-figure breakout.
 * No preview → the setup throws UNMEASURED; it never passes by not running.
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../../features/html-pages/__tests__/html-card-reachable",
  testMatch: /.*\.spec\.ts$/,
  globalSetup: "../../features/html-pages/__tests__/html-card-reachable/global-setup.ts",
  outputDir: "../../.cache/playwright/html-card-reachable/out",
  timeout: 600_000,
  workers: 1,
  reporter: [["list"]],
});

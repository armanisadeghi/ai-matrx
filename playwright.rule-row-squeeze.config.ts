/**
 * The MOBILE RULE-ROW SQUEEZE gate (`pnpm test:rule-row-squeeze`).
 *
 * DELIBERATELY NOT `playwright.config.ts` — same reasoning as
 * `playwright.shell-layout.config.ts`, which this config is modeled on: one
 * gate for one boundary, no running app needed. It loads the REAL compiled
 * Tailwind CSS (`rule-row-squeeze/build-css.mjs`, run by `globalSetup`)
 * against a static fixture carrying the row's actual class strings, and
 * measures real layout in a real engine — jsdom computes no layout, so this
 * is the only way to pin a squeeze defect that only exists at a specific
 * viewport width.
 *
 * Pinned to the exact viewport the defect (2026-09-19,
 * common-docs/projects/acquisition-frontier/screen-reverify-2026-09-19)
 * reproduced at: 390x844, the Rulebook rule row's provenance text wrapped
 * one character per line because the row's action buttons
 * (`shrink-0 flex-nowrap`) squeezed the text column to near-zero width.
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./features/masterwork/components/detail/__tests__/rule-row-squeeze",
  testMatch: /.*\.spec\.ts$/,
  globalSetup: "./features/masterwork/components/detail/__tests__/rule-row-squeeze/global-setup.ts",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    viewport: { width: 390, height: 844 },
    colorScheme: "dark",
  },
});

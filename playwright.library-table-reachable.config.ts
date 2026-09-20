/**
 * The LIBRARY TABLE REACHABILITY gate (`pnpm test:library-table-reachable`).
 *
 * Same shape as `playwright.rule-row-squeeze.config.ts`: one gate for one
 * boundary, no running app needed. It loads the REAL compiled Tailwind CSS
 * (`library-table-reachable/build-css.mjs`, run by `globalSetup`) against a
 * static fixture carrying `EntityListPage`'s and `LibraryMetricsHeader`'s
 * actual class strings, and measures real layout in a real engine — jsdom
 * computes no layout, so this is the only way to pin a squeeze defect that
 * only exists at a specific viewport height.
 *
 * The spec itself sets the viewport per `test.describe` (1440x900 and
 * 390x844, the two sizes the defect report pinned), so no default viewport
 * is set here.
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./features/source-library/__tests__/library-table-reachable",
  testMatch: /.*\.spec\.ts$/,
  globalSetup: "./features/source-library/__tests__/library-table-reachable/global-setup.ts",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    colorScheme: "dark",
  },
});

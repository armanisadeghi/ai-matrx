/**
 * The Shape sandbox's own browser gate (DD-123 S6).
 *
 * DELIBERATELY NOT `playwright.config.ts`. There is no other Playwright suite
 * in this repo, and a default-named config invites `pnpm exec playwright test`
 * to pick this up as "the" browser suite for everything. It is one gate for one
 * boundary, run by name:
 *
 *   pnpm test:kind-sandbox:browser
 *
 * IT NEEDS A RUNNING APP and does not start one. This is a shared checkout: a
 * second dev server fights the first for the port, the Turbopack cache and the
 * install lock, and the harness that exists for that reason is
 * `pnpm preview:start`. `globalSetup` checks the app is there and says exactly
 * what to run if it is not — it never starts one silently.
 */
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.MATRX_SANDBOX_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
    testDir: "features/content-ir/sandbox/browser",
    globalSetup: "./features/content-ir/sandbox/browser/global-setup.ts",
    // One boundary, one browser. Retries would only hide a flaky boundary,
    // which is the one thing this suite may never do.
    retries: 0,
    workers: 1,
    timeout: 90_000,
    reporter: [["list"]],
    use: {
        baseURL,
        ...devices["Desktop Chrome"],
        // The bundled Chromium, so the CSP behaviour under test is the engine's
        // and not whatever the machine happens to have installed.
        channel: undefined,
    },
});

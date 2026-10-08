/**
 * MEET STATE SCENARIOS — real browsers, real LiveKit Cloud, the real local app.
 *
 * Run:  bash tests/meet-scenarios/run.sh                 (all P0 scenarios, Chromium)
 *       bash tests/meet-scenarios/run.sh wr-denied       (one scenario by state id)
 *       MEET_BROWSERS=chromium,webkit bash tests/meet-scenarios/run.sh
 *
 * Points at the ONE shared dev server (port 3001) under this checkout's session
 * hostname — it never starts a server. Every scenario creates its own meeting
 * and ends it. Report: .cache/meet-scenarios/report.md (+ report.json).
 */
import { defineConfig, devices } from "@playwright/test";
import { CHROMIUM_ARGS_BASE } from "./lib/scenario";
import { baseURL } from "./lib/env";

const browsers = (process.env.MEET_BROWSERS ?? "chromium").split(",").map((s) => s.trim());

export default defineConfig({
  testDir: "./scenarios",
  testMatch: /.*\.spec\.ts$/,
  outputDir: "../../.cache/meet-scenarios/artifacts",
  timeout: 12 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: Number(process.env.MEET_WORKERS ?? 4),
  retries: 0,
  reporter: [["list"], ["./lib/report.ts"]],
  use: {
    baseURL: baseURL(),
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 90_000,
  },
  projects: [
    ...(browsers.includes("chromium")
      ? [{
          name: "chromium",
          use: { ...devices["Desktop Chrome"], channel: "chromium", launchOptions: { args: CHROMIUM_ARGS_BASE } },
        }]
      : []),
    ...(browsers.includes("webkit") ? [{ name: "webkit", use: { ...devices["Desktop Safari"] } }] : []),
  ],
});

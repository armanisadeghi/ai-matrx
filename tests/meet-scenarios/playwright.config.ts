/**
 * MEET STATE SCENARIOS — real browsers, real LiveKit Cloud, the real local app.
 *
 * Run:  bash tests/meet-scenarios/run.sh                 (all P0 scenarios, Chromium)
 *       bash tests/meet-scenarios/run.sh wr-denied       (one scenario by state id)
 *       MEET_BROWSERS=chromium,webkit bash tests/meet-scenarios/run.sh
 *
 * Points at the ONE shared dev server (port 3001) under this checkout's session
 * hostname — it never starts a server. Every scenario creates its own meeting
 * and ends it. Report: .cache/meet-scenarios/runs/<run-id>/report.md (+ report.json, artifacts).
 */
import { defineConfig, devices } from "@playwright/test";
import { CHROMIUM_ARGS_BASE } from "./lib/scenario";
import path from "node:path";
import { baseURL, runDir } from "./lib/env";

// One id per run, set here in the main process before any worker starts (workers inherit it):
// every run writes to its own .cache/meet-scenarios/runs/<id>/ — concurrent runs never collide.
const RUN_DIR = runDir();

const browsers = (process.env.MEET_BROWSERS ?? "chromium").split(",").map((s) => s.trim());

export default defineConfig({
  // MEET_SCENARIOS_DIR points a run at a scratch copy (mutation proofs); default is the real scenarios.
  testDir: process.env.MEET_SCENARIOS_DIR ?? "./scenarios",
  testMatch: /.*\.spec\.ts$/,
  outputDir: path.join(RUN_DIR, "artifacts"),
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

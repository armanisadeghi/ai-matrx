/** @jest-environment node */

/**
 * The screen-run path is a LOCAL STAND-IN until this app adopts the
 * @ai-matrx/agents release carrying `ENDPOINTS.tools.screenRun`. It must never
 * drift from that entry: compared against the installed package (once it has the
 * entry) and against the package source when the aidream checkout sits beside this
 * one. aidream's own test compares the source entry with the server route.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ENDPOINTS } from "@ai-matrx/agents/matrx";
import { SCREEN_RUN_PATH } from "../screen-run";

const PACKAGE_SOURCE = join(
  __dirname, "..", "..", "..", "..", "..", "..",
  "aidream", "apps", "shared", "matrx-agents", "matrx", "endpoints.ts",
);

it("matches the installed @ai-matrx/agents entry once it ships", () => {
  const entry = (ENDPOINTS.tools as Record<string, unknown>).screenRun;
  if (entry !== undefined) expect(entry).toBe(SCREEN_RUN_PATH);
});

it("matches the package source entry when the aidream checkout is beside this one", () => {
  if (!existsSync(PACKAGE_SOURCE)) return;
  const m = /screenRun:\s*"([^"]+)"/.exec(readFileSync(PACKAGE_SOURCE, "utf8"));
  expect(m?.[1]).toBe(SCREEN_RUN_PATH);
});

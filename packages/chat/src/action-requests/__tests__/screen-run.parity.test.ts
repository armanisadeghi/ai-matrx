/** @jest-environment node */

/**
 * The screen-run door's path comes from ONE place — `ENDPOINTS.tools.screenRun`
 * in @ai-matrx/agents — and must be the server's route. This test never passes
 * by not checking: the installed package must carry the entry, and the package
 * SOURCE (aidream checkout beside this one) must agree with it. An environment
 * without the aidream checkout must say so explicitly with
 * MATRX_PARITY_WITHOUT_AIDREAM=1; it is never skipped silently. aidream's own
 * test pins the source entry to the server route.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ENDPOINTS } from "@ai-matrx/agents/matrx";

const SERVER_ROUTE = "/tools/screen-run";
const PACKAGE_SOURCE = join(
  __dirname, "..", "..", "..", "..", "..", "..",
  "aidream", "apps", "shared", "matrx-agents", "matrx", "endpoints.ts",
);

it("the installed @ai-matrx/agents carries the screen-run entry", () => {
  expect((ENDPOINTS.tools as Record<string, unknown>).screenRun).toBe(SERVER_ROUTE);
});

it("the package source agrees with the installed entry", () => {
  if (!existsSync(PACKAGE_SOURCE)) {
    if (process.env.MATRX_PARITY_WITHOUT_AIDREAM === "1") return;
    throw new Error(
      `cannot check: ${PACKAGE_SOURCE} is missing. Check out aidream beside this repo, or set ` +
        "MATRX_PARITY_WITHOUT_AIDREAM=1 to declare that this environment cannot.",
    );
  }
  const m = /screenRun:\s*"([^"]+)"/.exec(readFileSync(PACKAGE_SOURCE, "utf8"));
  expect(m?.[1]).toBe(SERVER_ROUTE);
});

it("the transport takes its path from ENDPOINTS, never a literal", () => {
  const source = readFileSync(join(__dirname, "..", "screen-run.ts"), "utf8");
  expect(source).toContain("ENDPOINTS.tools.screenRun");
  expect(source).not.toMatch(/["']\/tools\/screen-run["']/);
});

/**
 * A "CHOOSE ORGANIZATION" PRESS IS NEVER ANSWERED WITH NOTHING (2026-10-07).
 *
 * THE CLASS: buttons that ride the organization gate
 * (`ensureOrganizationContext`) swallowed every failure with
 * `.catch(() => undefined)`. The gate refuses when no picker is mounted yet
 * (its dialog lives in the deferred singleton core), so a press in that window
 * did nothing, said nothing and logged nothing — the canvas Quick Chat tab's
 * "Choose organization" read as dead. The press is now ONE function,
 * `chooseOrganizationFromButton`: a dismissal is nothing, every other failure
 * is announced.
 *
 *   1. behaviour: no picker mounted → an error toast + console error; a
 *      dismissal → silence; a pick → silence;
 *   2. census: no source file swallows the gate with an empty catch.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({ toast: { error: (...args: unknown[]) => toastError(...args), warning: jest.fn() } }));

import {
  chooseOrganizationFromButton,
  registerOrganizationPicker,
  settleOrganizationSelection,
} from "@/lib/organization/organization-gate";

describe("chooseOrganizationFromButton", () => {
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    toastError.mockReset();
    consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    registerOrganizationPicker(null);
    settleOrganizationSelection(null);
  });
  afterEach(() => {
    consoleError.mockRestore();
    registerOrganizationPicker(null);
  });

  it("with no picker mounted, the press says so — never silence", async () => {
    await chooseOrganizationFromButton();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();
  });

  it("a dismissal is 'not now': nothing is said", async () => {
    registerOrganizationPicker(() => queueMicrotask(() => settleOrganizationSelection(null)));
    await chooseOrganizationFromButton();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("a pick is silent too", async () => {
    registerOrganizationPicker(() =>
      queueMicrotask(() => settleOrganizationSelection("33333333-3333-4333-8333-333333333333")),
    );
    await chooseOrganizationFromButton();
    expect(toastError).not.toHaveBeenCalled();
  });
});

const ROOT = join(__dirname, "..", "..", "..");
const SCAN_DIRS = ["app", "components", "features", "lib", "../aidream/apps/shared"];
const SWALLOWED_GATE =
  /(?:ensureOrganizationContext|requestOrganizationContextChoice)\([^)]*\)\s*\.catch\(\s*\(\s*\)\s*=>\s*(?:undefined|null|\{\s*\})/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !full.includes("__tests__")) out.push(full);
  }
  return out;
}

describe("census: nothing swallows the organization gate", () => {
  it("no non-test source answers a failed gate with an empty catch", () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      let files: string[];
      try {
        files = sourceFiles(join(ROOT, dir));
      } catch {
        continue; // a sibling checkout that is not present
      }
      for (const file of files) {
        if (SWALLOWED_GATE.test(readFileSync(file, "utf8"))) offenders.push(relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

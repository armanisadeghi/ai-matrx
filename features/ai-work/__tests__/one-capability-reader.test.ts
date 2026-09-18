/**
 * FORCING GUARD — there is exactly ONE coding-destination capability reader.
 *
 * `features/ai-work/lib/managedClaudeCapability.ts` was a second reader of the
 * same question ("can a Claude Code session start from here?"). It was inert:
 * `destinationAvailability` took its value and never read a field of it, so the
 * screen could claim availability from one reader while the bridge refused. It
 * was deleted on 2026-09-17 and replaced by the bridge verdict
 * (`lib/codingBridgeCapability.ts`).
 *
 * A deleted twin comes back the moment someone finds the old import in a doc or
 * a diff, so this guard fails on ANY reference to it anywhere in the tracked
 * tree — code, test, or doc.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../..");

/** The name of the retired twin, assembled so this file is not itself a hit. */
const RETIRED_READER = ["managed", "Claude", "Capability"].join("");

function trackedReferences(needle: string): string[] {
  const out = execFileSync(
    "git",
    ["grep", "-I", "-n", "--fixed-strings", needle, "--", ".", ":!*one-capability-reader.test.ts"],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    // `git grep` exits 1 when nothing matched, which is the passing case.
  );
  return out.split("\n").filter((line) => line.trim().length > 0);
}

function referencesOrNone(needle: string): string[] {
  try {
    return trackedReferences(needle);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) return [];
    throw error;
  }
}

describe("one capability reader", () => {
  it("has deleted the inert managed-capability module", () => {
    expect(
      existsSync(
        path.join(REPO_ROOT, "features/ai-work/lib", `${RETIRED_READER}.ts`),
      ),
    ).toBe(false);
  });

  it("has no reference to the retired reader anywhere in the tracked tree", () => {
    expect(referencesOrNone(RETIRED_READER)).toEqual([]);
  });

  it("has no reference to the retired reader's exported names", () => {
    expect(referencesOrNone("readManagedCapability")).toEqual([]);
    expect(referencesOrNone("ManagedCapability")).toEqual([]);
    expect(referencesOrNone("INITIAL_CAPABILITY")).toEqual([]);
  });
});

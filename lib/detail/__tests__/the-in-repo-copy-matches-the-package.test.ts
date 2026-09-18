// 🚨 N1 / N2 (VERIFY-U-P1-R5) — THE IN-REPO COPY OF THE DETAIL PRIMITIVE MUST
// NOT DRIFT BEHIND `@ai-matrx/detail`, AND DRIFT MUST SCREAM RATHER THAN WAIT
// FOR A VERIFIER.
//
// The primitive was cut into a package (aidream `apps/shared/detail`). The
// frontend adopted it and the adoption was REVERTED (`ec7ce701` reverted by
// `32ce9170`, ruling R21) because 0.1.0 is not on npm and a `"latest"` spec for a
// package the registry does not have kills the ONE `pnpm install
// --frozen-lockfile` every workspace project shares. The publish is a human step
// and may take days, so `lib/detail/**` is the live code for now.
//
// In the fifteen days between the cut and round 5 the copies diverged, and a
// PERSON could feel it: the package fixed a reviewed defect — a health producer
// answering `onReconnect: null` ("a reconnect cannot repair this refusal") still
// got a Reconnect button — and the revert restored the `??` that caused it. Every
// suite in both repos stayed green the whole time, because nothing compared them.
//
// This is that comparison. It fails BY NAME, listing each drifted module, and it
// FAILS AS UNMEASURED when the aidream checkout is absent — a guard that cannot
// run is never a pass.
//
// What is normalised, and it is deliberately only this: the module-path header
// comment (line 1) and RELATIVE import specifiers, which differ because the two
// trees have different shapes. Every other byte, comments included, must match,
// so a fix cannot land on one side only. `core/icons.ts` is excluded and says why
// in its own header (the package inlines glyphs; this repo is Lucide-only).

import { existsSync } from "node:fs";
import path from "node:path";

import { COMPARED_PAIRS, DETAIL_MODULE_PAIRS, PACKAGE_SRC, readPair } from "./packageParity";

describe("the in-repo copy of the Detail primitive", () => {
  it("can be measured at all — the package's source is where we expect it", () => {
    // 🚨 UNMEASURED IS A FAILURE. Without the sibling checkout this guard would
    // otherwise silently pass and the copies could drift for another fifteen
    // days. The remedy is in the message, not in a comment nobody reads.
    expect(
      existsSync(PACKAGE_SRC) ||
        `UNMEASURED: @ai-matrx/detail's source is not at ${PACKAGE_SRC}. This guard diffs ` +
          "lib/detail/** against the package it was cut into, and it cannot run without the " +
          "aidream checkout beside this repo. Clone/checkout aidream as a sibling, or run this " +
          "suite where it is — never skip it: the copies drifted silently for fifteen days " +
          "(VERIFY-U-P1-R5, N1).",
    ).toBe(true);
    for (const pair of DETAIL_MODULE_PAIRS) {
      expect(existsSync(path.join(PACKAGE_SRC, pair.pkg))).toBe(true);
    }
  });

  it("is byte-identical to the package, module for module", () => {
    const drifted: string[] = [];
    for (const pair of COMPARED_PAIRS) {
      const { pkg, repo } = readPair(pair);
      if (pkg !== repo) drifted.push(`${pair.repo}  ←→  src/${pair.pkg}`);
    }
    expect(drifted).toEqual([]);
  });

  // One module at a time as well, so the failure output SHOWS the difference
  // rather than only naming the file.
  for (const pair of COMPARED_PAIRS) {
    it(`matches the package: ${pair.repo}`, () => {
      const { pkg, repo } = readPair(pair);
      expect(repo).toBe(pkg);
    });
  }
});

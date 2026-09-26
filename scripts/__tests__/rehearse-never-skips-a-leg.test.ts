/**
 * DB-TOOLS-NO-BRANCH (2026-09-25): `pnpm db:rehearse` never silently skips a leg.
 *
 * Before: with the pair already ledgered on the clone, legs 1 and 2 were answered "Already applied,
 * byte-identical. Nothing to do." and the rehearsal still printed "rule 27 complete". Live RED/GREEN
 * on the clone is in the lane report; this pins the two decisions the fix rests on.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALREADY_APPLIED_SENTENCE, legDidNothing, rule27Legs } from "../lib/rule27-legs";

describe("rule 27's legs", () => {
  it("runs up, inverse, up when the up is not on the clone", () => {
    expect(rule27Legs(false)).toEqual(["up", "inverse", "up"]);
  });
  it("runs the inverse FIRST, and the pair twice, when the up is already on the clone", () => {
    expect(rule27Legs(true)).toEqual(["inverse", "up", "inverse", "up"]);
  });
  it("recognises the runner's real no-op sentence, read from the runner itself", () => {
    const runner = readFileSync(resolve(__dirname, "..", "apply-migration.ts"), "utf8");
    expect(runner).toContain(`${ALREADY_APPLIED_SENTENCE} (ledgered`);
    expect(legDidNothing(`[ OK ] ${ALREADY_APPLIED_SENTENCE} (ledgered 2026-09-26). Nothing to do.`)).toBe(true);
    expect(legDidNothing("[WARN] --reapply: re-executing bytes the ledger already holds")).toBe(false);
  });
  it("spawns every already-ledgered leg with --reapply", () => {
    const rehearse = readFileSync(resolve(__dirname, "..", "rehearse-migration.ts"), "utf8");
    expect(rehearse).toMatch(/ledgered\[kind\] \? \["--reapply"\] : \[\]/);
    expect(rehearse).toMatch(/if \(legDidNothing\(r\.out\)\)/);
  });
});

/**
 * ATTACK-6 finding 7 — `restore-graph.ts --verify` must not turn red at H+19.75.
 *
 * `--verify` re-checked every copied table for EXACT equality against the boundary the
 * copy recorded. The boundary is frozen at the copy, so the first lane to write a row
 * into any of the 25 copied tables turned `--verify` red permanently — and it is the only
 * named producer of rule 34's PROOF 4, which eleven exit clauses cite. `W1-ORG`'s exit is
 * a fresh signup executed end to end, which writes `iam.organizations`, `iam.memberships`
 * and `auth.users`, and it ends at H+19.75; the first cell citing rule 34 is at H+22.50.
 * `W2-ACCESS` then writes `iam.permissions`.
 *
 * Restore `if (n !== want) fail(...)` in scripts/gate-corpus/boundary-verdict.ts and the
 * "growth" cases below go RED. Loosen it to "anything passes" and the shrink case does.
 *
 * No database, no credential.
 */
import { boundaryVerdict } from "../gate-corpus/boundary-verdict";

const strip = (s: string) => s.replace(/\[[0-9;]*m/g, "");

describe("the recorded boundary is a FLOOR (ATTACK-6 finding 7)", () => {
  it("passes when the branch holds exactly the boundary", () => {
    const v = boundaryVerdict("iam.permissions", 4609, 4603, 6);
    expect(v.ok).toBe(true);
    expect(strip(v.message)).toContain("4609 ≥ the boundary's 4603");
  });

  it("passes, and SAYS SO, when a lane has written rows since the copy", () => {
    // W1-ORG's signup: auth.users 492 at the copy, one new user at H+19.75.
    const v = boundaryVerdict("auth.users", 493, 478, 14);
    expect(v.ok).toBe(true);
    expect(strip(v.message)).toContain("+1 written since the copy");
  });

  it("FAILS when rows the copy put there have gone", () => {
    const v = boundaryVerdict("iam.permissions", 4600, 4603, 6);
    expect(v.ok).toBe(false);
    expect(strip(v.message)).toContain("BELOW the recorded boundary");
    expect(strip(v.message)).toContain("Rows the copy put there are GONE");
  });

  it("FAILS when the boundary holds no count for the table at all", () => {
    const v = boundaryVerdict("platform.entity_types", 844, undefined, undefined);
    expect(v.ok).toBe(false);
    expect(strip(v.message)).toContain("holds no count for it");
  });

  it("counts branch-only rows into the floor, not against it", () => {
    expect(boundaryVerdict("platform.entity_types", 844, 835, 9).ok).toBe(true);
    expect(boundaryVerdict("platform.entity_types", 843, 835, 9).ok).toBe(false);
  });
});

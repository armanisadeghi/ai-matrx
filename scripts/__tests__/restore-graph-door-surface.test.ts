/**
 * W0-DATA's DOOR-SURFACE clause — the one `--verify` check that reads production
 * as it is NOW rather than the recorded boundary.
 *
 * WHY IT MUST FAIL, and what it costs when it does not. A DB-wide event trigger
 * revokes client EXECUTE on any SECURITY DEFINER function with no
 * `platform.client_callable_door` row, inside the GRANT itself. A function
 * production added after the copy has no door row on the branch, so its grant
 * silently does not stick and an authenticated read against it answers
 * `403 permission denied for function …`. Nine wave-2 and wave-6 lanes issue real
 * HTTP reads against that surface hours before THE REFRESH would fix it.
 * Measured 2026-09-17: production 1,014 doors against a copy's 1,000.
 *
 * TO SEE THESE GO RED: make `doorSurfaceVerdict` return `{ ok: true }`
 * unconditionally — the behaviour before this module existed, where the door
 * surface was checked by nothing at all. The two failing cases below go red
 * immediately. (Proven that way in a scratch copy before the module landed; the
 * real module is never weakened to demonstrate it.)
 *
 * THE SECOND INPUT WITH A DIFFERENT EXPECTED VALUE — rule 3 — is the tolerance
 * boundary itself: five missing doors PASS and six FAIL, from the same shaped
 * fixture, so a check that always failed would be caught as surely as one that
 * always passed.
 *
 * No database, no credential.
 */
import { DOOR_MISSING_TOLERANCE, doorSurfaceVerdict } from "../gate-corpus/door-surface";

const door = (n: number) => `platform.fn_${n}(p_id uuid)`;
const HASH = "d41d8cd98f00b204e9800998ecf8427e";

/** `n` doors, every one of them identical on both databases. */
function surface(n: number, hash = HASH): Map<string, string> {
  return new Map(Array.from({ length: n }, (_, i) => [door(i), hash] as const));
}

describe("doorSurfaceVerdict", () => {
  it("passes when the two surfaces are identical by name and definition hash", () => {
    const v = doorSurfaceVerdict(surface(1014), surface(1014));
    expect(v.ok).toBe(true);
    expect(v.missing).toHaveLength(0);
    expect(v.differing).toHaveLength(0);
    expect(v.message).toContain("0 definition mismatches");
  });

  it(`passes at exactly ${DOOR_MISSING_TOLERANCE} missing doors — the copy ageing, which W0-DATA's row allows`, () => {
    const prod = surface(1014);
    const branch = surface(1014 - DOOR_MISSING_TOLERANCE);
    const v = doorSurfaceVerdict(prod, branch);
    expect(v.ok).toBe(true);
    expect(v.missing).toHaveLength(DOOR_MISSING_TOLERANCE);
  });

  it(`FAILS at ${DOOR_MISSING_TOLERANCE + 1} missing doors, and names them`, () => {
    const prod = surface(1014);
    const branch = surface(1014 - (DOOR_MISSING_TOLERANCE + 1));
    const v = doorSurfaceVerdict(prod, branch);
    expect(v.ok).toBe(false);
    expect(v.missing).toHaveLength(DOOR_MISSING_TOLERANCE + 1);
    // The real failure mode, printed: 1,014 against a copy's 1,000.
    expect(v.message).toContain("permission denied for function");
    expect(v.message).toContain(door(1008));
  });

  it("FAILS on ONE definition mismatch, with no tolerance at all", () => {
    const prod = surface(1014);
    const branch = surface(1014);
    branch.set(door(7), "0000000000000000000000000000ffff");
    const v = doorSurfaceVerdict(prod, branch);
    expect(v.ok).toBe(false);
    expect(v.differing).toEqual([door(7)]);
    expect(v.message).toContain("enforces a policy production does not");
  });

  it("reports a branch-only door and does NOT fail on it — a lane registering its own function is the campaign working", () => {
    const prod = surface(10);
    const branch = surface(10);
    branch.set("corpus.fn_own(p_id uuid)", HASH);
    const v = doorSurfaceVerdict(prod, branch);
    expect(v.ok).toBe(true);
    expect(v.branchOnly).toEqual(["corpus.fn_own(p_id uuid)"]);
    expect(v.message).toContain("branch-only door(s) kept");
  });

  it("a definition mismatch outranks a missing count inside the tolerance — the harsher verdict is the one reported", () => {
    const prod = surface(100);
    const branch = surface(98);
    branch.set(door(3), "0000000000000000000000000000ffff");
    const v = doorSurfaceVerdict(prod, branch);
    expect(v.ok).toBe(false);
    expect(v.message).toContain("DIFFERENT");
    expect(v.missing).toHaveLength(2); // inside the tolerance, and still reported
  });
});

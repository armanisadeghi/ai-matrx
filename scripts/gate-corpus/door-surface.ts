/**
 * `restore-graph.ts --verify`'s DOOR-SURFACE verdict, in its own module so it can
 * be tested without opening a connection to either database.
 *
 * WHY THE CLAUSE EXISTS (W0-DATA's row, 2026-09-17). A DB-wide event trigger
 * REVOKES client EXECUTE on any SECURITY DEFINER function with no
 * `platform.client_callable_door` row — inside the GRANT itself. A function
 * production has added since the copy therefore has no door row on the branch,
 * its client EXECUTE grant silently does not stick, and an authenticated read
 * against that surface answers `403 permission denied for function …` with the
 * schema exposed and every table grant in place. Nine wave-2 and wave-6 lanes
 * issue real HTTP reads against that surface hours before THE REFRESH would fix
 * it. Measured 2026-09-17: production 1,014 door rows against a copy's 1,000.
 *
 * WHY THE TWO VERDICTS DIFFER, and it is not an oversight:
 *   · MISSING — production holds a door the branch does not. That is the copy
 *     AGEING; new functions land all day, and W0-DATA's row allows five before
 *     it fails by name.
 *   · DEFINITION MISMATCH — both hold the door, with different policy. That is
 *     not ageing, it is the branch enforcing a rule production does not, and one
 *     is too many. No tolerance.
 *   · BRANCH-ONLY — a door the branch has and production does not. Reported,
 *     never failed: a lane that registers its own function on the branch is the
 *     campaign working.
 */
const DIM = "[2m";
const RESET = "[0m";

/** W0-DATA's row: "FAILS by name when production exceeds the copy by more than five rows." */
export const DOOR_MISSING_TOLERANCE = 5;

export interface DoorSurfaceVerdict {
  readonly ok: boolean;
  readonly message: string;
  readonly missing: readonly string[];
  readonly differing: readonly string[];
  readonly branchOnly: readonly string[];
}

const sample = (xs: readonly string[]) =>
  xs.slice(0, 5).join(", ") + (xs.length > 5 ? `, … (${xs.length} in all)` : "");

/**
 * @param prod   door name → definition hash, read from PRODUCTION
 * @param branch door name → definition hash, read from the BRANCH
 *
 * The name must be built from `identity_args` (text), never from
 * `identity_argtypes` (`oid[]`) — see restore-graph.ts's DOOR_SURFACE_SQL for
 * the measured reason.
 */
export function doorSurfaceVerdict(
  prod: ReadonlyMap<string, string>,
  branch: ReadonlyMap<string, string>,
  tolerance: number = DOOR_MISSING_TOLERANCE,
): DoorSurfaceVerdict {
  const missing = [...prod.keys()].filter((d) => !branch.has(d)).sort();
  const differing = [...prod.entries()]
    .filter(([d, h]) => branch.has(d) && branch.get(d) !== h)
    .map(([d]) => d)
    .sort();
  const branchOnly = [...branch.keys()].filter((d) => !prod.has(d)).sort();
  const remedy =
    `Remedy: re-run the copy (restore-graph.ts, or --merge for THE REFRESH).`;

  if (differing.length)
    return {
      ok: false,
      missing,
      differing,
      branchOnly,
      message:
        `DOOR SURFACE: ${differing.length} door(s) exist on both databases with a DIFFERENT ` +
        `definition, so the branch enforces a policy production does not: ${sample(differing)}. ` +
        `There is no tolerance for this — it is not the copy ageing, it is the copy disagreeing. ` +
        remedy,
    };
  if (missing.length > tolerance)
    return {
      ok: false,
      missing,
      differing,
      branchOnly,
      message:
        `DOOR SURFACE: production holds ${missing.length} door row(s) this branch does not, over ` +
        `the ${tolerance} W0-DATA's row allows: ${sample(missing)}. Each is a SECURITY DEFINER ` +
        `function whose client EXECUTE grant SILENTLY DOES NOT STICK on this branch, so an ` +
        `authenticated read against it answers 403 permission denied for function. ` +
        remedy,
    };
  return {
    ok: true,
    missing,
    differing,
    branchOnly,
    message:
      `DOOR SURFACE ${branch.size} branch door(s) against production's ${prod.size}: ` +
      `0 definition mismatches, ${missing.length} missing (ceiling ${tolerance})` +
      (missing.length ? `: ${sample(missing)}` : "") +
      (branchOnly.length
        ? ` ${DIM}(+${branchOnly.length} branch-only door(s) kept: ${sample(branchOnly)})${RESET}`
        : ""),
  };
}

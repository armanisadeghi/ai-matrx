/**
 * `restore-graph.ts --verify`'s FRESHNESS CEILING, in its own module so it can be
 * tested without a database.
 *
 * 🚨 ATTACK-7 finding 6. `--verify` compares the branch to the boundary THE COPY
 * RECORDED (ATTACK-6 finding 7 made that a floor, deliberately, so lanes writing
 * rows after the copy do not turn the gate red). The cost of that correctness is
 * that `--verify` passed no matter how OLD the recorded copy was: production takes
 * new `iam.permissions` grants all day — 4,603 at 2026-09-16 03:49:55Z, 4,651 two
 * hours forty-three minutes later, ≈18/hour, measured — so across the campaign's
 * 56-hour critical path the branch copy can be a thousand grants, roughly a fifth
 * of the grant set, behind the database every "over the copied real graph" clause
 * claims to speak about. `W7-GATE` runs T1 over that copy at H+49. Nothing in the
 * gate could say so: the staleness was a sentence in a log, not a check that fails.
 *
 * So the age of the boundary is now a CEILING THAT FAILS, and the remedy — re-run
 * `W0-DATA`'s copy, then re-verify — is printed with the failure.
 */

/**
 * THE DEFAULT CEILING, AND WHY IT IS TWELVE HOURS.
 *
 * Three numbers decide it, and they are the campaign's own:
 *
 *   · production takes ≈18 `iam.permissions` grants an hour (measured above), so
 *     a boundary of age H is ≈18·H grants adrift of the database the gate's
 *     clauses are written about. At 12 h that is ≈216 grants — ≈4.6% of the 4,651
 *     production holds — which is the largest drift an access proof can carry and
 *     still be honestly described as running "over the copied real graph".
 *   · the critical path is 56 h and `W7-GATE` runs at H+49. A ceiling ABOVE 49 h
 *     could never fire at the one gate that matters, and a 59-hour-old copy — the
 *     whole-campaign case finding 6 names — must fail. 12 h fails both.
 *   · `W0-DATA`'s copy takes minutes, and re-running it is the remedy. A ceiling
 *     short enough to force a re-copy inside every working day of the campaign
 *     costs a few minutes; a ceiling long enough to never fire costs the gate.
 *
 * It is not a constant anybody has to live with: `--max-boundary-age=<hours>` sets
 * it explicitly, and the effective value is printed on every run, pass or fail, so
 * a loosened ceiling is visible in the log that claims the gate is green.
 */
export const DEFAULT_MAX_BOUNDARY_AGE_HOURS = 12;

export const MAX_BOUNDARY_AGE_FLAG = "--max-boundary-age";

/**
 * The effective ceiling for this run. Throws — never silently falls back to the
 * default — when the flag is present and unusable, because a typo'd ceiling that
 * quietly became 12 is the same class of lie the ceiling exists to close.
 */
export function parseMaxBoundaryAgeHours(argv: readonly string[]): {
  hours: number;
  explicit: boolean;
} {
  const arg = argv.find((a) => a === MAX_BOUNDARY_AGE_FLAG || a.startsWith(`${MAX_BOUNDARY_AGE_FLAG}=`));
  if (arg === undefined) return { hours: DEFAULT_MAX_BOUNDARY_AGE_HOURS, explicit: false };
  const raw = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : "";
  if (raw === "")
    throw new Error(
      `${MAX_BOUNDARY_AGE_FLAG} needs a value in hours, written as one token: ` +
        `${MAX_BOUNDARY_AGE_FLAG}=6 (the default is ${DEFAULT_MAX_BOUNDARY_AGE_HOURS}).`,
    );
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0)
    throw new Error(
      `${MAX_BOUNDARY_AGE_FLAG}=${raw} is not a positive number of hours. ` +
        `The default is ${DEFAULT_MAX_BOUNDARY_AGE_HOURS}.`,
    );
  return { hours, explicit: true };
}

/** Hours, to two decimals, for every line that prints an age. */
export function formatAgeHours(ageHours: number): string {
  return `${ageHours.toFixed(2)} h`;
}

/**
 * THE VERDICT ON THE BOUNDARY'S AGE.
 *
 * `ageHours` is measured by the database, as `extract(epoch from now() -
 * prod_taken_at)/3600` against `restore_graph.run` — the exact expression
 * `W7-GATE`'s exit clause names, which is why `prod_taken_at` is a `timestamptz`
 * and not the `text` it used to be (ATTACK-7 finding 14: the expression raised
 * `42883: operator does not exist: timestamp with time zone - text`).
 *
 * Over the ceiling is a FAILURE with a name and a remedy. Never a warning: a
 * warning inside a run that exits 0 reads as a pass at 3 a.m., which is the whole
 * defect.
 */
export function boundaryAgeVerdict(
  ageHours: number,
  maxHours: number,
  takenAt: string,
): { ok: boolean; message: string } {
  if (!Number.isFinite(ageHours))
    return {
      ok: false,
      message:
        `the boundary's age could not be measured (prod_taken_at = ${takenAt || "(empty)"}). ` +
        `A boundary whose age is unknown is treated as too old: re-run the copy ` +
        `(\`npx tsx scripts/gate-corpus/restore-graph.ts\`, W0-DATA's restore) and re-verify.`,
    };
  if (ageHours > maxHours)
    return {
      ok: false,
      message:
        `BOUNDARY TOO OLD: the copy's snapshot of production was taken ${takenAt}, ` +
        `${formatAgeHours(ageHours)} ago, over the ${formatAgeHours(maxHours)} ceiling. ` +
        `Everything below this line would be measured against a copy that old — production ` +
        `takes ≈18 iam.permissions grants an hour, so it is ≈${Math.round(ageHours * 18)} grants ` +
        `behind already. REMEDY: re-run the copy (\`npx tsx scripts/gate-corpus/restore-graph.ts\`, ` +
        `W0-DATA's restore), then re-verify. To accept an older copy deliberately, say so by name: ` +
        `${MAX_BOUNDARY_AGE_FLAG}=<hours>.`,
    };
  return {
    ok: true,
    message:
      `boundary age ${formatAgeHours(ageHours)} — within the ${formatAgeHours(maxHours)} ceiling ` +
      `(the copy's snapshot of production, taken ${takenAt})`,
  };
}

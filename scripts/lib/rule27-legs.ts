/**
 * rule27-legs.ts — WHICH legs `pnpm db:rehearse` runs, and how a leg that did nothing is caught.
 *
 * 🚨 lane DB-TOOLS-NO-BRANCH, 2026-09-25. When the pair was already ledgered on the clone, legs 1
 * and 2 spawned a plain apply, the runner answered "Already applied, byte-identical. Nothing to
 * do." and exited 0, and the rehearsal printed "rule 27 complete" having run one leg of three.
 *   · the up NOT ledgered on the clone → up, inverse, up
 *   · the up ALREADY ledgered          → inverse, up, inverse, up (the clone holds the up's
 *                                        state, so the inverse runs first; the pair runs twice)
 * Every leg whose file is already ledgered is spawned with --reapply, and a leg whose runner
 * output still carries the no-op sentence is a FAILURE.
 */
export type LegKind = "up" | "inverse";

export function rule27Legs(upLedgeredOnClone: boolean): LegKind[] {
  return upLedgeredOnClone ? ["inverse", "up", "inverse", "up"] : ["up", "inverse", "up"];
}

/** The runner's own no-op sentence (scripts/apply-migration.ts). */
export const ALREADY_APPLIED_SENTENCE = "Already applied, byte-identical";

/** True when a spawned `pnpm db:apply` executed nothing. */
export function legDidNothing(runnerOutput: string): boolean {
  return runnerOutput.includes(ALREADY_APPLIED_SENTENCE);
}

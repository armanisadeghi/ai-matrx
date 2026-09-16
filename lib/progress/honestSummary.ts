// lib/progress/honestSummary.ts
//
// 🚨 THE SUMMARY IS DERIVED FROM THE STEPS, NEVER COMPUTED BESIDE THEM.
//
// Cold walk, 2026-09-16, finding #2: the Masterwork Quick Build dialog showed,
// in the same frame, on the same screen:
//
//   header : "Still building after 2 minutes — longer than usual. Nothing has
//             failed, and it keeps going without you."
//   step 2 : "Failed", in red, two centimetres below it.
//
// The reassurance came out of a clock. The red pill came out of the run. The
// two never spoke, so the screen told the Expert something the screen itself
// disproved. That is a lying screen (law #4), and the class of the defect is
// "a summary computed from anything other than the rows it summarises".
//
// The rule this file holds: a progress summary has ONE source of truth — the
// same step collection the step list renders. If any rendered step is failed,
// the summary says so, names which one, and says what the person can do. No
// caller can opt out, because the canonical renderer applies this to whatever
// description it was handed.
//
// This is a platform primitive, not the Build's private repair: every
// non-token run surface (builds, illustration runs, visibility reports,
// imports, audits) renders the same shape and inherits the same honesty.

/**
 * The structural shape of a rendered progress step. Deliberately NOT imported
 * from the renderer — the primitive must not depend on a React component, and
 * `LiveRunProgressItem` satisfies this structurally.
 */
export interface ProgressStep {
  label: string;
  status: "waiting" | "running" | "completed" | "failed";
}

/**
 * What the person can do about a failure. A stand-in that announces itself
 * without a remedy is still a dead end, so this always has a value; surfaces
 * with a better answer than "try again" pass their own.
 */
export const DEFAULT_FAILURE_REMEDY =
  "Try it again, and tell us if it fails the same way.";

/** The failed steps, in the order they are rendered. */
export function failedSteps(
  steps: readonly ProgressStep[],
): readonly ProgressStep[] {
  return steps.filter((step) => step.status === "failed");
}

/**
 * The honest sentence for a run that has a failed step — or null when nothing
 * on screen has failed, which is the caller's cue to keep its own sentence.
 */
export function failureSummary(
  steps: readonly ProgressStep[],
  remedy: string = DEFAULT_FAILURE_REMEDY,
): string | null {
  const failed = failedSteps(steps);
  if (failed.length === 0) return null;

  const [first, ...rest] = failed;
  const alsoFailed =
    rest.length === 0
      ? ""
      : rest.length === 1
        ? " Another step failed too."
        : ` ${rest.length} other steps failed too.`;

  return `Stopped — “${first.label}” failed.${alsoFailed} Nothing after it will run. ${remedy}`;
}

/**
 * THE summary a progress surface shows. `description` is whatever the caller
 * wanted to say; it survives only while the steps do not contradict it.
 */
export function honestProgressSummary({
  steps,
  description,
  remedy,
}: {
  steps: readonly ProgressStep[];
  description?: string | undefined;
  remedy?: string | undefined;
}): string | undefined {
  return failureSummary(steps, remedy) ?? description;
}

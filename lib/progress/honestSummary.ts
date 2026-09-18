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
// 🚨 AND A SUMMARY MUST KNOW WHAT SHAPE OF RUN IT IS SUMMARISING.
//
// `common-docs/projects/acquisition-frontier/own-files/VERIFICATION.md` §9.1,
// 2026-09-18: over a seventeen-source Masterwork dump that ran every source and
// finished, this file wrote *"Stopped — “Untitled File” failed. Nothing after
// it will run."* Both halves were false. The run had not stopped, and the
// fifteen sources "after" the failed one were never after it at all — they were
// running beside it. The sentence was right for the surface it was written
// against (a Build's ordered milestones) and wrong for every surface that fans
// a run out over a pile, which is most of them: a dump of files, a visibility
// report across engines, an illustration pass across cards.
//
// So the run's SHAPE is a required input, not a default. A `sequence` is
// ordered and a failure genuinely stops what follows. A `fan_out` runs its
// steps independently and one failure costs exactly one step — saying otherwise
// tells a person fifteen files were lost when they were not, which is how a
// correct, completed, paid run got reported as a platform failure.

/**
 * How a run's steps relate to each other — and therefore what ONE failure
 * among them actually means.
 *
 * * `sequence` — ordered milestones. Step N+1 needs step N, so a failure
 *   really does stop everything after it (a Masterwork Build, an import's
 *   read → parse → write ladder).
 * * `fan_out` — independent units over a pile. Every step was launched
 *   regardless of its neighbours, so one failure costs one unit and nothing
 *   else (a dump of files, a report across engines, a pass across cards).
 *
 * There is no default. A surface that cannot say which one it is has not
 * looked at its own run.
 */
export type RunShape = "sequence" | "fan_out";

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
 *
 * `shape` decides what the failure MEANS, and there is deliberately no default:
 * see the file header.
 */
export function failureSummary(
  steps: readonly ProgressStep[],
  shape: RunShape,
  remedy: string = DEFAULT_FAILURE_REMEDY,
): string | null {
  const failed = failedSteps(steps);
  if (failed.length === 0) return null;

  const [first, ...rest] = failed;

  if (shape === "sequence") {
    const alsoFailed =
      rest.length === 0
        ? ""
        : rest.length === 1
          ? " Another step failed too."
          : ` ${rest.length} other steps failed too.`;
    return `Stopped — “${first.label}” failed.${alsoFailed} Nothing after it will run. ${remedy}`;
  }

  // FAN-OUT. Every other step was launched independently of this one, so the
  // only true statement is how many of the pile did not work — never "stopped",
  // never "nothing after it will run".
  const others = steps.length - failed.length;
  const rest0f =
    others === 0
      ? ""
      : others === 1
        ? " The other one is unaffected."
        : ` The other ${others} are unaffected.`;
  const headline =
    failed.length === 1
      ? `“${first.label}” didn’t work.`
      : `${failed.length} of ${steps.length} didn’t work, starting with “${first.label}”.`;
  return `${headline}${rest0f} ${remedy}`;
}

/**
 * THE summary a progress surface shows. `description` is whatever the caller
 * wanted to say; it survives only while the steps do not contradict it.
 */
export function honestProgressSummary({
  steps,
  shape,
  description,
  remedy,
}: {
  steps: readonly ProgressStep[];
  /** Ordered milestones, or independent units over a pile. No default. */
  shape: RunShape;
  description?: string | undefined;
  remedy?: string | undefined;
}): string | undefined {
  return failureSummary(steps, shape, remedy) ?? description;
}

/**
 * The pure core of the guided checklist: definition + persisted state + live
 * check results in → what the screen should say out.
 *
 * Pure and dependency-free on purpose. Every rendering decision (what is done,
 * what is blocked, what regressed, what the user should look at next) is made
 * exactly once, here — so a second surface can never disagree with the first.
 * The hook does the I/O; this decides the meaning.
 */

import type {
  CheckResult,
  ChecklistDefinition,
  ChecklistRunState,
  ChecklistStep,
  ResolvedChecklist,
  ResolvedStep,
  StepStatus,
} from "./types";

export const EMPTY_RUN_STATE: ChecklistRunState = { steps: {} };

/** Live results keyed by step id. A missing entry means "not checked yet". */
export type LiveResults = Record<string, CheckResult | undefined>;

/** Step ids whose `run` is currently in flight. */
export type BusySet = ReadonlySet<string>;

/** Checklist keys we have already screamed about, so we scream once, not per render. */
const warnedDuplicates = new Set<string>();

/**
 * THE ONE WAY to read a definition's steps.
 *
 * A definition may declare a fixed array or a pure factory over the context
 * (see `ChecklistStepsFactory`). Everything downstream — the engine, the hook,
 * the UI — goes through here so neither form is a special case anywhere else.
 *
 * The duplicate-id check `registerChecklist` performs statically cannot see a
 * factory's output, so it happens here instead: two steps on one id means one
 * of them is reading and writing the other's persisted state.
 */
export function checklistSteps<Ctx>(
  definition: ChecklistDefinition<Ctx>,
  ctx: Ctx,
): ChecklistStep<Ctx>[] {
  const steps =
    typeof definition.steps === "function"
      ? definition.steps(ctx)
      : definition.steps;
  if (!warnedDuplicates.has(definition.key)) {
    const seen = new Set<string>();
    for (const step of steps) {
      if (seen.has(step.id)) {
        warnedDuplicates.add(definition.key);
        console.error(
          `[guided-setup] Checklist "${definition.key}" produced step id "${step.id}" twice — ` +
            `step ids are persistence keys and must be unique.`,
        );
        break;
      }
      seen.add(step.id);
    }
  }
  return steps;
}

function daysBetween(fromIso: string, now: number): number {
  const then = Date.parse(fromIso);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return (now - then) / 86_400_000;
}

/**
 * Is a human confirmation still good? A confirmation is somebody's word, and a
 * definition may declare that word expires — at which point we ask again rather
 * than keep asserting something nobody has looked at in months.
 */
export function confirmationIsCurrent(
  step: Extract<ChecklistStep<never>, { kind: "confirmed" }>,
  confirmedAt: string | undefined,
  now: number,
): boolean {
  if (!confirmedAt) return false;
  if (!step.reconfirmAfterDays) return true;
  return daysBetween(confirmedAt, now) < step.reconfirmAfterDays;
}

/**
 * Resolve the whole checklist.
 *
 * The three rules that matter:
 *
 *  1. **A live result always beats the persisted one.** `lastResult` exists
 *     only so the screen can paint before the check lands, and any step still
 *     showing it is flagged `stale`.
 *  2. **`unknown` is never a failure.** "We could not check" gets its own
 *     neutral state; rendering it red tells the user they did something wrong
 *     when in fact we did not look.
 *  3. **Blocking is by dependency, not by order.** A step whose dependencies
 *     are unmet still renders — the user should see what is coming — but is not
 *     actionable and is never counted as something they are failing to do.
 */
export function resolveChecklist<Ctx>(args: {
  definition: ChecklistDefinition<Ctx>;
  /** The context the definition's checks and step factory read. */
  ctx: Ctx;
  state: ChecklistRunState;
  live: LiveResults;
  busy?: BusySet;
  now?: number;
}): ResolvedChecklist {
  const { definition, state, live } = args;
  const busy = args.busy ?? new Set<string>();
  const now = args.now ?? Date.now();
  const definedSteps = checklistSteps(definition, args.ctx);

  const byId = new Map<string, ResolvedStep>();
  const titleById = new Map<string, string>();
  for (const step of definedSteps) titleById.set(step.id, step.title);

  const steps: ResolvedStep[] = [];

  for (const step of definedSteps) {
    const persisted = state.steps[step.id];
    const liveResult = live[step.id];

    // Dependencies resolve against steps already placed — a definition that
    // points forward gets no gating rather than a crash, which is the safe
    // failure (offer the step) rather than the dangerous one (hide it forever).
    const blockedBy = (step.dependsOn ?? [])
      .filter((id) => {
        const dep = byId.get(id);
        return dep ? dep.status !== "done" : false;
      })
      .map((id) => titleById.get(id) ?? id);

    let status: StepStatus;
    let result: CheckResult | null = null;
    let stale = false;
    let lastCheckedAt: string | null = null;
    let regressed = false;

    if (step.kind === "confirmed") {
      status = confirmationIsCurrent(step, persisted?.confirmedAt, now)
        ? "done"
        : "action";
    } else {
      if (liveResult) {
        result = liveResult;
      } else if (persisted?.lastResult) {
        // Paint last-known, and say so.
        result = {
          status: persisted.lastResult.status,
          reason: persisted.lastResult.reason,
        };
        stale = true;
        lastCheckedAt = persisted.lastResult.at;
      }

      const effective = result?.status ?? "checking";
      if (busy.has(step.id) || effective === "checking") status = "busy";
      else if (effective === "pass") status = "done";
      else if (effective === "unknown") status = "unknown";
      else status = "action";

      // A regression is only meaningful against a live result: last-known
      // disagreeing with itself is not news.
      regressed =
        !stale &&
        status === "action" &&
        persisted?.lastResult?.status === "pass";
    }

    // Blocking outranks everything except an already-satisfied step. A step
    // that is done stays done even if an upstream step later regressed —
    // that upstream step carries its own alarm, and demoting a genuinely
    // satisfied step would send the user to redo work that is fine.
    if (blockedBy.length > 0 && status !== "done" && status !== "busy") {
      status = "blocked";
    }

    const resolved: ResolvedStep = {
      id: step.id,
      kind: step.kind,
      title: step.title,
      description: step.description,
      optional: step.optional === true,
      status,
      result,
      running: busy.has(step.id),
      stale,
      lastCheckedAt,
      blockedBy,
      regressed,
    };
    byId.set(step.id, resolved);
    steps.push(resolved);
  }

  const required = steps.filter((s) => !s.optional);
  const doneCount = required.filter((s) => s.status === "done").length;
  const complete = required.length > 0 && doneCount === required.length;

  // The step to look at: the first that genuinely wants the user. An `unknown`
  // step is offered too — we could not check it, so the user may still need to
  // act — but only after every step we KNOW wants attention.
  const current =
    steps.find((s) => s.status === "action") ??
    steps.find((s) => s.status === "unknown") ??
    null;

  return {
    key: definition.key,
    title: definition.title,
    description: definition.description,
    steps,
    doneCount,
    requiredCount: required.length,
    complete,
    currentStepId: current?.id ?? null,
    hasRegression: steps.some((s) => s.regressed),
  };
}

/**
 * Which auto steps should we run right now, unasked? Only ones that are
 * unblocked, declared self-running, live-checked as not-done, and not already
 * in flight. Deliberately refuses to act on a `stale` or `unknown` result:
 * performing a side effect because we could not check is how a "helpful"
 * system does something the user never asked for.
 */
export function autoRunnableSteps<Ctx>(args: {
  definition: ChecklistDefinition<Ctx>;
  ctx: Ctx;
  resolved: ResolvedChecklist;
  live: LiveResults;
  busy?: BusySet;
  alreadyRan: ReadonlySet<string>;
}): string[] {
  const busy = args.busy ?? new Set<string>();
  const byId = new Map(args.resolved.steps.map((s) => [s.id, s]));
  return checklistSteps(args.definition, args.ctx)
    .filter((step) => {
      if (step.kind !== "auto") return false;
      if (step.autoRun === false) return false;
      if (busy.has(step.id) || args.alreadyRan.has(step.id)) return false;
      const resolved = byId.get(step.id);
      if (!resolved || resolved.status === "blocked") return false;
      // Must be a LIVE fail — never act on last-known or on "we could not look".
      return args.live[step.id]?.status === "fail";
    })
    .map((step) => step.id);
}

/** Fold a live result into the persisted state as the new last-known. */
export function withLastResult(
  state: ChecklistRunState,
  stepId: string,
  result: CheckResult,
  at: string,
): ChecklistRunState {
  if (result.status === "checking") return state;
  return {
    ...state,
    steps: {
      ...state.steps,
      [stepId]: {
        ...state.steps[stepId],
        lastResult: { status: result.status, reason: result.reason, at },
      },
    },
  };
}

/**
 * Record (or withdraw) a human confirmation.
 *
 * `userId` is nullable and stays ABSENT rather than becoming `""` when we do
 * not know who acted: a confirmation attributed to an empty string reads, to
 * every later query, as a real user with a blank id. "We don't know who" is a
 * different fact from "nobody", and the audit value of this field is the whole
 * reason it exists.
 */
export function withConfirmation(
  state: ChecklistRunState,
  stepId: string,
  confirmed: boolean,
  userId: string | null,
  at: string,
): ChecklistRunState {
  const prior = state.steps[stepId] ?? {};
  const next = confirmed
    ? { ...prior, confirmedAt: at, confirmedBy: userId ?? undefined }
    : { ...prior, confirmedAt: undefined, confirmedBy: undefined };
  return { ...state, steps: { ...state.steps, [stepId]: next } };
}

/** Record that we performed an auto step on the user's behalf. */
export function withAutoRun(
  state: ChecklistRunState,
  stepId: string,
  at: string,
): ChecklistRunState {
  return {
    ...state,
    steps: { ...state.steps, [stepId]: { ...state.steps[stepId], ranAt: at } },
  };
}

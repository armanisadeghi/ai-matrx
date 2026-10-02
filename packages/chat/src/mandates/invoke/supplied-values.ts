// features/mandates/invoke/supplied-values.ts
//
// THE SEAM FOR "CODE INVOKES A MANDATE" — how a call site supplies a job's
// inputs BY THE NAMES THE SERVER SERVES, and what it must ask a person for.
//
// 🚨 WHAT THIS EXISTS FOR (Arman, live, 2026-08-31). "Refine with AI" failed on
// every mandate. The key was right, the holder was bound, the map was complete,
// and the run door still refused: *"required agent value does not exist in the
// calling code path"*. The caller was passing four variables it invented —
// `mandate_key`, `mandate_label`, `current_goal`, `description` — and the job
// it was invoking declares five entirely different ones (`task_overview`,
// `inputs`, `outputs`, `system_prompt`, `full_agent_object`), synthesized from
// its described inputs, plus a person-answered `brief` its binding asks for.
// Nothing on either side was broken. The two sides had simply never been
// introduced, and no code path made them meet.
//
// THE RULE, and it is general: a call site does not get to name a job's inputs.
// The SERVED SURFACE names them (`GET /mandates/{key}/input-surface`), the call
// site says what it HOLDS by those names, and this decides the rest. A caller
// that guesses names is the defect; a job that changes its inputs must not
// require a client deploy.
//
// This is deliberately not a goal-writer special case. Every
// `AutomationButton` call site — every place code invokes a mandate — routes
// through here, so "the caller supplies known values by served name, and
// anything a person must answer is asked inline" is THE pattern, not a fix.

import type { ServedInput } from "@/features/workflow-runtime/served-form/served-input";

/** What a call site holds, keyed by the SERVED input name. A key nothing
 * serves is simply never sent — it is not an error, it is a caller that knows
 * more than this job asked for. */
export type KnownValues = Readonly<Record<string, string | null | undefined>>;

export interface InvocationPlan {
  /** Ready to send — served inputs this caller holds a real value for. */
  variables: Record<string, string>;
  /**
   * Served inputs a PERSON must answer before the run: the binding's own
   * questions (`origin: "binding_prompt"` — a question nobody asks is a promise
   * nobody keeps), and anything the surface requires that the caller does not
   * hold. Asked inline, never silently dropped and never failed after the fact.
   */
  asks: ServedInput[];
  /**
   * Served inputs left unsent, each with the reason, so a run that goes without
   * something can say what it went without. Optional-and-unheld is normal and
   * says so; it is still recorded rather than invisible.
   */
  skipped: Array<{ input: ServedInput; reason: string }>;
}

function hasValue(v: string | null | undefined): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Decide what to send, what to ask, and what is going unsent — from the
 * SERVED surface and what the caller holds. Pure: no network, no React, so the
 * rule is testable without a browser and cannot drift per call site.
 *
 * `answers` are what the person has typed into the inline asks so far; they
 * win over `known`, because a person who was asked has answered.
 */
export function planInvocation({
  inputs,
  known,
  answers = {},
}: {
  inputs: readonly ServedInput[];
  known: KnownValues;
  answers?: KnownValues;
}): InvocationPlan {
  const variables: Record<string, string> = {};
  const asks: ServedInput[] = [];
  const skipped: InvocationPlan["skipped"] = [];

  for (const input of inputs) {
    const answered = answers[input.name];
    const held = known[input.name];

    // A person's answer is the value, whatever the caller also holds.
    if (hasValue(answered)) {
      variables[input.name] = answered.trim();
      continue;
    }

    // 🚨 THE BINDING'S OWN QUESTION IS ALWAYS ASKED. The person who bound this
    // job chose to be asked; a caller quietly answering it from context would
    // overrule that decision invisibly, and skipping it fails the run with a
    // sentence about a "calling code path" nobody outside this repo can read.
    if (input.origin === "binding_prompt") {
      asks.push(input);
      continue;
    }

    if (hasValue(held)) {
      variables[input.name] = held.trim();
      continue;
    }

    // Held nothing. Whether that is fine is the SURFACE's call, not ours.
    if (input.sourcing === "require" || input.sourcing === "ask") {
      asks.push(input);
      continue;
    }

    skipped.push({
      input,
      reason: `"${input.label || input.name}" is optional here and this screen has nothing to put in it, so the run goes without it.`,
    });
  }

  return { variables, asks, skipped };
}

/** One sentence naming what a run is about to go without — printed, never
 * assumed. Empty string when nothing is being skipped. */
export function skippedSentence(plan: InvocationPlan): string {
  if (plan.skipped.length === 0) return "";
  const names = plan.skipped.map((s) => s.input.label || s.input.name);
  return names.length === 1
    ? `Running without ${names[0]} — this screen has nothing to put in it, and this job marks it optional.`
    : `Running without ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} — this screen has nothing to put in them, and this job marks them optional.`;
}

"use client";

/**
 * DenseIntake — frame zero of the console. Before anything starts the reader
 * sees, on ONE screen: what this workflow needs from them (the declared
 * inputs), what they will get (every deliverable, named), and the full plan
 * (every step of the definition). Nothing is a surprise later — the run
 * console shows the same plan and the same deliverables, filling in.
 *
 * Inputs are the SERVED surface (`GET /workflows/{id}/run-form`), rendered
 * through `ServedFieldControl` — THE one control for a declared input. This
 * file only arranges them densely: two columns, long text spanning both. The
 * arrangement is the variant; the fields, the gate and the submission are not.
 */


import { Package, Play } from "lucide-react";

import IconResolver from "@/components/official/icons/IconResolver";
import { cn } from "@/lib/utils";

import {
  EMPTY_SERVED_INPUTS,
  ServedFieldControl,
  ServedFormScream,
  useServedInputKinds,
  useServedInputValues,
} from "../../served-form/ServedInputFields";
import {
  buildSubmission,
  unsatisfiedServedInputs,
  type ServedSubmission,
} from "../../served-form/served-input";
import type { ServedRunFormState } from "../../served-form/useServedRunForm";
import type { WorkflowDefinitionLike } from "../../trigger-points";
import {
  FAMILY_ICON,
  FAMILY_STYLE,
  deliverableSteps,
  describeWorkflowSteps,
  familyNoun,
  humanizeKind,
} from "../../components/run/node-presentation";

export function DenseIntake({
  workflowName,
  definition,
  state,
  starting,
  onStart,
}: {
  workflowName: string;
  /** The plan and the deliverables still come from the graph. */
  definition: WorkflowDefinitionLike;
  /** The served input surface, fetched by the page. */
  state: ServedRunFormState;
  starting: boolean;
  onStart: (submission: ServedSubmission) => void;
}) {
  const steps = describeWorkflowSteps(definition);
  const deliverables = deliverableSteps(steps);

  const inputs =
    state.status === "ready" ? state.form.inputs : EMPTY_SERVED_INPUTS;
  const { values, touched, setValue } = useServedInputValues(inputs);
  const { kinds, error: kindError } = useServedInputKinds(inputs);
  const missing = unsatisfiedServedInputs(inputs, values, touched).map(
    (i) => i.label,
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1200px] px-3 py-3 sm:px-4">
        {/* One-line masthead: name + the run action, always visible. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 pb-2.5">
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
            {workflowName}
          </h1>
          {missing.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              Fill in: {missing.join(", ")}
            </span>
          ) : null}
          <button
            type="button"
            disabled={starting || missing.length > 0}
            onClick={() => onStart(buildSubmission(inputs, values, touched))}
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-opacity",
              starting || missing.length > 0
                ? "opacity-60"
                : "hover:opacity-90",
            )}
          >
            <Play className="h-3.5 w-3.5" />
            {starting ? "Starting…" : "Run it"}
          </button>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          {/* What it needs from you */}
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border/60 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              What it needs from you
            </div>
            {state.status === "loading" ? (
              <div className="space-y-2 p-3">
                <div className="h-9 animate-pulse rounded-md bg-muted/50" />
                <div className="h-9 animate-pulse rounded-md bg-muted/30" />
              </div>
            ) : state.status === "error" ? (
              <div className="p-3">
                <ServedFormScream
                  title="Could not load what this workflow needs"
                  body={`${state.message} The run form is SERVED (GET /workflows/{id}/run-form) — without it there is nothing honest to ask for.`}
                />
              </div>
            ) : inputs.length === 0 ? (
              <div className="p-3">
                {!state.form.surfaceServed ? (
                  <ServedFormScream
                    title="This backend serves no input surface"
                    body="The run-form response carried no `inputs` array, so the reachable server predates the compiled input surface. &ldquo;Nothing to fill in&rdquo; below is not a real answer."
                  />
                ) : null}
                <p className="text-sm text-muted-foreground">
                  Nothing — press Run and it takes it from here.
                </p>
              </div>
            ) : (
              <div className="space-y-3 p-3">
                {kindError ? (
                  <ServedFormScream title="Kind registry gap" body={kindError} />
                ) : null}
                <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2">
                  {inputs.map((input) => (
                    <label
                      key={input.name}
                      className={cn(
                        "block",
                        // Dense means two columns — but a long answer, a file
                        // or anything structured gets the full width, or the
                        // density costs the reader more than it saves.
                        spansBothColumns(input.jsonSchema, input.variant) &&
                          "sm:col-span-2",
                      )}
                    >
                      <span className="text-xs text-muted-foreground">
                        {input.label}
                        {input.sourcing === "optional" ? "" : " *"}
                      </span>
                      <ServedFieldControl
                        input={input}
                        kind={kinds[input.kind]}
                        value={values[input.name]}
                        onChange={(v) => setValue(input.name, v)}
                      />
                      {input.help ? (
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {input.help}
                        </span>
                      ) : null}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {/* What you'll get — named before anything starts. */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border/60 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                What you&apos;ll get
              </div>
              {deliverables.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">
                  Results are shown on screen as it works.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {deliverables.map((step) => (
                    <li
                      key={step.nodeId}
                      className="flex items-center gap-2 px-3 py-2"
                    >
                      <Package className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {step.outputKind
                          ? humanizeKind(step.outputKind)
                          : step.label}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        from &ldquo;{step.label}&rdquo;
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* The plan — every step, before the first one runs. */}
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  The plan
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {steps.length} step{steps.length === 1 ? "" : "s"}
                </span>
              </div>
              {steps.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">
                  This workflow has no steps yet.
                </p>
              ) : (
                <ol className="max-h-[40vh] overflow-y-auto py-1 scrollbar-thin">
                  {steps.map((step, index) => {
                    const style = FAMILY_STYLE[step.family];
                    return (
                      <li
                        key={step.nodeId}
                        className="flex items-center gap-2 px-3 py-1.5"
                      >
                        <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                          {index + 1}
                        </span>
                        <IconResolver
                          iconName={step.iconName ?? FAMILY_ICON[step.family]}
                          className={cn("h-3.5 w-3.5 shrink-0", style.text)}
                        />
                        <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                          {step.label}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {familyNoun(step.family)}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Which inputs refuse the dense two-column grid. The legacy form read a field
 * `type` ("long_text" | "file"); a served input carries a value contract and a
 * named variant instead, so the same judgement is made from those.
 */
function spansBothColumns(
  jsonSchema: Record<string, unknown>,
  variant: string | null,
): boolean {
  if (variant && /textarea|long|rich|markdown|file|upload/i.test(variant)) {
    return true;
  }
  const type = jsonSchema.type;
  if (type === "object" || type === "array") return true;
  return jsonSchema["ui:widget"] === "textarea";
}

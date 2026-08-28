"use client";

/**
 * Intake — the moment before the run. Collects the workflow's declared inputs
 * (the SERVED surface + the canonical `ServedFieldControl` — never a second
 * field renderer) and starts the run. The deliverables are already named on
 * the page (PromiseStrip) and the whole plan is already on the left; this is
 * just the one unmistakable action.
 */

import { Loader2, Play } from "lucide-react";

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

export function Intake({
  workflowName,
  state,
  deliverableCount,
  stepCount,
  starting,
  onStart,
}: {
  workflowName: string;
  /** The served input surface, fetched by the page. */
  state: ServedRunFormState;
  deliverableCount: number;
  stepCount: number;
  starting: boolean;
  onStart: (submission: ServedSubmission) => void;
}) {
  const inputs =
    state.status === "ready" ? state.form.inputs : EMPTY_SERVED_INPUTS;
  const { values, touched, setValue } = useServedInputValues(inputs);
  const { kinds, error: kindError } = useServedInputKinds(inputs);
  const missing = unsatisfiedServedInputs(inputs, values, touched).map(
    (i) => i.label,
  );
  const ready = missing.length === 0 && state.status !== "loading";

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium text-foreground">
          Run “{workflowName}”
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {stepCount} steps
          {deliverableCount > 0
            ? ` · ${deliverableCount} ${deliverableCount === 1 ? "thing" : "things"} you'll get at the end`
            : ""}
          . You can watch every step as it happens.
        </p>
      </header>

      <div className="space-y-4 p-4">
        {state.status === "error" ? (
          <ServedFormScream
            title="Could not load what this workflow needs"
            body={`${state.message} The run form is SERVED (GET /workflows/{id}/run-form) — without it there is nothing honest to ask for.`}
          />
        ) : null}
        {state.status === "ready" && !state.form.surfaceServed ? (
          <ServedFormScream
            title="This backend serves no input surface"
            body="The run-form response carried no `inputs` array, so the reachable server predates the compiled input surface."
          />
        ) : null}
        {kindError ? (
          <ServedFormScream title="Kind registry gap" body={kindError} />
        ) : null}
        {state.status === "loading" ? (
          <>
            <div className="h-9 animate-pulse rounded-md bg-muted/50" />
            <div className="h-9 animate-pulse rounded-md bg-muted/30" />
          </>
        ) : (
          <div className="space-y-2.5">
            {inputs.map((input) => (
              <label key={input.name} className="block">
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
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            disabled={starting || !ready}
            onClick={() => onStart(buildSubmission(inputs, values, touched))}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {starting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {starting ? "Starting…" : "Start"}
          </button>
          {state.status === "loading" ? (
            <p className="text-[11px] text-muted-foreground">
              Reading what it needs…
            </p>
          ) : missing.length > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Still needed: {missing.join(", ")}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

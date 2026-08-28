"use client";

/**
 * IntakePanel — the "before anything starts" half of the page: collect the
 * workflow's declared inputs (the SERVED surface rendered through the ONE
 * canonical control for a declared input) and start the run.
 *
 * The promise lives beside the ask: the reader sees what they will get back
 * before they give anything, so pressing Start is an informed trade, not a
 * leap.
 */

import { useState } from "react";
import { Play } from "lucide-react";

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

export function IntakePanel({
  state,
  starting,
  deliverableNames,
  stepCount,
  onStart,
}: {
  /** The served input surface, fetched by the page. */
  state: ServedRunFormState;
  starting: boolean;
  /** Humanised deliverable names, already derived from the definition. */
  deliverableNames: string[];
  stepCount: number;
  onStart: (submission: ServedSubmission) => void;
}) {
  const inputs =
    state.status === "ready" ? state.form.inputs : EMPTY_SERVED_INPUTS;
  const { values, touched, setValue } = useServedInputValues(inputs);
  const { kinds, error: kindError } = useServedInputKinds(inputs);
  const [triedToStart, setTriedToStart] = useState(false);

  const missing = unsatisfiedServedInputs(inputs, values, touched).map(
    (i) => i.label,
  );
  const canStart =
    missing.length === 0 && !starting && state.status !== "loading";

  const promise =
    deliverableNames.length > 0
      ? `When it finishes you'll have: ${deliverableNames.join(", ")}.`
      : "It reports its results on this page as it works.";

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          {state.status === "loading"
            ? "One moment"
            : inputs.length > 0
              ? "Before we start"
              : "Ready when you are"}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          This runs {stepCount} {stepCount === 1 ? "step" : "steps"} on its own
          once you start it. {promise}
        </p>
      </header>

      {state.status === "error" ? (
        <div className="px-4 py-3">
          <ServedFormScream
            title="Could not load what this workflow needs"
            body={`${state.message} The run form is SERVED (GET /workflows/{id}/run-form) — without it there is nothing honest to ask for.`}
          />
        </div>
      ) : state.status === "loading" ? (
        <div className="space-y-2 px-4 py-3">
          <div className="h-9 animate-pulse rounded-md bg-muted/50" />
          <div className="h-9 animate-pulse rounded-md bg-muted/30" />
        </div>
      ) : inputs.length > 0 ? (
        <div className="space-y-4 px-4 py-3">
          {kindError ? (
            <ServedFormScream title="Kind registry gap" body={kindError} />
          ) : null}
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
                  onChange={(next) => setValue(input.name, next)}
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
      ) : (
        <div className="px-4 py-3">
          {state.form.surfaceServed ? null : (
            <ServedFormScream
              title="This backend serves no input surface"
              body="The run-form response carried no `inputs` array, so the reachable server predates the compiled input surface."
            />
          )}
          <p className="text-xs text-muted-foreground">
            This workflow needs nothing from you up front.
          </p>
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        <button
          type="button"
          disabled={!canStart}
          onClick={() => {
            if (missing.length > 0) {
              setTriedToStart(true);
              return;
            }
            onStart(buildSubmission(inputs, values, touched));
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" />
          {starting ? "Starting…" : "Start"}
        </button>
        {/* Reserved line — appears without moving the button row. */}
        <span className="min-h-4 text-[11px] text-muted-foreground">
          {missing.length > 0 && (triedToStart || starting)
            ? `Still needed: ${missing.join(", ")}`
            : missing.length > 0
              ? `${missing.length} required ${missing.length === 1 ? "field" : "fields"} to fill in`
              : ""}
        </span>
      </footer>
    </section>
  );
}

"use client";

/**
 * IntakeCard — before anything starts: collect the workflow's declared inputs
 * (the SERVED surface → the ONE shared `ServedFieldControl`) and start the run.
 * The deliverables are already named on screen (PromiseStrip) and the whole
 * plan is already visible — this card is the only thing that leaves the page
 * when the run begins, and the run replaces it in the same slot.
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
import { RunStatusChip } from "../../run-status";
import type { RecentRunSummary } from "../../surface/service";

export function IntakeCard({
  workflowName,
  state,
  recentRuns,
  starting,
  onStart,
  onOpenRun,
}: {
  workflowName: string;
  /** The served input surface, fetched by the page. */
  state: ServedRunFormState;
  recentRuns: RecentRunSummary[];
  starting: boolean;
  onStart: (submission: ServedSubmission) => void;
  onOpenRun: (runId: string) => void;
}) {
  const inputs =
    state.status === "ready" ? state.form.inputs : EMPTY_SERVED_INPUTS;
  const { values, touched, setValue } = useServedInputValues(inputs);
  const { kinds, error: kindError } = useServedInputKinds(inputs);
  const missing = unsatisfiedServedInputs(inputs, values, touched).map(
    (i) => i.label,
  );

  return (
    <section
      aria-label="Start this workflow"
      className="rounded-xl border border-border bg-card"
    >
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          {state.status === "loading"
            ? `Reading what “${workflowName}” needs…`
            : inputs.length > 0
              ? `What should “${workflowName}” work with?`
              : `“${workflowName}” needs nothing from you to start.`}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {state.status === "loading"
            ? "Its declared inputs are being read."
            : inputs.length > 0
              ? "Answer below, press Start, and watch it deliver."
              : "Press Start and watch it deliver."}
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
                <span className="text-xs font-medium text-foreground">
                  {input.label}
                  {input.sourcing === "optional" ? null : (
                    <span className="text-destructive"> *</span>
                  )}
                </span>
                {input.help ? (
                  <span className="block text-[11px] text-muted-foreground">
                    {input.help}
                  </span>
                ) : null}
                <ServedFieldControl
                  input={input}
                  kind={kinds[input.kind]}
                  value={values[input.name]}
                  onChange={(v) => setValue(input.name, v)}
                />
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            disabled={starting || state.status === "loading" || missing.length > 0}
            onClick={() => onStart(buildSubmission(inputs, values, touched))}
            className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {starting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Play className="h-4 w-4" aria-hidden />
            )}
            {starting ? "Starting…" : "Start"}
          </button>
          {/* Fixed-height hint slot — the button row never jumps. */}
          <p className="min-h-[1rem] flex-1 text-xs text-muted-foreground">
            {missing.length > 0
              ? `Still needed: ${missing.join(", ")}`
              : ""}
          </p>
        </div>
      </div>

      {recentRuns.length > 0 ? (
        <footer className="border-t border-border px-4 py-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Earlier runs
          </h3>
          <ul className="mt-1.5 space-y-1">
            {recentRuns.slice(0, 5).map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  onClick={() => onOpenRun(run.id)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted/60"
                >
                  <RunStatusChip status={run.status} />
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </footer>
      ) : null}
    </section>
  );
}

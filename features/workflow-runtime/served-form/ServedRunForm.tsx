"use client";

/**
 * ServedRunForm — THE run form, generated from the SERVED input surface.
 *
 * Ruled design: common-docs `systems/workflows/INPUT-SURFACE.md`. A
 * workflow's inputs are ONE declared surface, compiled server-side and served
 * by `GET /workflows/{id}/run-form`. This component is the first of that
 * declaration's four consumers — the run form — and it holds NOTHING that the
 * other three (programmatic callers, mandate delivery, the tool schema) do
 * not also address by the same names.
 *
 * ─── What is here, and what is NOT ──────────────────────────────────────────
 * The FIELDS are `ServedInputFields` — values in, values out, no submission
 * semantics of its own, shared with every other collector of this surface (the
 * trigger editor, the masterwork try-box, the bake-off intakes). What this
 * component adds is exactly the start machinery: the gate, the Start button,
 * the provenance claim, and the 409 gap list.
 *
 * THIS COMPOSITION IS THE ONLY ONE ALLOWED TO CLAIM `human`. It is the
 * human-facing start path, so exactly the values a person typed here travel
 * stamped `human`; seeded defaults are left to the server, and pinned values
 * are shown read-only and never echoed back. A collector that is not a run
 * start (a schedule's saved defaults) stamps nothing.
 *
 * Sourcing drives presentation, not decoration: `ask` and `require` are
 * always visible and gate the Start button; `optional` collapses behind
 * "More". A start the server refuses with 409 `inputs_required` renders the
 * server's own gap list — a run that needs an input is never a dead end.
 */

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

import {
  buildSubmission,
  unsatisfiedServedInputs,
  type ServedInputGap,
} from "./served-input";
import {
  EMPTY_SERVED_INPUTS,
  ServedFormScream,
  ServedInputFields,
  useServedInputKinds,
  useServedInputValues,
} from "./ServedInputFields";
import {
  useServedRunForm,
  useServedRunStart,
  type ServedRunFormState,
} from "./useServedRunForm";

export interface ServedRunFormProps {
  definitionId: string;
  /** Called with the new run id once the server accepts the start. */
  onStarted: (runId: string) => void;
  /** Copy above the fields. The surface itself never carries page chrome. */
  heading?: string;
  startLabel?: string;
  /**
   * The already-fetched surface, when the HOST had to read it first.
   *
   * The shipped run form (`RunStartForm`) must know whether a served surface
   * exists BEFORE it decides between this component and the legacy derivation,
   * so it holds the fetch. Passing the answer down is the alternative to two
   * components asking the same endpoint the same question on the same paint.
   * Omitted → this component fetches for itself, exactly as the bake-off does.
   */
  state?: ServedRunFormState;
}

export function ServedRunForm({
  definitionId,
  onStarted,
  heading = "What it needs from you",
  startLabel = "Start",
  state: hoistedState,
}: ServedRunFormProps) {
  // `null` when the host already holds the answer — the hook then makes no
  // request at all, so the endpoint is asked exactly once per paint either way.
  const ownState = useServedRunForm(hoistedState ? null : definitionId);
  const state = hoistedState ?? ownState;
  const { starting, start } = useServedRunStart();

  const inputs =
    state.status === "ready" ? state.form.inputs : EMPTY_SERVED_INPUTS;

  // ── The draft: seeded values + the names a PERSON actually answered ──────
  const { values, touched, setValue } = useServedInputValues(inputs);
  const { kinds, error: kindError } = useServedInputKinds(inputs);

  const [triedToStart, setTriedToStart] = useState(false);
  const [serverGaps, setServerGaps] = useState<ServedInputGap[] | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const gaps = unsatisfiedServedInputs(inputs, values, touched);
  const gapNames = new Set(gaps.map((g) => g.name));

  const submit = () => {
    setTriedToStart(true);
    setStartError(null);
    setServerGaps(null);
    if (gaps.length > 0) return;
    void start(definitionId, buildSubmission(inputs, values, touched)).then(
      (outcome) => {
        if (outcome.status === "started") onStarted(outcome.runId);
        else if (outcome.status === "gaps") setServerGaps(outcome.gaps);
        else setStartError(outcome.message);
      },
    );
  };

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading what this workflow needs…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <ServedFormScream
        title="Could not load the run form"
        body={`${state.message} The run form is SERVED (GET /workflows/{id}/run-form) — without it there is nothing honest to render.`}
      />
    );
  }

  return (
    <div>
      {!state.form.surfaceServed && (
        <ServedFormScream
          title="This backend serves no input surface"
          body={
            state.form.derivedFromSections
              ? "The run-form response carried no `inputs` array, so the reachable server predates the compiled input surface. The fields below were reconstructed from the response's older `sections` schema: no input can be marked as one a person must answer EVERY run, no kind is declared (so a named presentation variant cannot resolve), and nothing can be shown as pinned. Point at a server that serves the surface."
              : "The run-form response carried no `inputs` array and no readable `sections` schema either, so the reachable server predates the compiled input surface and told us nothing about what this workflow asks for. Nothing below is a real declaration — point at a server that serves it."
          }
        />
      )}
      {kindError && (
        <ServedFormScream title="Kind registry gap" body={kindError} />
      )}

      <ServedInputFields
        inputs={inputs}
        values={values}
        onChange={setValue}
        heading={heading}
        flaggedNames={triedToStart ? gapNames : undefined}
        kinds={kinds}
      />

      <div className="mt-5">
        <button
          type="button"
          onClick={submit}
          disabled={starting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto sm:min-w-64"
        >
          {starting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting…
            </>
          ) : (
            <>
              {startLabel}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        {triedToStart && gaps.length > 0 && (
          <p className="mt-2 text-xs text-destructive">
            Still needed:{" "}
            {gaps
              .map((g) =>
                g.sourcing === "ask"
                  ? `${g.label} (you answer this every run)`
                  : g.label,
              )
              .join(", ")}
            .
          </p>
        )}

        {serverGaps && (
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
              {serverGaps.length === 0
                ? "The server refused to start this run for want of an input — but it did not say which."
                : `The server needs ${serverGaps.length} ${
                    serverGaps.length === 1 ? "input" : "inputs"
                  } before this run can start:`}
            </p>
            {serverGaps.length === 0 && (
              <p className="mt-1 text-[11px] text-amber-800/80 dark:text-amber-200/80">
                🚨 The 409 carried <code className="font-mono">inputs_required</code>{" "}
                but no <code className="font-mono">missing</code> list — aidream&apos;s
                error middleware flattens the detail and drops it. Server-side
                defect: carry the gap list through the normalizer. Nothing you
                entered was lost.
              </p>
            )}
            <ul className="mt-1 space-y-0.5">
              {serverGaps.map((gap) => (
                <li
                  key={gap.name}
                  className="text-xs text-amber-800 dark:text-amber-200"
                >
                  <span className="font-medium">{gap.label}</span>
                  <span className="ml-1.5 text-[11px] opacity-80">
                    {gap.kind} · {gap.sourcing}
                  </span>
                  {gap.help ? (
                    <span className="ml-1.5 text-[11px] opacity-80">
                      — {gap.help}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] text-amber-800/80 dark:text-amber-200/80">
              Fill them in above and start again — nothing was lost.
            </p>
          </div>
        )}

        {startError && (
          <p className="mt-2 text-xs text-destructive">{startError}</p>
        )}
      </div>
    </div>
  );
}

export default ServedRunForm;

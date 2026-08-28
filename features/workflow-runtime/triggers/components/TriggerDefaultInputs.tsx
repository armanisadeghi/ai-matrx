"use client";

/**
 * TriggerDefaultInputs — "what should it work with, every time?"
 *
 * A workflow that asks a person questions before it runs still has to answer
 * them when NOBODY IS THERE. That is what a trigger's `default_inputs` is, so
 * this renders the workflow's ONE declared input surface — the same
 * `GET /workflows/{id}/run-form` the Run button renders — through the same
 * `ServedInputFields`. Never a second input authoring path, and never a
 * narrower one: the derivation this replaced could only see `io.user_input`
 * nodes, so an input declared anywhere else in the graph was invisible here
 * and the schedule was saved without it.
 *
 * What it does NOT take from the run form is the submission: no Start, and no
 * `input_sources`. A schedule is not a person answering.
 */

import { useMemo } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import {
  EMPTY_SERVED_INPUTS,
  ServedFormScream,
  ServedInputFields,
  useServedInputKinds,
} from "../../served-form/ServedInputFields";
import type { ServedRunFormState } from "../../served-form/useServedRunForm";
import { collidingInputNames, missingTriggerInputs, triggerDefaultInputs } from "../default-inputs";

export function TriggerDefaultInputs({
  state,
  values,
  onChange,
}: {
  /** The served surface, fetched by the HOST (it needs the inputs to save). */
  state: ServedRunFormState;
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
}) {
  const inputs =
    state.status === "ready" ? state.form.inputs : EMPTY_SERVED_INPUTS;
  const { kinds, error: kindError } = useServedInputKinds(inputs);

  const collisions = useMemo(() => collidingInputNames(inputs), [inputs]);
  const missing = useMemo(
    () => missingTriggerInputs(inputs, triggerDefaultInputs(inputs, values)),
    [inputs, values],
  );

  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading what this workflow needs…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <ServedFormScream
        title="Could not load what this workflow needs"
        body={`${state.message} A schedule's answers are authored against the workflow's declared input surface (GET /workflows/{id}/run-form) — without it there is nothing honest to fill in, and saving now would turn on a schedule with no answers.`}
      />
    );
  }

  return (
    <div className="space-y-3">
      {!state.form.surfaceServed && (
        <ServedFormScream
          title="This backend serves no input surface"
          body="The run-form response carried no `inputs` array, so the reachable server predates the compiled input surface. Nothing below is a real declaration — point at a server that serves it."
        />
      )}
      {kindError && (
        <ServedFormScream title="Kind registry gap" body={kindError} />
      )}

      <ServedInputFields
        inputs={inputs}
        values={values}
        onChange={onChange}
        heading=""
        kinds={kinds}
        emptyMessage="This workflow doesn't ask for anything before it runs, so there is nothing to fill in here."
      />

      {missing.length > 0 ? (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-500">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Nobody will be here to answer when this runs on its own, so fill in{" "}
            {missing.join(", ")} or the run will stop on its first step.
          </span>
        </p>
      ) : null}

      {collisions.length > 0 ? (
        <ServedFormScream
          title="The served surface declares a name twice"
          body={`${collisions.join(", ")} appears more than once in this workflow's compiled input surface, which is name-unique by contract. One value would be sent to both declarations. This is a server-side defect in the surface compiler, not something to author around.`}
        />
      ) : null}
    </div>
  );
}

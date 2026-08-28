"use client";

/**
 * RunStartForm — THE start surface of the shipped run page, and the one place
 * that decides how a workflow's inputs are asked for.
 *
 * ─── The adoption (Volley 5) ────────────────────────────────────────────────
 * The inputs of a workflow are ONE declared surface, compiled server-side and
 * served by `GET /workflows/{id}/run-form` (common-docs
 * `systems/workflows/INPUT-SURFACE.md`). `ServedRunForm` is the proven consumer
 * of that contract, and it is what this component renders whenever the surface
 * is actually served.
 *
 * ─── The fallback, and why it is LOUD ───────────────────────────────────────
 * A reachable server that predates the compiled input surface answers
 * `/run-form` with no `inputs` array, or refuses it outright. That is a version
 * skew, not a shape of workflow — so the legacy client-side derivation
 * (`deriveRunForm` over the definition's `io.user_input` nodes) renders in its
 * place WITH A BANNER SAYING SO. One component, one visible fallback path:
 * nobody should ever be looking at the derived form without knowing they are,
 * because the derived form cannot see an input the graph declares anywhere
 * other than a user_input node, and it cannot stamp `input_sources`.
 *
 * The legacy branch and its helpers (`deriveRunForm` / `seedRunFormValues` /
 * `RunFormFieldControl`) are NOT dead: the trigger surface authors the same
 * fields as a schedule's default inputs through the same control. Their
 * deletion is its own sweep, once every consumer is served.
 */

import { useState } from "react";
import { Play, TriangleAlert } from "lucide-react";

import { RunFormFieldControl } from "./RunFormFieldControl";

import { ServedRunForm } from "../served-form/ServedRunForm";
import { useServedRunForm } from "../served-form/useServedRunForm";
import {
  deriveRunForm,
  missingRequiredFields,
  seedRunFormValues,
  type RunFormSection,
} from "../surface/run-form";
import type { WorkflowDefinitionLike } from "../trigger-points";

export function RunStartForm({
  definitionId,
  definition,
  starting,
  startLabel,
  onStart,
  onStarted,
  onCancel,
}: {
  /** The workflow whose served input surface is asked for. */
  definitionId: string;
  definition: WorkflowDefinitionLike;
  starting: boolean;
  /** e.g. "Run" / "Run step-by-step" — names the verb being confirmed. */
  startLabel: string;
  /** LEGACY branch only: the derived `node_inputs`, started by the host. */
  onStart: (nodeInputs: Record<string, Record<string, unknown>>) => void;
  /** SERVED branch: the served form starts the run itself and hands back the id. */
  onStarted: (runId: string) => void;
  onCancel: () => void;
}) {
  // THE GUARD. The host holds the fetch so this decision is made once, before
  // either branch mounts, and the served component never re-asks (it takes the
  // answer as a prop). "Served" means: the endpoint answered AND the answer
  // carried a real `inputs` declaration.
  const served = useServedRunForm(definitionId);
  const surfaceServed =
    served.status === "ready" && served.form.surfaceServed;

  if (served.status === "loading") {
    return (
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-9 animate-pulse rounded bg-muted/60" />
      </div>
    );
  }

  if (surfaceServed) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-card p-3">
        <ServedRunForm
          definitionId={definitionId}
          state={served}
          onStarted={onStarted}
          startLabel={startLabel}
        />
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <LegacyDerivedForm
      definition={definition}
      starting={starting}
      startLabel={startLabel}
      onStart={onStart}
      onCancel={onCancel}
      why={
        served.status === "error"
          ? served.message
          : "The run-form response carried no `inputs` array."
      }
    />
  );
}

/**
 * THE FALLBACK BRANCH — the pre-contract derivation, never silent.
 *
 * One section per `io.user_input` node, fields from the author's declarations,
 * values submitted as the start request's `node_inputs`. Required gating
 * happens here in plain language; the engine validates again server-side.
 */
function LegacyDerivedForm({
  definition,
  starting,
  startLabel,
  onStart,
  onCancel,
  why,
}: {
  definition: WorkflowDefinitionLike;
  starting: boolean;
  startLabel: string;
  onStart: (nodeInputs: Record<string, Record<string, unknown>>) => void;
  onCancel: () => void;
  why: string;
}) {
  // Sections derive purely from the definition; the definition is loaded
  // once per selection, so deriving on render is cheap and always fresh.
  const sections: RunFormSection[] = deriveRunForm(definition);
  const [values, setValues] = useState<
    Record<string, Record<string, unknown>>
  >(() => seedRunFormValues(sections));

  const setField = (nodeId: string, key: string, v: unknown) =>
    setValues((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], [key]: v },
    }));

  const missing = missingRequiredFields(sections, values);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div
        data-run-form-branch="legacy"
        className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2"
      >
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
            Asking the old way
          </p>
          <p className="mt-0.5 text-[11px] text-amber-800/90 dark:text-amber-200/90">
            {why} These fields are worked out from the workflow&apos;s own steps
            rather than from its declared input surface, so an input declared
            anywhere else will not appear here. Point at a server that serves{" "}
            <code className="font-mono">/run-form</code>.
          </p>
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          This workflow asks for nothing — it starts with one click.
        </p>
      ) : (
        sections.map((section) => (
          <div key={section.nodeId} className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {section.title}
            </h3>
            {section.fields.map((field) => (
              <label key={field.key} className="block">
                <span className="text-xs text-muted-foreground">
                  {field.label}
                  {field.required ? " *" : ""}
                </span>
                <RunFormFieldControl
                  field={field}
                  value={values[section.nodeId]?.[field.key]}
                  onChange={(v) => setField(section.nodeId, field.key, v)}
                />
                {field.help ? (
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {field.help}
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        ))
      )}

      <div className="flex items-center gap-2 border-t border-border pt-2">
        <button
          type="button"
          disabled={starting || missing.length > 0}
          onClick={() => onStart(values)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" />
          {starting ? "Starting…" : startLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground"
        >
          Cancel
        </button>
        {missing.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            Still needed: {missing.join(", ")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

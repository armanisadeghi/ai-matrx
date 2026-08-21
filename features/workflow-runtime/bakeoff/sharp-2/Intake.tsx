"use client";

/**
 * Intake — the moment before the run. Collects the workflow's declared inputs
 * (the canonical `deriveRunForm` + `RunFormFieldControl` — never a second
 * field renderer) and starts the run. The deliverables are already named on
 * the page (PromiseStrip) and the whole plan is already on the left; this is
 * just the one unmistakable action.
 */

import { useState } from "react";
import { Loader2, Play } from "lucide-react";

import { RunFormFieldControl } from "../../components/RunFormFieldControl";
import {
  missingRequiredFields,
  seedRunFormValues,
  type RunFormSection,
} from "../../surface/run-form";

export function Intake({
  workflowName,
  sections,
  deliverableCount,
  stepCount,
  starting,
  onStart,
}: {
  workflowName: string;
  sections: RunFormSection[];
  deliverableCount: number;
  stepCount: number;
  starting: boolean;
  onStart: (nodeInputs: Record<string, Record<string, unknown>>) => void;
}) {
  const [values, setValues] = useState<Record<string, Record<string, unknown>>>(
    () => seedRunFormValues(sections),
  );
  const missing = missingRequiredFields(sections, values);
  const ready = missing.length === 0;

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
        {sections.map((section) => (
          <fieldset key={section.nodeId} className="space-y-2.5">
            {sections.length > 1 ? (
              <legend className="text-xs font-medium text-foreground">
                {section.title}
              </legend>
            ) : null}
            {section.fields.map((field) => (
              <label key={field.key} className="block">
                <span className="text-xs text-muted-foreground">
                  {field.label}
                  {field.required ? " *" : ""}
                </span>
                <RunFormFieldControl
                  field={field}
                  value={values[section.nodeId]?.[field.key]}
                  onChange={(v) =>
                    setValues((prev) => ({
                      ...prev,
                      [section.nodeId]: {
                        ...(prev[section.nodeId] ?? {}),
                        [field.key]: v,
                      },
                    }))
                  }
                />
                {field.help ? (
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {field.help}
                  </span>
                ) : null}
              </label>
            ))}
          </fieldset>
        ))}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            disabled={starting || !ready}
            onClick={() => onStart(values)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {starting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {starting ? "Starting…" : "Start"}
          </button>
          {!ready ? (
            <p className="text-[11px] text-muted-foreground">
              Still needed: {missing.join(", ")}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

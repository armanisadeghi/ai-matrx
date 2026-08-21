"use client";

/**
 * IntakePanel — the "before anything starts" half of the page: collect the
 * workflow's declared inputs (deriveRunForm sections rendered through the ONE
 * canonical field control) and start the run.
 *
 * The promise lives beside the ask: the reader sees what they will get back
 * before they give anything, so pressing Start is an informed trade, not a
 * leap.
 */

import { useState } from "react";
import { Play } from "lucide-react";

import { RunFormFieldControl } from "../../components/RunFormFieldControl";
import {
  missingRequiredFields,
  seedRunFormValues,
  type RunFormSection,
} from "../../surface/run-form";

export function IntakePanel({
  sections,
  starting,
  deliverableNames,
  stepCount,
  onStart,
}: {
  sections: RunFormSection[];
  starting: boolean;
  /** Humanised deliverable names, already derived from the definition. */
  deliverableNames: string[];
  stepCount: number;
  onStart: (nodeInputs: Record<string, Record<string, unknown>>) => void;
}) {
  const [values, setValues] = useState<Record<string, Record<string, unknown>>>(
    () => seedRunFormValues(sections),
  );
  const [triedToStart, setTriedToStart] = useState(false);

  const missing = missingRequiredFields(sections, values);
  const canStart = missing.length === 0 && !starting;

  const promise =
    deliverableNames.length > 0
      ? `When it finishes you'll have: ${deliverableNames.join(", ")}.`
      : "It reports its results on this page as it works.";

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          {sections.length > 0 ? "Before we start" : "Ready when you are"}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          This runs {stepCount} {stepCount === 1 ? "step" : "steps"} on its own
          once you start it. {promise}
        </p>
      </header>

      {sections.length > 0 ? (
        <div className="space-y-4 px-4 py-3">
          {sections.map((section) => (
            <fieldset key={section.nodeId}>
              {sections.length > 1 ? (
                <legend className="mb-1.5 text-xs font-medium text-foreground">
                  {section.title}
                </legend>
              ) : null}
              <div className="space-y-2.5">
                {section.fields.map((field) => (
                  <label key={field.key} className="block">
                    <span className="text-xs text-muted-foreground">
                      {field.label}
                      {field.required ? " *" : ""}
                    </span>
                    <RunFormFieldControl
                      field={field}
                      value={values[section.nodeId]?.[field.key]}
                      onChange={(next) =>
                        setValues((prev) => ({
                          ...prev,
                          [section.nodeId]: {
                            ...prev[section.nodeId],
                            [field.key]: next,
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
              </div>
            </fieldset>
          ))}
        </div>
      ) : (
        <p className="px-4 py-3 text-xs text-muted-foreground">
          This workflow needs nothing from you up front.
        </p>
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
            onStart(values);
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

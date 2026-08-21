"use client";

/**
 * IntakeCard — before anything starts: collect the workflow's declared inputs
 * (deriveRunForm → the ONE shared RunFormFieldControl) and start the run.
 * The deliverables are already named on screen (PromiseStrip) and the whole
 * plan is already visible — this card is the only thing that leaves the page
 * when the run begins, and the run replaces it in the same slot.
 */

import { useState } from "react";
import { Loader2, Play } from "lucide-react";

import { RunFormFieldControl } from "../../components/RunFormFieldControl";
import {
  missingRequiredFields,
  seedRunFormValues,
  type RunFormSection,
} from "../../surface/run-form";
import { RunStatusChip } from "../../run-status";
import type { RecentRunSummary } from "../../surface/service";

export function IntakeCard({
  workflowName,
  sections,
  recentRuns,
  starting,
  onStart,
  onOpenRun,
}: {
  workflowName: string;
  sections: RunFormSection[];
  recentRuns: RecentRunSummary[];
  starting: boolean;
  onStart: (nodeInputs: Record<string, Record<string, unknown>>) => void;
  onOpenRun: (runId: string) => void;
}) {
  const [values, setValues] = useState<
    Record<string, Record<string, unknown>>
  >(() => seedRunFormValues(sections));
  const missing = missingRequiredFields(sections, values);

  return (
    <section
      aria-label="Start this workflow"
      className="rounded-xl border border-border bg-card"
    >
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          {sections.length > 0
            ? `What should “${workflowName}” work with?`
            : `“${workflowName}” needs nothing from you to start.`}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {sections.length > 0
            ? "Answer below, press Start, and watch it deliver."
            : "Press Start and watch it deliver."}
        </p>
      </header>

      <div className="space-y-4 p-4">
        {sections.map((section) => (
          <fieldset key={section.nodeId} className="space-y-2.5">
            {sections.length > 1 ? (
              <legend className="text-xs font-medium text-muted-foreground">
                {section.title}
              </legend>
            ) : null}
            {section.fields.map((field) => (
              <label key={field.key} className="block">
                <span className="text-xs font-medium text-foreground">
                  {field.label}
                  {field.required ? (
                    <span className="text-destructive"> *</span>
                  ) : null}
                </span>
                {field.help ? (
                  <span className="block text-[11px] text-muted-foreground">
                    {field.help}
                  </span>
                ) : null}
                <RunFormFieldControl
                  field={field}
                  value={values[section.nodeId]?.[field.key]}
                  onChange={(v) =>
                    setValues((prev) => ({
                      ...prev,
                      [section.nodeId]: {
                        ...prev[section.nodeId],
                        [field.key]: v,
                      },
                    }))
                  }
                />
              </label>
            ))}
          </fieldset>
        ))}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            disabled={starting || missing.length > 0}
            onClick={() => onStart(values)}
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

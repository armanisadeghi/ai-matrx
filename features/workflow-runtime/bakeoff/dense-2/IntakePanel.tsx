"use client";

/**
 * IntakePanel — the center pane before a run exists: the workflow's declared
 * inputs (deriveRunForm → RunFormFieldControl, the ONE field renderer), the
 * promises restated ("you will get"), recent runs as doors, and Start.
 *
 * Promise-first: the same deliverables named here become the delivered
 * artifacts on this same page — one continuous thread.
 */

import { useEffect, useState } from "react";
import { History, Play } from "lucide-react";

import { toast } from "@/lib/toast";

import { RunFormFieldControl } from "../../components/RunFormFieldControl";
import { RunStatusChip } from "../../run-status";
import { humanizeKind } from "../../components/run/node-presentation";
import {
  deriveRunForm,
  missingRequiredFields,
  seedRunFormValues,
  type RunFormSection,
} from "../../surface/run-form";
import { listRecentRuns, type RecentRunSummary } from "../../surface/service";
import { useWorkflowRunControls } from "../../hooks/useWorkflowRunControls";
import type { WorkflowDefinitionLike } from "../../trigger-points";
import type { RunStepPresentation } from "../../components/run/node-presentation";

export function IntakePanel({
  definitionId,
  definition,
  deliverables,
  onStarted,
  onOpenRun,
}: {
  definitionId: string;
  definition: WorkflowDefinitionLike;
  deliverables: RunStepPresentation[];
  onStarted: (runId: string) => void;
  onOpenRun: (runId: string) => void;
}) {
  const sections: RunFormSection[] = deriveRunForm(definition);
  const [values, setValues] = useState<Record<string, Record<string, unknown>>>(
    () => seedRunFormValues(sections),
  );
  const { startRun, starting } = useWorkflowRunControls();
  const [recent, setRecent] = useState<RecentRunSummary[] | null>(null);
  const [recentFailed, setRecentFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listRecentRuns(definitionId, 6)
      .then((runs) => {
        if (!cancelled) setRecent(runs);
      })
      .catch(() => {
        if (!cancelled) setRecentFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [definitionId]);

  const missing = missingRequiredFields(sections, values);

  const start = async () => {
    if (missing.length > 0) {
      toast.error(`Still needed: ${missing.join(", ")}`);
      return;
    }
    const runId = await startRun({
      definitionId,
      nodeInputs: sections.length > 0 ? values : undefined,
    });
    if (runId) onStarted(runId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Before we start
        </span>
        <button
          type="button"
          disabled={starting || missing.length > 0}
          onClick={() => void start()}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" />
          {starting ? "Starting…" : "Start"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-3">
        {deliverables.length > 0 ? (
          <div className="mb-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              You will get
            </p>
            <p className="mt-0.5 text-sm text-foreground">
              {deliverables
                .map((step) => humanizeKind(step.outputKind ?? step.label))
                .join(" · ")}
            </p>
          </div>
        ) : null}

        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This workflow needs nothing from you — press Start and watch it
            work.
          </p>
        ) : (
          <div className="space-y-4">
            {sections.map((section) => (
              <fieldset key={section.nodeId}>
                <legend className="mb-1.5 text-sm font-medium text-foreground">
                  {section.title}
                </legend>
                <div className="space-y-2">
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
                              ...prev[section.nodeId],
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
                </div>
              </fieldset>
            ))}
            {missing.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Still needed: {missing.join(", ")}
              </p>
            ) : null}
          </div>
        )}

        <div className="mt-5 border-t border-border pt-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <History className="h-3.5 w-3.5" />
            Earlier runs
          </p>
          {recentFailed ? (
            <p className="text-xs text-muted-foreground">
              Couldn't check earlier runs right now.
            </p>
          ) : recent === null ? (
            <p className="text-xs text-muted-foreground">Checking…</p>
          ) : recent.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              This workflow hasn't run yet — yours will be the first.
            </p>
          ) : (
            <div className="space-y-0.5">
              {recent.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => onOpenRun(run.id)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent/50"
                >
                  <RunStatusChip status={run.status} />
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

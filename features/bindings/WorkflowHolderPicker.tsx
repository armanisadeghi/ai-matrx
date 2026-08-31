"use client";

// features/bindings/WorkflowHolderPicker.tsx
//
// THE WORKFLOW HOLDER PICKER — lifted verbatim out of the four-step override
// wizard (`features/mandates/workspace/OverrideFlow.tsx`, deleted 2026-08-31)
// into the scope + holder bar, where the holder choice now lives for every host.
//
// Workflows that DECLARE this mandate's output kind come first — those are the
// ones the bind gate can accept on the declaration alone. The rest are listed,
// not hidden: the gate also accepts a workflow whose computed DELIVERABLES
// produce the kind, and deliverables are compiled from the graph, so no column
// here can know. The gate decides; its refusals are shown verbatim.

import { useEffect, useState } from "react";
import { AlertTriangle, CircleCheck, Workflow as WorkflowIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchWorkflowHolderCandidates,
  type WorkflowHolderCandidate,
  type WorkflowHolderCandidates,
} from "@/features/mandates/workflow-holders";

export function WorkflowHolderPicker({
  mandateOutputKind,
  value,
  onChange,
  disabled,
}: {
  mandateOutputKind: string | null;
  value: string | null;
  onChange: (id: string | null) => void;
  disabled: boolean;
}) {
  const [candidates, setCandidates] = useState<WorkflowHolderCandidates | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchWorkflowHolderCandidates(mandateOutputKind)
      .then((result) => {
        if (!cancelled) {
          setCandidates(result);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mandateOutputKind, reloads]);

  if (error) {
    return (
      <div className="mt-2 space-y-1.5">
        <p className="flex items-start gap-1.5 text-[12px] text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Workflows could not be read: {error}
        </p>
        {/* Never a dead end — the old picker errored with no way forward. */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11.5px]"
          onClick={() => {
            setError(null);
            setReloads((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (!candidates) {
    return (
      <p className="mt-2 text-[12px] text-muted-foreground">
        Loading workflows…
      </p>
    );
  }

  const { matching, others } = candidates;
  const shown = showAll ? [...matching, ...others] : matching;

  return (
    <div className="mt-2 space-y-2">
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        {mandateOutputKind ? (
          <>
            This job answers in{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              {mandateOutputKind}
            </code>
            . {matching.length} workflow{matching.length === 1 ? "" : "s"}{" "}
            declare{matching.length === 1 ? "s" : ""} it.
          </>
        ) : (
          "This job declares no output kind, so no workflow can match on its declaration alone — the server decides when you save."
        )}
      </p>

      {shown.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          No workflow declares this kind.{" "}
          {others.length > 0
            ? "One of the others may still qualify through its deliverables."
            : "Nothing to choose from."}
        </p>
      ) : (
        <ul className="max-h-56 divide-y divide-border/40 overflow-y-auto rounded-lg border border-border/50">
          {shown.map((workflow) => (
            <WorkflowRow
              key={workflow.id}
              workflow={workflow}
              selected={workflow.id === value}
              disabled={disabled}
              onSelect={() => onChange(workflow.id)}
            />
          ))}
        </ul>
      )}

      {others.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[11.5px] text-muted-foreground"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll
            ? `Show only the ${matching.length} that declare it`
            : `Show all ${matching.length + others.length} workflows — the rest may still qualify through their deliverables`}
        </Button>
      ) : null}
    </div>
  );
}

function WorkflowRow({
  workflow,
  selected,
  disabled,
  onSelect,
}: {
  workflow: WorkflowHolderCandidate;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
          selected ? "bg-muted/60" : "hover:bg-muted/30",
        )}
      >
        <WorkflowIcon
          className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0",
            selected ? "text-primary" : "text-muted-foreground",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium text-foreground">
            {workflow.name}
          </span>
          {workflow.description ? (
            <span className="block truncate text-[11px] text-muted-foreground">
              {workflow.description}
            </span>
          ) : null}
        </span>
        {workflow.declaresMandateKind ? (
          <Badge
            variant="outline"
            className="shrink-0 border-emerald-500/30 py-0 text-[9.5px] text-emerald-700 dark:text-emerald-400"
          >
            {workflow.outputKind}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="shrink-0 py-0 text-[9.5px] text-muted-foreground"
          >
            {workflow.outputKind ?? "undeclared"}
          </Badge>
        )}
        {selected ? (
          <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        ) : null}
      </button>
    </li>
  );
}

"use client";

// features/meet/components/manage/AfterMeetingWorkflows.tsx
//
// "RUN A WORKFLOW AFTER THIS MEETING" (Meet wave 4) — Zoom Workflows' meeting
// trigger, on the meeting itself. The host picks workflows with the ONE
// workflow picker (`WorkflowListDropdown`); when the meeting's outcome is known
// (the wrap-up landed, or AI was off) aidream starts each one as the host with
// the meeting's summary, decisions, action items and attendees as inputs the
// workflow declares (`meeting_summary`, `meeting_action_items`, …). What ran is
// shown back here with a door to each run.

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { WorkflowListDropdown } from "@/features/workflow-runtime/listings/WorkflowListDropdown";

export interface AfterMeetingRunRecord {
  readonly definition_id: string;
  readonly run_id?: string | null;
  readonly status?: string | null;
  readonly error?: string | null;
  readonly missing_inputs?: readonly string[];
}

/** `metadata.after_meeting_workflows` → the ids, in order. */
export function afterWorkflowIds(metadata: unknown): string[] {
  const raw =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>).after_meeting_workflows
      : null;
  return (Array.isArray(raw) ? raw : []).flatMap((entry) => {
    const id =
      entry && typeof entry === "object"
        ? (entry as { definition_id?: unknown }).definition_id
        : entry;
    return typeof id === "string" && id.trim() !== "" ? [id] : [];
  });
}

/** `metadata.after_meeting.workflows` — what the server started, or why not. */
export function afterMeetingRuns(metadata: unknown): AfterMeetingRunRecord[] {
  const after =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>).after_meeting
      : null;
  const list =
    after && typeof after === "object"
      ? (after as Record<string, unknown>).workflows
      : null;
  return (Array.isArray(list) ? list : []).filter(
    (r): r is AfterMeetingRunRecord =>
      !!r &&
      typeof r === "object" &&
      typeof (r as { definition_id?: unknown }).definition_id === "string",
  );
}

function useWorkflowNames(ids: readonly string[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const key = [...ids].sort().join(",");
  useEffect(() => {
    const list = key === "" ? [] : key.split(",");
    if (list.length === 0) return undefined;
    let live = true;
    void supabase
      .schema("workflow")
      .from("definition")
      .select("id,name")
      .in("id", list)
      .then(({ data }) => {
        if (!live) return;
        const next: Record<string, string> = {};
        for (const row of data ?? [])
          next[row.id] = row.name || "Untitled workflow";
        setNames(next);
      });
    return () => {
      live = false;
    };
  }, [key]);
  return names;
}

export function AfterMeetingWorkflows({
  value,
  onChange,
  disabled = false,
  runs = [],
}: {
  value: readonly string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  runs?: readonly AfterMeetingRunRecord[];
}) {
  const names = useWorkflowNames([
    ...new Set([...value, ...runs.map((r) => r.definition_id)]),
  ]);
  return (
    <div className="space-y-1.5">
      {value.length > 0 ? (
        <ul className="space-y-1">
          {value.map((id) => {
            const ran = runs.find((r) => r.definition_id === id);
            return (
              <li key={id} className="flex items-center gap-2 text-sm">
                <Link
                  href={`/workflows/${id}`}
                  className="min-w-0 truncate text-primary hover:underline"
                >
                  {names[id] ?? "Workflow"}
                </Link>
                {ran?.run_id ? (
                  <Link
                    href={`/workflows/runs/${ran.run_id}`}
                    className="shrink-0 text-xs text-muted-foreground hover:underline"
                  >
                    Ran after the meeting
                  </Link>
                ) : ran?.error ? (
                  <span
                    className="min-w-0 truncate text-xs text-destructive"
                    title={ran.error}
                  >
                    Did not run: {ran.error}
                  </span>
                ) : null}
                {disabled ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-7 w-7 shrink-0"
                    aria-label={`Remove ${names[id] ?? "workflow"}`}
                    onClick={() => onChange(value.filter((v) => v !== id))}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {disabled || value.length >= 5 ? null : (
        <WorkflowListDropdown
          compact
          placeholder={
            value.length ? "Add another workflow" : "Choose a workflow"
          }
          onSelect={(id) => {
            if (!value.includes(id)) onChange([...value, id]);
          }}
        />
      )}
    </div>
  );
}

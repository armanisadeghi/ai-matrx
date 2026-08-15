// features/scheduling/components/detail/RunRow.tsx

"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { humanizeRelative } from "../../utils/triggerHumanize";
import { buildRunRowPayload, runSummary } from "../../lib/copy";
import { StatusPill } from "../shared/StatusPill";
import { OutputRefLink } from "../shared/OutputRefLink";
import type { AgendaTask, SchRunRow } from "../../types";

interface Props {
  run: SchRunRow;
  task?: AgendaTask | null;
}

export function RunRow({ run, task = null }: Props) {
  const [open, setOpen] = useState(false);

  const startedAt = run.started_at ?? run.claimed_at ?? run.created_at;
  const durationSec = computeDuration(run);

  return (
    <div className="group border border-border rounded-md bg-card text-sm">
      <div className="flex items-stretch">
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex-1 min-w-0 grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 hover:bg-accent/30 text-left",
          )}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <div className="min-w-0 flex items-center gap-3 flex-wrap">
            <StatusPill status={run.status} />
            <span className="text-xs text-muted-foreground">
              {humanizeRelative(startedAt)}
            </span>
            {durationSec !== null && (
              <span className="text-xs text-muted-foreground">
                · {formatDuration(durationSec)}
              </span>
            )}
            {run.surface && (
              <Badge variant="outline" className="text-[10px]">
                {run.surface}
              </Badge>
            )}
            {run.result_summary && (
              <span className="text-xs truncate max-w-[18rem]">
                {run.result_summary}
              </span>
            )}
          </div>
          <OutputRefLink outputRef={run.output_ref} />
        </button>
        {/* Sibling of the expand button, never nested inside it. */}
        <CopyButtons
          size="xs"
          label={`Run ${run.status}`}
          className="self-center pr-2 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100 transition-opacity"
          human={() => runSummary(run)}
          json={() => run}
          agent={() => buildRunRowPayload(run, task)}
        />
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 text-xs space-y-2 border-t border-border/60">
          {run.error_message && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-md p-2 text-red-800 dark:text-red-200">
              <div className="font-semibold text-[11px] uppercase tracking-wide mb-1">
                Error
              </div>
              <pre className="whitespace-pre-wrap font-mono text-[11px]">
                {run.error_message}
              </pre>
            </div>
          )}
          <Field label="Run id" value={run.id} mono />
          <Field label="Trigger" value={run.trigger_id ?? "manual"} mono />
          <Field
            label="Queued / Due"
            value={`${run.created_at} / ${run.due_at}`}
          />
          {run.claimed_at && <Field label="Claimed" value={run.claimed_at} />}
          {run.started_at && <Field label="Started" value={run.started_at} />}
          {run.finished_at && (
            <Field label="Finished" value={run.finished_at} />
          )}
          {run.result_metadata && (
            <details>
              <summary className="cursor-pointer text-muted-foreground">
                Result metadata
              </summary>
              <pre className="mt-1 bg-muted rounded-md p-2 overflow-x-auto font-mono text-[11px]">
                {JSON.stringify(run.result_metadata, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("break-all", mono && "font-mono text-[11px]")}>
        {value}
      </span>
    </div>
  );
}

function computeDuration(run: SchRunRow): number | null {
  if (!run.finished_at) return null;
  const start = run.started_at ?? run.claimed_at ?? run.created_at;
  return Math.max(
    0,
    Math.round(
      (new Date(run.finished_at).getTime() - new Date(start).getTime()) / 1000,
    ),
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

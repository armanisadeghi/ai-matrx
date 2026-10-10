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
import { guardrailBreachLabel } from "../../service/automationGuardrails";
// THE package duration formatter (`@ai-matrx/kit/format`, census H1
// 2026-09-07). `compact` is the elapsed-work voice: 250ms / 5.2s / 5m 30s /
// 1h 02m. THE UNIT LAW puts the unit in the name.
import { formatDurationSeconds } from "@ai-matrx/kit/format";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { AnswerValueView } from "@/components/official/structured-value/AnswerValueView";
import { valueCarriesKind } from "@/features/content-ir/surfaces/json-kind-signal";
import { answerPreviewText } from "@/components/official/structured-value/AnswerTextPreview";

interface Props {
  run: SchRunRow;
  task?: AgendaTask | null;
}

export function RunRow({ run, task = null }: Props) {
  const [open, setOpen] = useState(false);

  const startedAt = run.started_at ?? run.claimed_at ?? run.created_at;
  const durationSec = computeDuration(run);

  return (
    <div
      id={`run-${run.id}`}
      className="group border border-border rounded-md bg-card text-sm scroll-mt-24"
    >
      <div className="flex items-stretch">
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "grid min-h-11 min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 px-2 py-2 text-left hover:bg-accent/30 sm:gap-3 sm:px-3",
          )}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <div className="min-w-0 flex items-center gap-x-2 gap-y-1 flex-wrap sm:gap-x-3">
            <StatusPill status={run.status} />
            <span className="text-xs text-muted-foreground">
              {humanizeRelative(startedAt)}
            </span>
            {durationSec !== null && (
              <span className="text-xs text-muted-foreground">
                · {formatDuration(durationSec)}
              </span>
            )}
            {run.status === "stopped" && (
              <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive-ink">
                {guardrailBreachLabel(stoppedBy(run)?.kind)}
              </Badge>
            )}
            {run.surface && (
              <Badge variant="outline" className="text-[10px]">
                {run.surface}
              </Badge>
            )}
            {run.result_summary && (
              <span className="text-xs truncate max-w-[18rem]">
                {/* A kind is never printed as JSON (kind-never-raw S10). */}
                {answerPreviewText(run.result_summary, false)}
              </span>
            )}
          </div>
        </button>
        {/* Interactive entity doors and copy controls are siblings of the
            expand button; nested buttons are invalid HTML and hydrate badly. */}
        <div className="shrink-0 self-center">
          <OutputRefLink outputRef={run.output_ref} />
        </div>
        <CopyButtons
          size="xs"
          unified
          label={`Run ${run.status}`}
          className="shrink-0 self-center pr-1 sm:pr-2 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100 transition-opacity"
          human={() => runSummary(run)}
          json={() => run}
          agent={() => buildRunRowPayload(run, task)}
        />
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 text-xs space-y-2 border-t border-border/60">
          {run.status === "stopped" && <StoppedBy run={run} />}
          {run.error_message && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive-ink">
              <div className="font-semibold text-[11px] uppercase tracking-wide mb-1">
                Error
              </div>
              <pre className="whitespace-pre-wrap font-mono text-[11px]">
                {run.error_message}
              </pre>
              <ErrorAlchemyMenu />
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
              {valueCarriesKind(run.result_metadata) ? (
                <div className="mt-1">
                  <AnswerValueView value={run.result_metadata} density="inline" />
                </div>
              ) : (
                <pre className="mt-1 bg-muted rounded-md p-2 overflow-x-auto font-mono text-[11px]">
                  {JSON.stringify(run.result_metadata, null, 2)}
                </pre>
              )}
            </details>
          )}
        </div>
      )}
    </div>
  );
}

interface StoppedInfo {
  kind?: string;
  limit?: number;
  observed?: number;
  message?: string;
}

function stoppedBy(run: SchRunRow): StoppedInfo | null {
  const g = run.result_metadata?.guardrail;
  return g && typeof g === "object" ? (g as StoppedInfo) : null;
}

/** Which limit stopped this run, with the limit and what the run reached. */
function StoppedBy({ run }: { run: SchRunRow }) {
  const g = stoppedBy(run);
  return (
    <div
      role="status"
      className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive-ink"
    >
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide">
        {`Stopped: ${guardrailBreachLabel(g?.kind)}`}
      </div>
      {g?.limit != null && g.observed != null && (
        <div className="text-[11px]">{`Limit ${g.limit} · reached ${g.observed}`}</div>
      )}
      {g?.message && <div className="text-[11px]">{g.message}</div>}
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

const formatDuration = (seconds: number): string =>
  formatDurationSeconds(seconds, { style: "compact" });

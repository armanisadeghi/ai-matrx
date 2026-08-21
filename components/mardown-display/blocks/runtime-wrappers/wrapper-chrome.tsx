"use client";

/**
 * Shared PROVENANCE CHROME for the runtime wrapper kinds.
 *
 * Contract: `common-docs/systems/content-ir-system/RUNTIME_WRAPPER_WIRE.md` §5.
 *
 * 🚨 Everything in this module draws CONTEXT — which workflow, which node,
 * how long, and the engine's kind verdict. NOTHING here renders a payload.
 * The payload belongs to its own kind's component, reached through the
 * registry by the blocks that use this chrome. A wrapper component that
 * re-implements a payload renderer is the corruption the layer model exists
 * to undo.
 *
 * THE DOOR LAW: the ids this chrome names — the workflow, the run — open.
 */

import { AlertTriangle, CircleHelp, Clock, ShieldCheck } from "lucide-react";

import { MatrxUuidCell } from "@/components/official/matrx-data-table/MatrxUuidCell";
import { formatDurationMs } from "@/features/agents/components/observational-memory/components/format";
import { humanizeKind } from "@/features/content-ir/kinds/kind-markdown-utils";
import { kindVerdictOf } from "@/features/content-ir/core/runtime-wrapper";
import { cn } from "@/lib/utils";

/**
 * The engine's shape verdict, made visible and kept honest.
 *
 * `output_kind_ok: null` renders as UNCHECKED — never as a pass. The engine
 * either had no declared kind to check against or could not conclude, and
 * dressing that as a green tick is how a confidently-rendered document gets
 * shown for a shape nobody verified.
 */
export function KindVerdictChip({
  outputKind,
  outputKindOk,
  outputKindErrors,
}: {
  outputKind: string | null;
  outputKindOk: boolean | null;
  outputKindErrors?: string[] | null;
}) {
  const verdict = kindVerdictOf({
    output_kind: outputKind,
    output_kind_ok: outputKindOk,
  });
  const shape = outputKind ? humanizeKind(outputKind) : "No shape declared";

  if (verdict === "failed") {
    return (
      <span
        className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400"
        title={outputKindErrors?.join("\n") ?? undefined}
      >
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {shape} · did not match
      </span>
    );
  }
  if (verdict === "passed") {
    return (
      <span className="inline-flex items-center gap-1 text-primary">
        <ShieldCheck className="h-3 w-3 shrink-0" />
        {shape}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <CircleHelp className="h-3 w-3 shrink-0" />
      {shape} · unchecked
    </span>
  );
}

/** ms → the shortest honest reading. `0` IS a duration, so it is shown. */
export function DurationChip({ ms }: { ms: number | null }) {
  if (ms === null) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <Clock className="h-3 w-3 shrink-0" />
      {formatDurationMs(ms)}
    </span>
  );
}

/** The workflow / run doors, resolved from the registries. */
export function ProvenanceIds({
  workflowId,
  runId,
}: {
  workflowId: string | null;
  runId?: string | null;
}) {
  if (!workflowId && !runId) return null;
  return (
    <span className="ml-auto inline-flex items-center gap-2">
      {workflowId ? (
        <MatrxUuidCell value={workflowId} label="Workflow" token="workflow" />
      ) : null}
      {runId ? (
        <MatrxUuidCell
          value={runId}
          label="Run"
          href={`/workflows/runs/${runId}`}
        />
      ) : null}
    </span>
  );
}

/** The one chrome row every wrapper draws. Quiet by construction. */
export function ProvenanceRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

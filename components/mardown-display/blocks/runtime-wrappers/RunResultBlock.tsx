"use client";

/**
 * RunResultBlock — THE renderer for the `run_result` runtime wrapper kind.
 *
 * Contract: `common-docs/systems/content-ir-system/RUNTIME_WRAPPER_WIRE.md`.
 *
 * One finished run: its identity, status and timing, then one
 * `node_outcome` per TERMINAL node — each delegated to
 * {@link NodeOutcomeBlock}, which delegates the payload inside it to the data
 * kind's own component. Recursion all the way down; no payload is rendered
 * here, and no `final_text` is read here.
 *
 * The run's own `output` is rendered ONLY when the run declared no terminal
 * outcomes — otherwise it is the same content the outcomes already carry, and
 * showing both is the duplication the wrapper exists to prevent.
 */

import { readRunResultValue } from "@/features/content-ir/core/runtime-wrapper";
import type { RunResultWrapper } from "@/features/content-ir/core/runtime-wrapper";
import { cn } from "@/lib/utils";

import NodeOutcomeBlock, { DelegatedOutput } from "./NodeOutcomeBlock";
import {
  DurationChip,
  KindVerdictChip,
  ProvenanceIds,
  ProvenanceRow,
} from "./wrapper-chrome";

export interface RunResultBlockProps {
  serverData?: unknown;
  className?: string;
  /** Hide the ids row where the host already names the run (the run page). */
  hideIds?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readWrapper(serverData: unknown): RunResultWrapper | null {
  if (!isRecord(serverData)) return null;
  return readRunResultValue(serverData.wrapper);
}

export default function RunResultBlock({
  serverData,
  className,
  hideIds = false,
}: RunResultBlockProps) {
  const wrapper = readWrapper(serverData);
  if (!wrapper) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <ProvenanceRow>
        <span className="font-medium text-foreground">
          {wrapper.status === "completed" ? "Run finished" : `Run ${wrapper.status}`}
        </span>
        <DurationChip ms={wrapper.duration_ms} />
        {wrapper.outputs.length === 0 && wrapper.output_kind ? (
          <KindVerdictChip
            outputKind={wrapper.output_kind}
            outputKindOk={null}
          />
        ) : null}
        {hideIds ? null : (
          <ProvenanceIds
            workflowId={wrapper.workflow_id}
            runId={wrapper.run_id}
          />
        )}
      </ProvenanceRow>

      {wrapper.outputs.length > 0 ? (
        wrapper.outputs.map((outcome) => (
          <div
            key={`${outcome.node_id}:${outcome.attempt}`}
            className="rounded-lg border border-border/70 p-2.5"
          >
            <NodeOutcomeBlock serverData={{ wrapper: outcome }} hideIds />
          </div>
        ))
      ) : (
        <DelegatedOutput
          output={wrapper.output}
          declaredKind={wrapper.output_kind}
        />
      )}
    </div>
  );
}

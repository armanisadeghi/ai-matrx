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
import NodeOutcomeBlock, { DelegatedOutput } from "./NodeOutcomeBlock";

export interface RunResultBlockProps {
  serverData?: unknown;
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
}: RunResultBlockProps) {
  const wrapper = readWrapper(serverData);
  if (!wrapper) return null;

  return (
    <div className="space-y-2">
      {wrapper.outputs.length > 0 ? (
        wrapper.outputs.map((outcome) => (
          <NodeOutcomeBlock
            key={`${outcome.node_id}:${outcome.attempt}`}
            serverData={{ wrapper: outcome }}
          />
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

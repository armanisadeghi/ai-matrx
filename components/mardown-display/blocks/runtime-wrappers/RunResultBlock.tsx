"use client";

/**
 * The Matrix binding of the `run_result` runtime-wrapper renderer.
 *
 * Contract: `common-docs/systems/content-ir-system/RUNTIME_WRAPPER_WIRE.md`.
 * One `node_outcome` per TERMINAL node, each delegated to the data kind's own
 * component, recursion all the way down. No payload is rendered here, and no
 * `final_text` is read here. The run's own `output` renders ONLY when the run
 * declared no terminal outcomes — otherwise it is the same content the outcomes
 * already carry, and showing both is the duplication the wrapper prevents.
 *
 * Renders each outcome through OUR `NodeOutcomeBlock`, not the package's
 * `RunResultView` (lane HELD-WORDS-3, 2026-09-26): `RunResultView` maps its
 * outcomes internally and hands every one the SAME `fallback` callback, which
 * only ever receives the bare `output` — never the wrapper's `run_id`/
 * `node_id` — so a held step's decision (refused/approved) had no way to
 * reach the fallback body per node. `NodeOutcomeBlock` already reads its own
 * wrapper and looks up the held/refused sticky facts, so mapping through it
 * here is reuse, not a second reader: the shape (`space-y-2`, one row per
 * outcome, `${node_id}:${attempt}` key, the single-output shortcut) is
 * identical to what `RunResultView` did.
 */

import { readRunResultValue } from "@ai-matrx/content-ir";
import { ContentIrHostBoundary } from "@/features/content-ir/host/ContentIrHostBoundary";
import NodeOutcomeBlock, { DelegatedOutput } from "../runtime-wrappers/NodeOutcomeBlock";

export interface RunResultBlockProps {
  serverData?: unknown;
}

export default function RunResultBlock({ serverData }: RunResultBlockProps) {
  const wrapper =
    typeof serverData === "object" && serverData !== null
      ? readRunResultValue((serverData as { wrapper?: unknown }).wrapper)
      : null;
  if (!wrapper) return null;

  if (wrapper.outputs.length === 0) {
    return (
      <ContentIrHostBoundary>
        <DelegatedOutput output={wrapper.output} declaredKind={wrapper.output_kind} />
      </ContentIrHostBoundary>
    );
  }

  return (
    <div className="space-y-2">
      {wrapper.outputs.map((outcome) => (
        <NodeOutcomeBlock
          key={`${outcome.node_id}:${outcome.attempt}`}
          serverData={{ wrapper: outcome }}
        />
      ))}
    </div>
  );
}

"use client";

/**
 * The Matrix binding of the `run_result` runtime-wrapper renderer.
 *
 * Contract: `common-docs/systems/content-ir-system/RUNTIME_WRAPPER_WIRE.md`.
 * The render half is `@ai-matrx/content-ir-react` (`RunResultView`): one
 * `node_outcome` per TERMINAL node, each delegated to the data kind's own
 * component, recursion all the way down. No payload is rendered here, and no
 * `final_text` is read here. The run's own `output` renders ONLY when the run
 * declared no terminal outcomes — otherwise it is the same content the outcomes
 * already carry, and showing both is the duplication the wrapper prevents.
 */

import { RunResultView } from "@ai-matrx/content-ir-react";
import { ContentIrHostBoundary } from "@/features/content-ir/host/ContentIrHostBoundary";
import { SettledOutputBody } from "@/features/workflow-runtime/components/SettledOutputBody";

/** The same no-component body the readout and NodeOutcomeBlock use. */
function settledOutputFallback(output: unknown) {
  if (typeof output !== "object" || output === null) return null;
  return <SettledOutputBody output={output as Record<string, unknown>} />;
}

export interface RunResultBlockProps {
  serverData?: unknown;
}

export default function RunResultBlock({ serverData }: RunResultBlockProps) {
  return (
    <ContentIrHostBoundary>
      <RunResultView serverData={serverData} fallback={settledOutputFallback} />
    </ContentIrHostBoundary>
  );
}

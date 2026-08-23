"use client";

/**
 * The Matrix binding of the `node_outcome` runtime-wrapper renderer.
 *
 * Contract: `common-docs/systems/content-ir-system/RUNTIME_WRAPPER_WIRE.md`.
 * The reader is `@ai-matrx/content-ir` (`wire/runtime-wrapper`); the render
 * half is `@ai-matrx/content-ir-react` (`NodeOutcomeView` / `DelegatedOutput`).
 *
 * The packet, verbatim: "the front end would know which workflow it came from,
 * which node it came from, and then inside of it, it would see that it's a
 * Brave search results, and inside of that, ten websites."
 *
 * 🚨 **DELEGATE, NEVER REIMPLEMENT.** These are TRANSPARENT ROUTERS: the
 * payload goes straight back to the kind registry, so the nested data kind's
 * own component draws it, recursing all the way down. The moment this file
 * renders a payload itself, the layer model is dead.
 *
 * What this app adds is exactly one thing: the no-kind / unroutable fallback is
 * `SettledOutputBody` — the SAME body the workflow readout uses, never a second
 * reader.
 */

import {
  DelegatedOutput as SharedDelegatedOutput,
  NodeOutcomeView,
} from "@ai-matrx/content-ir-react";
import { ContentIrHostBoundary } from "@/features/content-ir/host/ContentIrHostBoundary";
import { SettledOutputBody } from "@/features/workflow-runtime/components/SettledOutputBody";

export interface NodeOutcomeBlockProps {
  serverData?: unknown;
}

/** The shared fallback: what the readout shows for a payload with no component. */
function settledOutputFallback(output: unknown) {
  if (typeof output !== "object" || output === null) return null;
  return <SettledOutputBody output={output as Record<string, unknown>} />;
}

/**
 * The delegation seam. In-band `__kind` wins over the node's DECLARATION, the
 * same law the run reducer follows.
 */
export function DelegatedOutput({
  output,
  declaredKind,
}: {
  output: unknown;
  /** The wrapper's `output_kind` — the node's DECLARATION, the fallback. */
  declaredKind: string | null;
}) {
  return (
    <ContentIrHostBoundary>
      <SharedDelegatedOutput
        output={output}
        declaredKind={declaredKind}
        fallback={settledOutputFallback}
      />
    </ContentIrHostBoundary>
  );
}

export default function NodeOutcomeBlock({
  serverData,
}: NodeOutcomeBlockProps) {
  return (
    <ContentIrHostBoundary>
      <NodeOutcomeView serverData={serverData} fallback={settledOutputFallback} />
    </ContentIrHostBoundary>
  );
}

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
 *
 * A step held for approval, decided (lane HELD-WORDS-3, 2026-09-26): the
 * package's `fallback` callback receives only the bare `output`, never the
 * wrapper it came off — so THIS binding reads the wrapper itself (it has
 * `run_id`/`node_id`) and looks up the same sticky `heldNodes`/`refusedNodes`
 * facts `readout-parts.tsx` uses, so a refused or approved held step reads
 * honest here too instead of falling through to the generic "handed its
 * result to the next one" sentence.
 */

import {
  DelegatedOutput as SharedDelegatedOutput,
  NodeOutcomeView,
} from "@ai-matrx/content-ir-react";
import { readNodeOutcomeValue } from "@ai-matrx/content-ir";
import { ContentIrHostBoundary } from "@/features/content-ir/host/ContentIrHostBoundary";
import { SettledOutputBody } from "@/features/workflow-runtime/components/SettledOutputBody";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectRunStickyFacts } from "@/features/workflow-runtime/redux/workflow-runs.selectors";

export interface NodeOutcomeBlockProps {
  serverData?: unknown;
}

/** The shared fallback: what the readout shows for a payload with no component.
 * Exported for `held-step-words.test.tsx`, which proves this exact function —
 * plus {@link useHeldOutcome} below — is what NodeOutcomeBlock/RunResultBlock
 * thread `heldOutcome` through, without pulling in the full content-ir render
 * stack (ContentIrHostBoundary, the component resolver, Supabase). */
export function settledOutputFallback(
  output: unknown,
  heldOutcome: "refused" | "approved" | null = null,
) {
  if (typeof output !== "object" || output === null) return null;
  return (
    <SettledOutputBody output={output as Record<string, unknown>} heldOutcome={heldOutcome} />
  );
}

/** Same lookup `readout-parts.tsx` does — read off the run's sticky facts by
 * this specific node's id, refused winning when both are somehow true. */
export function useHeldOutcome(
  runId: string | null,
  nodeId: string | null,
): "refused" | "approved" | null {
  const sticky = useAppSelector(selectRunStickyFacts(runId ?? ""));
  if (!runId || !nodeId) return null;
  if (sticky.refusedNodes?.[nodeId]) return "refused";
  if (sticky.heldNodes?.[nodeId]) return "approved";
  return null;
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
  const wrapper =
    typeof serverData === "object" && serverData !== null
      ? readNodeOutcomeValue((serverData as { wrapper?: unknown }).wrapper)
      : null;
  const heldOutcome = useHeldOutcome(wrapper?.run_id ?? null, wrapper?.node_id ?? null);
  return (
    <ContentIrHostBoundary>
      <NodeOutcomeView
        serverData={serverData}
        fallback={(output) => settledOutputFallback(output, heldOutcome)}
      />
    </ContentIrHostBoundary>
  );
}

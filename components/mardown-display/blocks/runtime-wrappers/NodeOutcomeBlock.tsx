"use client";

/**
 * NodeOutcomeBlock — THE renderer for the `node_outcome` runtime wrapper kind.
 *
 * Contract: `common-docs/systems/content-ir-system/RUNTIME_WRAPPER_WIRE.md`.
 *
 * The packet, verbatim: "the front end would know which workflow it came
 * from, which node it came from, and then inside of it, it would see that
 * it's a Brave search results, and inside of that, ten websites."
 *
 * 🚨 **DELEGATE, NEVER REIMPLEMENT.** This component draws PROVENANCE ONLY —
 * the node, the step, the timing, and the engine's kind verdict — and then
 * hands `output` straight back to the kind registry (`KindInstanceRender`), so
 * the nested data kind's own component draws it, recursing all the way down.
 * The moment this file renders a payload itself, the layer model is dead.
 *
 * The nested payload is ALREADY rehydrated: the elision (`output_ref`) is
 * resolved ONCE at the ingest gate (`features/content-ir/core/runtime-wrapper.ts`),
 * before anything reads the wrapper. Nothing here goes looking for a frame.
 *
 * Bare by construction: the host (a readout step box, a deliverable card, a
 * chat message) already draws chrome; this block adds no card of its own.
 */

import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { readObjectKind } from "@/features/content-ir/core/kind-schema.types";
import { readNodeOutcomeValue } from "@/features/content-ir/core/runtime-wrapper";
import type { NodeOutcomeWrapper } from "@/features/content-ir/core/runtime-wrapper";
import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";
import { SettledOutputBody } from "@/features/workflow-runtime/components/SettledOutputBody";
import { cn } from "@/lib/utils";

import {
  DurationChip,
  KindVerdictChip,
  ProvenanceIds,
  ProvenanceRow,
} from "./wrapper-chrome";

export interface NodeOutcomeBlockProps {
  serverData?: unknown;
  className?: string;
  /** Hide the ids row where the host already names the run (the run page). */
  hideIds?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The bridge builds `{ wrapper }`; anything else is not ours to render. */
function readWrapper(serverData: unknown): NodeOutcomeWrapper | null {
  if (!isRecord(serverData)) return null;
  return readNodeOutcomeValue(serverData.wrapper);
}

/**
 * The delegation seam — the ONLY thing this component does with a payload.
 *
 * In-band `__kind` wins over the node's DECLARATION, the same law the run
 * reducer follows: the discriminator inside the value describes what we are
 * actually holding, so it is what routes. With no kind at all there is
 * nothing to route to, and the shared settled-output body (the same one the
 * readout uses — never a second reader) shows what the step produced.
 */
export function DelegatedOutput({
  output,
  declaredKind,
}: {
  output: unknown;
  /** The wrapper's `output_kind` — the node's DECLARATION, the fallback. */
  declaredKind: string | null;
}) {
  if (output === null || output === undefined) {
    return (
      <p className="text-xs text-muted-foreground">
        This step ran, and handed its result to the next one.
      </p>
    );
  }
  if (!isRecord(output)) return <StructuredValueView value={output} />;

  const kind = readObjectKind(output) ?? declaredKind;
  if (!kind) return <SettledOutputBody output={output} />;

  return (
    <KindInstanceRender
      kind={kind}
      value={output}
      showRoutingNote={false}
      variant="bare"
      unroutableFallback={<SettledOutputBody output={output} />}
    />
  );
}

export default function NodeOutcomeBlock({
  serverData,
  className,
  hideIds = false,
}: NodeOutcomeBlockProps) {
  const wrapper = readWrapper(serverData);
  if (!wrapper) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <ProvenanceRow>
        <span className="truncate font-medium text-foreground">
          {wrapper.node_id}
        </span>
        {wrapper.step !== null ? <span>Step {wrapper.step + 1}</span> : null}
        {wrapper.attempt > 1 ? <span>Attempt {wrapper.attempt}</span> : null}
        <DurationChip ms={wrapper.duration_ms} />
        <KindVerdictChip
          outputKind={wrapper.output_kind}
          outputKindOk={wrapper.output_kind_ok}
          outputKindErrors={wrapper.output_kind_errors}
        />
        {/* Which workflow it came from — Arman's packet, first clause. The
            RUN door belongs to `run_result`, not to every step of it: two uuid
            chips on every row of a 23-step readout is clutter, not provenance. */}
        {hideIds ? null : <ProvenanceIds workflowId={wrapper.workflow_id} />}
      </ProvenanceRow>
      <DelegatedOutput
        output={wrapper.output}
        declaredKind={wrapper.output_kind}
      />
    </div>
  );
}

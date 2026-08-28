"use client";

/**
 * THE ROUTER — one emission, one renderer, decided by `routeEmission`.
 *
 * SPEC-workflow-ui-contract §3, rules 1 and 2. A kind-carrying emission goes
 * to `KindInstanceRender` — the ONE kind component, the same one chat uses —
 * and its `component_ref` is ignored. A kindless emission (or one whose kind
 * the registry refused) goes to today's `DbEmitRenderer` path.
 *
 * 🚨 NEVER import `emitRendererCache`, or anything under `features/workflow-emit/`
 * beyond `DbEmitRenderer` and `types`, FROM HERE. `emitRendererCache` →
 * `compileEmitRenderer` → the agent-apps compiler → a STATIC `@babel/standalone`.
 * `DbEmitRenderer`'s `next/dynamic` boundary is the only thing keeping Babel out
 * of the run-surface bundle, and a static import here walks straight around it —
 * the D115 shape, +14 GB peak build RSS, 12 straight OOM'd builds. The full note
 * is in `components/run/RunEmissions.tsx:29-39`; this file inherits it, because
 * this file is what the shipped surface will eventually route through.
 */

import React from "react";

import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { DbEmitRenderer } from "@/features/workflow-emit/DbEmitRenderer";
import type { EmitMode } from "@/features/workflow-emit/types";

import { routeEmission, type RoutableEmission } from "./emission-routing";

/** Everything the two renderers need, over and above the routing fields. */
export interface RenderableEmission extends RoutableEmission {
  mode: string;
  payload: unknown;
  componentRef: string | null;
  title: string | null;
  metadata: Record<string, unknown> | null;
  persisted: boolean;
}

/** The wire's mode string, narrowed; unknown modes render as "full". */
export function asEmitMode(mode: string): EmitMode {
  switch (mode) {
    case "confirmation":
    case "summary":
    case "full":
    case "restructured":
      return mode;
    default:
      return "full";
  }
}

export interface EmissionRenderProps {
  runId: string;
  emission: RenderableEmission;
  /** Fallback identity when the durable `seq` is absent. */
  index?: number;
  /**
   * Chrome, per THE WRAPPER LAW. "bare" when the host already draws the card,
   * the icon and the title around this body — which every caller here does.
   */
  variant?: "card" | "bare";
}

/**
 * Render ONE emission through whichever path the contract picks. This is the
 * single decision point: no caller inspects `kind` itself, and no caller draws
 * a second viewer for a shape a kind already owns.
 */
export function EmissionRender({
  runId,
  emission,
  index = 0,
  variant = "bare",
}: EmissionRenderProps) {
  const route = routeEmission(emission);

  if (route.via === "kind") {
    // `component_ref` is IGNORED here, deliberately (SPEC §3.1): a registered
    // kind's component outranks an author's per-node override.
    return (
      <KindInstanceRender
        kind={route.kind}
        value={emission.payload}
        showRoutingNote={false}
        variant={variant}
      />
    );
  }

  return (
    <DbEmitRenderer
      componentRef={emission.componentRef}
      mode={asEmitMode(emission.mode)}
      payload={emission.payload}
      title={emission.title}
      nodeId={emission.nodeId}
      runId={runId}
      seq={emission.seq ?? index}
      isPersisted={emission.persisted}
      presentation={emission.presentation ?? undefined}
      kind={emission.kind}
      kindOk={emission.kindOk}
      metadata={emission.metadata}
    />
  );
}

/**
 * A stable React key for an emission. The durable `seq` IS the identity — it
 * survives refolds and refreshes; a ring index is not, because the emissions
 * cap drops from the head and would shift every key below it.
 */
export function emissionKey(
  emission: Pick<RoutableEmission, "nodeId" | "seq"> & { ts?: string },
  index = 0,
): string {
  const timestamp = emission.ts === undefined ? "" : emission.ts;
  return emission.seq !== null
    ? `seq:${emission.seq}`
    : `${emission.nodeId}:${timestamp}:${index}`;
}

export default EmissionRender;

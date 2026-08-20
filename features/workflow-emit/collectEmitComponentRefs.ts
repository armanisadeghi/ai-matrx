/**
 * collectEmitComponentRefs — read every custom emit renderer a workflow
 * DEFINITION will ask for, before the run asks for it.
 *
 * A `output.to_frontend` node carries its `component_ref` in the definition
 * (`node.data.config.component_ref`), so the renderer a step will need is
 * knowable from second zero — the same insight `node-presentation.ts` uses to
 * name every deliverable before the run starts. Warming the cache here means
 * the compiled component is ready the moment the node emits, instead of the
 * generic body painting first and upgrading a beat later.
 *
 * Pure module — no React, no Redux, no fetch. The definition is typed loosely
 * on purpose: this must not import `workflow-runtime` (which imports this
 * feature's renderer), and `data.config` is an open record on the wire.
 *
 * A ref is only collected when the node's `surface` is the workflow surface —
 * a row authored for another surface would never resolve here, and warming it
 * would only negative-cache a name this feature does not own.
 */
import { WORKFLOW_EMIT_SURFACE } from "./surface";

interface DefinitionLike {
  nodes?: Array<{
    data?: { config?: unknown; [k: string]: unknown } | null;
    [k: string]: unknown;
  }> | null;
}

export function collectEmitComponentRefs(
  definition: DefinitionLike | null | undefined,
): string[] {
  const nodes = definition?.nodes;
  if (!Array.isArray(nodes)) return [];

  const refs = new Set<string>();
  for (const node of nodes) {
    const config = node?.data?.config;
    if (!config || typeof config !== "object" || Array.isArray(config)) continue;
    const record = config as Record<string, unknown>;

    const ref = record.component_ref;
    if (typeof ref !== "string" || ref.trim().length === 0) continue;

    // `surface` defaults to the workflow surface server-side, so an absent
    // value means "ours"; an explicit foreign surface is skipped.
    const surface = record.surface;
    if (typeof surface === "string" && surface !== WORKFLOW_EMIT_SURFACE) {
      continue;
    }

    refs.add(ref);
  }
  return [...refs];
}

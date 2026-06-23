/**
 * Workflow Emit Renderer — type contract.
 *
 * A workflow run streams a `node_emitted` event whenever a node emits content
 * to the frontend. The wire shape (`NodeEmittedEvent`) is frozen — it mirrors
 * the Python backend exactly. The renderer-facing shape (`EmitRendererProps`)
 * is what a custom, agent-authored component receives; it is DELIBERATELY
 * payload-shaped (not tool-call-shaped), so it is NOT `ToolRendererProps`.
 *
 * Sibling of `features/tool-call-visualization/types.ts` — same philosophy
 * (one canonical props contract, no shape fabrication), different surface.
 */

/** Emission mode chosen by the node — controls how the payload is presented. */
export type EmitMode = "confirmation" | "summary" | "full" | "restructured";

/**
 * The `data` field of a `node_emitted` stream event. FROZEN — matches the
 * backend contract byte-for-byte. Consumers of the stream destructure this.
 */
export interface NodeEmittedEvent {
  event: "node_emitted";
  run_id: string;
  step: number;
  node_id: string;
  attempt: number;
  mode: EmitMode;
  /** Already-transformed content (a non-dict value is wrapped as `{ value }`). */
  payload: Record<string, unknown>;
  /** A `tool_ui.tool_name` to render with, or null = the generic renderer. */
  component_ref: string | null;
  /** Origin surface, e.g. "matrx-user/workflow". */
  surface: string;
  title: string | null;
}

/**
 * Props passed to a custom (agent-authored) emit renderer component. Compiled
 * from a `tool_ui` row and rendered inside the error boundary. The `payload`
 * is `unknown` — the component is responsible for narrowing it.
 */
export interface EmitRendererProps {
  mode: EmitMode;
  payload: unknown;
  title?: string | null;
  nodeId: string;
  runId: string;
  seq: number;
  /** True when re-rendering a finished run from history (post-stream). */
  isPersisted?: boolean;
}

/**
 * workflow-emit — renders a workflow node's "emit to frontend" payload
 * (`node_emitted` event) as a safe, agent-authored custom React component, or a
 * truthful generic fallback.
 *
 * Public surface for consumers:
 *   - DbEmitRenderer  — the ONE entry point. Map a `node_emitted` event's
 *                       `data` onto its props and render it. Lazily loads the
 *                       Babel sandbox; falls back to the generic body.
 *   - GenericEmitRenderer — the fallback body (also usable directly).
 *   - Types — EmitRendererProps (component contract) + NodeEmittedEvent (wire).
 *   - Cache controls — prefetch/invalidate a custom renderer by component_ref.
 *
 * The compile/sandbox path is the PROVEN tool-renderer one
 * (`compileSlotComponent` + the fixed allow-list), reused verbatim — no new
 * compile path exists here.
 */
export { DbEmitRenderer, default } from "./DbEmitRenderer";
export type { DbEmitRendererProps } from "./DbEmitRenderer";
export { GenericEmitRenderer } from "./GenericEmitRenderer";
export {
  prefetchEmitRenderer,
  invalidateEmitRenderer,
} from "./emitRendererCache";
export { WORKFLOW_EMIT_SURFACE } from "./surface";
export type {
  EmitRendererProps,
  EmitMode,
  NodeEmittedEvent,
} from "./types";

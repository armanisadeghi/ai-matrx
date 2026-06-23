/**
 * WORKFLOW_EMIT_SURFACE — the single canonical `tool_ui.surface_name` that the
 * workflow-emit renderer reads. A `node_emitted` event carries a
 * `component_ref` (a `tool_ui.tool_name`); the row fetch pins it to THIS
 * surface so a renderer authored for the workflow surface is the only one that
 * resolves here. Mirrors `tool-call-visualization/db-renderer/surface.ts`,
 * which pins the web tool surface — same idea, workflow surface.
 *
 * Pure constant — no React/client imports — safe to import from client
 * components and server routes alike.
 */
export const WORKFLOW_EMIT_SURFACE = "matrx-user/workflow";

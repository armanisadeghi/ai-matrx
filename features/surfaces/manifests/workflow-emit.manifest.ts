/**
 * Surface manifest — Workflow emissions (`matrx-user/workflow`).
 *
 * Declares the live `ui.ui_surface` row that agent-authored workflow emit
 * renderers are registered under (`tool_ui.surface_name`, pinned by
 * `features/workflow-emit/surface.ts` WORKFLOW_EMIT_SURFACE). A workflow run
 * streams `node_emitted` events; the Workflow Studio canvas and shared Applets
 * render each emission with the component registered for this surface.
 *
 * Values mirror what every emit renderer receives (`EmitRendererProps`,
 * `features/workflow-emit/types.ts`), so a binding or an Alchemy capture can
 * name them. No provider emits them as a page scope yet (readiness: stub).
 * Matrx Alchemy ALC-14 S2: this row had no declaring owner (CONTRACT §2.1a).
 */

import type { SurfaceManifest, SurfaceValue } from "@/features/surfaces/types";

const values: SurfaceValue[] = [
  {
    name: "run_id",
    label: "Run",
    description: "The workflow run that produced the emission.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 100,
  },
  {
    name: "node_id",
    label: "Node",
    description: "The workflow node that emitted the content.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    sortOrder: 110,
  },
  {
    name: "seq",
    label: "Emission number",
    description: "Order of this emission within the run (the stream sequence number).",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 120,
  },
  {
    name: "mode",
    label: "Emission mode",
    description: "How the node asked its payload to be presented (the node_emitted mode).",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 130,
  },
  {
    name: "title",
    label: "Title",
    description: "The emission's title, when the node gave one; absent otherwise.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 140,
  },
  {
    name: "kind",
    label: "Content kind",
    description: "Registered content-IR kind of the payload; absent when the emission is unkinded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 150,
  },
  {
    name: "emitted_payload",
    label: "Emitted content",
    description: "The payload the node emitted, exactly as streamed. Shape depends on the node; narrow it by kind.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 160,
  },
];

export const workflowEmitManifest: SurfaceManifest = {
  surfaceName: "matrx-user/workflow",
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "Workflow emit-to-frontend render surface. Agent-authored custom React components (in tool_ui) that render a workflow node's emitted output — shown in the Workflow Studio canvas and in shared Applets.",
  label: "Workflow emissions",
  readiness: "stub",
  readinessNote:
    "Declared so the live row has an owner (ALC-14). No SurfaceRuntimeProvider emits these values yet; the emit renderers receive them as props.",
  skipBaselineValues: true,
  values,
};

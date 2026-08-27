/**
 * Workflow Emit Renderer — type contract.
 *
 * A workflow run streams a `node_emitted` event whenever a node emits content
 * to the frontend. The renderer-facing shape (`EmitRendererProps`) is what a
 * custom, agent-authored component receives; it is DELIBERATELY payload-shaped
 * (not tool-call-shaped), so it is NOT `ToolRendererProps`.
 *
 * 🚨 **The wire shape is NOT mirrored here — it is RE-EXPORTED.** This file used
 * to hand-copy `NodeEmittedEvent` under a "FROZEN — matches the backend
 * contract byte-for-byte" comment, and it silently drifted four fields behind
 * the server (`presentation`, `kind`, `kind_ok`, `metadata` — the last of which
 * carries the verified Content-IR envelope under `__ir`). A hand mirror cannot
 * be frozen against a contract it does not import, so it no longer is one:
 * `NodeEmittedEvent` and `EmitMode` both derive from
 * `types/python-generated/workflow-events.ts`, the artifact `pnpm sync-types`
 * regenerates from the Python source of truth. Adding a field there now reaches
 * this feature for free, and removing one becomes a type error instead of a
 * silent drop.
 *
 * The import is `import type` — TypeScript erases it entirely, so it adds no
 * module edge to any bundle and cannot interact with the D115 boundary that
 * `DbEmitRenderer.tsx` defends (see FEATURE.md invariant 1). The generated file
 * imports nothing itself.
 *
 * Sibling of `features/tool-call-visualization/types.ts` — same philosophy
 * (one canonical props contract, no shape fabrication), different surface.
 */

import type { NodeEmittedEvent } from "@/types/python-generated/workflow-events";

/**
 * The `data` field of a `node_emitted` stream event — the GENERATED type, not a
 * copy of it. `features/workflow-runtime/types.ts` re-exports the same symbol.
 */
export type { NodeEmittedEvent };

/** Emission mode chosen by the node — controls how the payload is presented. */
export type EmitMode = NodeEmittedEvent["mode"];

/**
 * How the emission wants to be shown: `panel` (inline, alongside the run) or
 * `showcase` (the emission is the point — give it the room).
 */
export type EmitPresentation = NodeEmittedEvent["presentation"];

/**
 * Props passed to a custom (agent-authored) emit renderer component. Compiled
 * from a `tool_ui` row and rendered inside the error boundary. The `payload`
 * is `unknown` — the component is responsible for narrowing it.
 *
 * The four wire fields below are optional in the CONTRACT (a compiled renderer
 * written before they existed still type-checks) but the platform consumer
 * always populates them — see `workflow-runtime/components/run/RunEmissions.tsx`.
 * They are typed off `NodeEmittedEvent` so they can never drift from the wire.
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
  /** Panel vs showcase, as the emitting node asked for it. */
  presentation?: EmitPresentation;
  /** Registered content-IR kind of the payload, or null when unkinded. */
  kind?: NodeEmittedEvent["kind"];
  /** Whether the payload validated against that kind's schema (null = not checked). */
  kindOk?: NodeEmittedEvent["kind_ok"];
  /** Emitter metadata — carries the verified Content-IR envelope under `__ir`. */
  metadata?: NodeEmittedEvent["metadata"];
}

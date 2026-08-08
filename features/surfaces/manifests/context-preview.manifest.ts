/**
 * Surface manifest — Context Preview panel (`matrx-user/context-preview`).
 *
 * OVERLAY SURFACE (`contextPreviewPanel`): the non-blocking right sidebar
 * showing "what the agent receives, for real" — the SERVER-RESOLVED answer
 * from `POST /ai/context/preview` (injected context block, tiered variables
 * with provenance, agent variable/slot binding fill) plus the client-side
 * entries attached for this conversation's turns. Opened from the "Context"
 * segment of the composer's ContextLensBar; inherits `matrx-user/chat`
 * because it always previews a chat conversation's context (conversation_id /
 * conversation_agent_id arrive via inheritance).
 *
 * An agent bound here is looking at a diagnostic mirror: every value is a
 * READ-ONLY reflection of context resolution — helping the user understand,
 * debug, or summarize what their agent will receive. Nothing on this surface
 * mutates the context itself.
 *
 * Emitter: `ContextPreviewPanel.tsx` mounts `<SurfaceRuntimeProvider>` inside
 * the overlay (nested providers out-depth the page's — while the panel is
 * open its scope wins) and builds the scope via `createContextPreviewScope`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const CONTEXT_PREVIEW_SURFACE_NAME = "matrx-user/context-preview";

const groups: SurfaceValueGroup[] = [
  {
    key: "preview_state",
    label: "Preview state",
    sortOrder: 100,
    description:
      "Which view the panel is showing and whether the server resolution succeeded.",
  },
  {
    key: "resolved_context",
    label: "Resolved server context",
    sortOrder: 200,
    description:
      "The server's answer from POST /ai/context/preview — the exact injected block and scope labels the agent-run path would produce.",
  },
  {
    key: "variable_tiers",
    label: "Variable tiers",
    sortOrder: 300,
    description:
      "Resolved context variables by delivery tier: injected directly, tool-accessible, searchable.",
  },
  {
    key: "binding_fill",
    label: "Agent binding fill",
    sortOrder: 400,
    description:
      "How the previewed agent's declared variables and context slots would be filled from the active scopes.",
  },
  {
    key: "attached_context",
    label: "Attached client context",
    sortOrder: 500,
    description:
      "The client-side half: entries, client tools, memory, and active context layers published for this conversation's turns.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Preview state ─────────────────────────────────────────────────────
  {
    name: "active_view",
    label: "Active view",
    description:
      'Which tab of the panel is showing: "resolved" (server truth) or "attached" (client-side entries). Always present while the panel is open.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 100,
    group: "preview_state",
  },
  {
    name: "preview_status",
    label: "Preview status",
    description:
      'Fetch state of the server resolution: "loading", "ready", or "error". Always present while the panel is open.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 110,
    group: "preview_state",
  },
  {
    name: "preview_error",
    label: "Preview error",
    description:
      "Error message when the server resolution failed. Empty when the preview loaded (or is still loading).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 120,
    group: "preview_state",
  },

  // ── Resolved server context ───────────────────────────────────────────
  {
    name: "injected_block",
    label: "Injected context block",
    description:
      "The exact system-prompt context block the server would inject for the user's current org/scope selections, produced by the same code path the agent run uses. Empty when no organization or scopes are active, or while loading.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 200,
    group: "resolved_context",
  },
  {
    name: "block_byte_length",
    label: "Block byte length",
    description:
      "Byte size of the injected context block as reported by the server. Absent when no block would be injected.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 210,
    group: "resolved_context",
  },
  {
    name: "block_producer",
    label: "Block producer",
    description:
      "Name of the server-side producer that built the injected block. Absent when no block would be injected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 220,
    group: "resolved_context",
  },
  {
    name: "scope_labels",
    label: "Active scope labels",
    description:
      "Human labels of the scopes the server resolved into the block (e.g. the active Client / Department selections). Empty array when no scopes are active.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 230,
    group: "resolved_context",
  },
  {
    name: "resolved_preview",
    label: "Full resolved preview",
    description:
      "The complete raw ContextPreviewResponse from the server (block, all variable tiers, bindings, labels) as one object. Large — bindable-only; the individual values ship automatically instead.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    sortOrder: 240,
    group: "resolved_context",
  },

  // ── Variable tiers ────────────────────────────────────────────────────
  {
    name: "variables_direct",
    label: "Variables injected directly",
    description:
      "Resolved context variables that are injected into the prompt every turn, keyed by name (each entry may carry value/source/description provenance). Empty object when none resolve.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 300,
    group: "variable_tiers",
  },
  {
    name: "variables_tool_accessible",
    label: "Tool-accessible variables",
    description:
      "Resolved variables the agent can fetch on demand via tools (not injected directly), keyed by name with provenance. Empty object when none resolve. Bindable-only.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    autoContext: false,
    sortOrder: 310,
    group: "variable_tiers",
  },
  {
    name: "variables_searchable",
    label: "Searchable variables",
    description:
      "Resolved variables reachable only through search, keyed by name with provenance. Empty object when none resolve. Bindable-only.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    autoContext: false,
    sortOrder: 320,
    group: "variable_tiers",
  },

  // ── Agent binding fill ────────────────────────────────────────────────
  {
    name: "binding_variables",
    label: "Scope-filled agent variables",
    description:
      "The previewed agent's declared variables as the scope system would fill them, keyed by variable name. Absent when no agent is being previewed or it declares no variables.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 400,
    group: "binding_fill",
  },
  {
    name: "binding_context_slots",
    label: "Scope-filled context slots",
    description:
      "The previewed agent's declared context slots as the scope system would fill them, keyed by slot name. Absent when no agent is being previewed or it declares no slots.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 410,
    group: "binding_fill",
  },

  // ── Attached client context ───────────────────────────────────────────
  {
    name: "attached_entries",
    label: "Attached context entries",
    description:
      "Client-side context entries published for this conversation's turns (working document, scratchpad, slot fills, extra context): one { key, label, kind, chars } summary per entry. Empty array when nothing is attached or no conversation exists.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 500,
    group: "attached_context",
  },
  {
    name: "attached_client_tools",
    label: "Attached client tools",
    description:
      "Names of client-side tools registered for this conversation's next turn. Empty array when none. Bindable-only.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 150,
    autoContext: false,
    sortOrder: 510,
    group: "attached_context",
  },
  {
    name: "observational_memory",
    label: "Observational memory",
    description:
      "Lean state of observational memory for this conversation: { enabled, model, scope }. Absent when no conversation exists; enabled=false when memory is off.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 520,
    group: "attached_context",
  },
  {
    name: "active_context_layers",
    label: "Active context layers",
    description:
      "The user's active global context layers (organization, scopes, project, task) as { id, title, type } summaries — the layers the server resolves into the injected block. Empty array when nothing is active.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 530,
    group: "attached_context",
  },
];

export const contextPreviewManifest: SurfaceManifest = {
  surfaceName: CONTEXT_PREVIEW_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Manifest + panel emitter live for every declared value. Live binding verification (non-matching-name mapping + Matrx-vs-matrix test) not yet run.",
  label: "Context Preview",
  overlayId: "contextPreviewPanel",
  inheritsFrom: "matrx-user/chat",
  intro: `<surface_intro>
You are on the Context Preview panel — a diagnostic overlay showing the user exactly what their agent will receive on the next run, resolved by the SERVER through the same code path the real agent run uses.
The Resolved view carries the injected context block (injected_block, with block_byte_length / block_producer / scope_labels), the resolved variables by delivery tier (variables_direct / variables_tool_accessible / variables_searchable), and — when an agent is being previewed — how its declared variables and context slots would be scope-filled (binding_variables / binding_context_slots). The Attached view carries the client-side half: attached_entries, attached_client_tools, observational_memory, and active_context_layers.
Everything here is a READ-ONLY mirror of context resolution. Your job is to help the user understand, debug, or summarize this context — why a value resolved the way it did, what is missing, what is oversized — never to change it. The conversation identity (conversation_id, conversation_agent_id) arrives via inheritance from the chat surface.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** One attached client-context entry, summarized for the scope. */
export interface AttachedContextEntrySummary {
  key: string;
  label: string;
  /** "working_document" | "scratchpad" | "slot" | "extra" */
  kind: string;
  chars: number;
}

/** Lean observational-memory state emitted in `observational_memory`. */
export interface ObservationalMemoryRef {
  enabled: boolean;
  model: string | null;
  scope: string | null;
}

/** One active global context layer emitted in `active_context_layers`. */
export interface ActiveContextLayerRef {
  id: string;
  title: string;
  type: string;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; the inherited chat values are all optional.
 */
export function createContextPreviewScope(values: {
  // alwaysAvailable: true → required
  active_view: "resolved" | "attached";
  preview_status: string;
  // alwaysAvailable: false → optional
  preview_error?: string;
  injected_block?: string;
  block_byte_length?: number;
  block_producer?: string;
  scope_labels?: string[];
  resolved_preview?: Record<string, unknown>;
  variables_direct?: Record<string, unknown>;
  variables_tool_accessible?: Record<string, unknown>;
  variables_searchable?: Record<string, unknown>;
  binding_variables?: Record<string, unknown>;
  binding_context_slots?: Record<string, unknown>;
  attached_entries?: AttachedContextEntrySummary[];
  attached_client_tools?: string[];
  observational_memory?: ObservationalMemoryRef;
  active_context_layers?: ActiveContextLayerRef[];
  // Inherited (matrx-user/chat) — the identity of the previewed conversation.
  conversation_id?: string;
  conversation_agent_id?: string;
  // Baselines
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

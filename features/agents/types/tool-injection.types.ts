/**
 * Tool injection types — the unified contract that replaces the legacy
 * `client_tools`, `custom_tools`, `ide_state`, and `sandbox` request fields.
 *
 * Wire shape (all four affected endpoints accept this):
 *   {
 *     tools?:         ToolSpec[]            // additive — added on top of capability defaults + agent's saved tool set
 *     tools_replace?: ToolSpec[] | null     // replace — when set, becomes the entire active tool set for the turn
 *     client?:        ClientContext | null  // capability envelope — declares what the calling surface can do
 *   }
 *
 * Each surface (code editor, sandbox, future Chrome extension / desktop /
 * mobile) registers a `ClientCapabilityProvider` that selects its payload
 * from Redux state at request-build time. `buildToolInjection` walks the
 * registry, collects active capabilities, and emits the envelope.
 */

import type { components } from "@/types/python-generated/api-types";
import type { IdeState } from "./agent-api-types";

// =============================================================================
// ToolSpec — single tool entry
// =============================================================================

/**
 * Tool that lives in the server-side registry. `name` is the registry name
 * (or a UUID — the backend accepts either; UUIDs route through the same
 * lookup as names). When `delegate` is true the server short-circuits
 * dispatch and emits `tool_delegated` for the client to execute.
 */
export type ToolSpecRegistered = components["schemas"]["RegisteredToolSpec"];

/**
 * Inline tool definition — the caller supplies the schema directly. Always
 * client-delegated; the name is added to the model's tool list with the
 * supplied JSON Schema.
 */
export type ToolSpecInline = components["schemas"]["InlineToolSpec"];

/**
 * Project a saved agent as an opaque tool the model can invoke. Per-request
 * scope today; cross-turn persistence pending so prior tool_calls in
 * conversation history keep resolving.
 */
export type ToolSpecAgent = components["schemas"]["AgentToolSpec"];

/** Discriminated union on `kind`. */
export type ToolSpec = ToolSpecRegistered | ToolSpecInline | ToolSpecAgent;

// =============================================================================
// Client capability envelope
// =============================================================================

/**
 * Capabilities currently registered on the backend. Adding a new one is a
 * registry entry on both sides — never a request schema change.
 *
 * - `editor-state`:   payload is `IdeState`. Auto-brings `vsc_get_state` online.
 * - `sandbox-fs`:     payload is `{sandbox_id, base_url, access_token, root_path}`.
 *                     Brings no tools online — fs/shell tools detect at runtime.
 *
 * Unknown capability names cause the backend to return 422.
 */
export type ClientCapabilityName =
  | "editor-state"
  | "sandbox-fs";

/**
 * Per-capability payload shape. Keep this in sync with the backend's
 * registered capabilities. Each surface's provider returns a value of the
 * matching shape (or `null` when inactive for this turn).
 */
export interface ClientCapabilityPayloads {
  "editor-state": IdeState;
  "sandbox-fs": components["schemas"]["SandboxBindingRequest"];
}

/**
 * Wire envelope sent on every agent turn. The `state` keys must be a subset
 * of `capabilities`; the backend validates each payload against the
 * capability's schema and emits a single aggregated 422 if anything fails.
 */
export interface ClientContext {
  /**
   * DB-registered surface name (one row in `public.ui_surface`). The server
   * resolves it to a default tool set via `tool_resolve_for_request` +
   * `tool_surface_defaults.always_include_tools/bundles` with inheritance
   * from `matrx-default/default`, and to template-substitution
   * variables via `public.ui_surface_value`. Unknown name → 422.
   *
   * Examples: `matrx-user/chat`, `matrx-user/agent-builder`,
   * `matrx-user/agent-run`, `matrx-user/code-editor`.
   *
   * Orthogonal to `capabilities` (payload-bearing extras). A request can
   * declare both.
   */
  surface?: string;
  capabilities: ClientCapabilityName[];
  state: Partial<{
    [K in ClientCapabilityName]: ClientCapabilityPayloads[K];
  }>;
  /** Session-only MCP server slugs merged into config.mcp_servers on the host. */
  mcp?: string[];
}

// =============================================================================
// Result of buildToolInjection — what the request builders splat onto payloads
// =============================================================================

export interface ToolInjectionResult {
  tools?: ToolSpec[];
  tools_replace?: ToolSpec[] | null;
  client?: ClientContext;
}

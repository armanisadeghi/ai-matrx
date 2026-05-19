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
export type ToolSpecRegistered =
  components["schemas"]["RegisteredToolSpec"];

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
 * - `nextjs-surface`: payload is `NextjsSurfaceState`. Auto-brings the seven
 *                     UI-first client tools online (`user`, `update_plan`,
 *                     `request_user_takeover`, `tasks`, `user_todos`,
 *                     `memory`, `storage`). Always active when an authenticated
 *                     user is on a Next.js surface.
 *
 * Unknown capability names cause the backend to return 422.
 */
export type ClientCapabilityName =
  | "editor-state"
  | "sandbox-fs"
  | "nextjs-surface";

/**
 * Orchestration state shipped with the `nextjs-surface` capability. Read by
 * aidream's `load_nextjs_tools` discovery handler to filter which UI-first
 * tools to register for the current turn. Field-by-field meanings:
 *
 *   surface          — which chat/agent surface the request is coming from.
 *   route            — current window.location.pathname (snapshot at request build).
 *   route_kind       — coarse-grained classification of the route.
 *   is_admin         — gates admin-only tools.
 *   admin_level      — fine-grained admin tier when is_admin is true.
 *   permission_mode  — 'ask' (confirm before each privileged tool) or 'act' (no prompts).
 *   theme            — 'light' | 'dark' | 'system' — passed to the model so it can
 *                      align rendered content with the user's color scheme.
 *   organization_id / project_id / task_id — scope chain.
 *   active_scopes    — closest-wins scope id by scope_type_id.
 *   extension_bridge — whether matrx-extend is connected (drives "use the
 *                      browser to do X" handoff suggestions).
 *   loaded_categories — hint of categories already registered earlier in
 *                       the conversation (server-side persistence isn't
 *                       generally available, so this is a hint only).
 */
export interface NextjsSurfaceState {
  surface: string;
  route: string | null;
  route_kind: string | null;
  is_admin: boolean;
  admin_level: string | null;
  permission_mode: "ask" | "act";
  theme: "light" | "dark" | "system";
  organization_id: string | null;
  project_id: string | null;
  task_id: string | null;
  active_scopes: Record<string, string>;
  extension_bridge: "connected" | "absent";
  loaded_categories: string[];
}

/**
 * Per-capability payload shape. Keep this in sync with the backend's
 * registered capabilities. Each surface's provider returns a value of the
 * matching shape (or `null` when inactive for this turn).
 */
export interface ClientCapabilityPayloads {
  "editor-state": IdeState;
  "sandbox-fs": components["schemas"]["SandboxBindingRequest"];
  "nextjs-surface": NextjsSurfaceState;
}

/**
 * Wire envelope sent on every agent turn. The `state` keys must be a subset
 * of `capabilities`; the backend validates each payload against the
 * capability's schema and emits a single aggregated 422 if anything fails.
 */
export interface ClientContext {
  capabilities: ClientCapabilityName[];
  state: Partial<{
    [K in ClientCapabilityName]: ClientCapabilityPayloads[K];
  }>;
}

// =============================================================================
// Result of buildToolInjection — what the request builders splat onto payloads
// =============================================================================

export interface ToolInjectionResult {
  tools?: ToolSpec[];
  tools_replace?: ToolSpec[] | null;
  client?: ClientContext;
}

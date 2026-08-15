/**
 * Agent-app surface binding — the runtime half of `matrx-public/p`.
 *
 * WHICH SURFACE AN AGENT APP RUNS ON (decision, 2026-08-15)
 * --------------------------------------------------------
 * An agent app renders through the SAME components in two places, and those
 * two places are two DIFFERENT surfaces:
 *
 *   - `/p/[slug]` (+ `?embed=widget`) → `matrx-public/p`. An anonymous
 *     stranger runs a published app. Its vocabulary includes things that
 *     exist nowhere else: `is_authenticated`, `guest_fingerprint_id`,
 *     `guest_runs_remaining`. Bound agents are first-contact agents.
 *   - `/agent-apps/[id]/**` (run / preview / code preview) →
 *     `matrx-user/agent-apps`, already emitted for every sub-route by
 *     `features/agent-apps/route/AgentAppSurfaceRuntime.tsx` (mounted in the
 *     `[id]` layout). The user there is the app's OWNER, working on the app —
 *     the bound agents are authoring agents, and the scope they want is the
 *     app's code / schema / config, not a guest fingerprint.
 *
 * So: two surfaces, no third one. A shell rendered on an authed route passes
 * NO binding; the launch then auto-adopts the ancestor `matrx-user/agent-apps`
 * provider (name AND live scope) inside `launchAgentExecution`. A shell
 * rendered on `/p` passes the binding below, which is explicit — an explicit
 * `runtime.surfaceName` always wins over adoption.
 *
 * Host values (app identity + visitor) are supplied by whoever renders the
 * shell, because only that host knows whether this is the public route and
 * what the guest's fingerprint / remaining runs are. Live run values come from
 * `useAgentApp` itself, which owns the conversation and the stream.
 */

import {
  PUBLIC_AGENT_APP_SURFACE_NAME,
  createPublicAgentAppScope,
} from "@/features/surfaces/manifests/public-agent-app.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

/**
 * The values only the RENDERING HOST knows: which published app is open and
 * who the visitor is. Mirrors the manifest's `app_identity` + `visitor`
 * groups exactly.
 */
export interface AgentAppSurfaceHostValues {
  app_id: string;
  app_slug: string;
  app_name: string;
  agent_id: string;
  shell_kind: string;
  is_authenticated: boolean;
  agent_version_id?: string;
  guest_fingerprint_id?: string;
  guest_runs_remaining?: number;
}

/**
 * What a host hands a shell (and the shell hands `useAgentApp`) to put the
 * run on a declared surface. Omit it entirely to inherit the ambient surface
 * from an ancestor `SurfaceRuntimeProvider` — see the file header.
 */
export interface AgentAppSurfaceBinding {
  /** Canonical `ui_surface.name`. Today always `matrx-public/p`. */
  surfaceName: string;
  /**
   * Read at scope-build time (launch / Run in the Agents chrome), never
   * snapshotted at mount — guest limits change as the visitor runs the app.
   */
  getHostValues: () => AgentAppSurfaceHostValues;
}

/** The run values `useAgentApp` owns — the manifest's `run_input` + `run_state`. */
export interface AgentAppSurfaceLiveValues {
  user_input?: string;
  form_variable_values?: Record<string, unknown>;
  conversation_id?: string;
  run_status?: "streaming" | "complete" | "error";
  response_text?: string;
}

/**
 * Compose host + live values into the surface's declared scope. Goes through
 * `createPublicAgentAppScope` so TypeScript still enforces the manifest
 * contract ("a UI cannot lie").
 */
export function buildAgentAppSurfaceScope(
  binding: AgentAppSurfaceBinding,
  live: AgentAppSurfaceLiveValues,
): SurfaceScopePayload {
  if (binding.surfaceName !== PUBLIC_AGENT_APP_SURFACE_NAME) {
    // Loud recovery: this builder emits the `matrx-public/p` value set. A
    // different surface name means the caller declared one vocabulary and is
    // shipping another, and every value_mapping on it would silently miss.
    console.error(
      `[surfaces] agent-app binding declares "${binding.surfaceName}" but the scope built here is ${PUBLIC_AGENT_APP_SURFACE_NAME}'s value set — declare a matching builder before binding this surface.`,
    );
  }
  const host = binding.getHostValues();
  return createPublicAgentAppScope({ ...host, ...live });
}

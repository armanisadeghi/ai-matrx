/**
 * THE TURN-1 DOOR CHOICE — the single place that decides whether a new
 * conversation starts by MANDATE KEY or by AGENT ID.
 *
 * Why this is its own module: matrx-frontend used to resolve mandates a SECOND
 * time in the browser and then POST `/ai/agents/{resolvedId}`, while aidream's
 * own mandate door sat unused. Two resolvers meant a server-side rebind or
 * provision never reached client chat. The door choice now lives here, in code
 * a test can pin, instead of inline in a 1000-line thunk.
 *
 * The rule, in order:
 *   1. A version pin wins. Pinning a frozen `agx_version` is an explicit
 *      "run THIS row" that no binding may override, and the mandate path has
 *      no `is_version` channel of its own.
 *   2. A mandate key routes to `/ai/mandates/{key}`. The server resolves
 *      principal → system default → org binding → user binding, applies the
 *      binding's config and the provision/variable contract, then runs the
 *      identical downstream pipeline (`_run_mandated_agent` → `_run_agent`).
 *   3. Otherwise the plain saved-agent route.
 */

import {
  resolveEndpointPath,
  type EndpointOverrideConfig,
} from "@/lib/api/resolve-endpoint-path";

export const AGENT_START_PATH_TEMPLATE = "/ai/agents/{agent_id}" as const;
export const MANDATE_START_PATH_TEMPLATE = "/ai/mandates/{mandate_key}" as const;

export interface StartPathInput {
  /** Live agent id (display identity on a mandate-driven conversation). */
  agentId: string;
  /** Frozen `agx_version` id when the launch pinned one. */
  pinnedVersionId?: string | null;
  /** The conversation's mandate key, when it is mandate-driven. */
  mandateKey?: string | null;
  /** Active endpoint override layers (API version, per-path overrides). */
  overrideConfig?: EndpointOverrideConfig;
}

export interface StartPathChoice {
  /** The resolved in-app path to POST. */
  path: string;
  /** Which door was chosen — for telemetry and tests. */
  door: "mandate" | "agent";
  /** Whether the body must carry `is_version: true`. */
  isVersion: boolean;
}

export function resolveStartPath({
  agentId,
  pinnedVersionId = null,
  mandateKey = null,
  overrideConfig,
}: StartPathInput): StartPathChoice {
  if (!pinnedVersionId && mandateKey) {
    return {
      path: resolveEndpointPath(
        MANDATE_START_PATH_TEMPLATE,
        overrideConfig,
      ).replace("{mandate_key}", encodeURIComponent(mandateKey)),
      door: "mandate",
      isVersion: false,
    };
  }
  const targetId = pinnedVersionId ?? agentId;
  return {
    path: resolveEndpointPath(AGENT_START_PATH_TEMPLATE, overrideConfig).replace(
      "{agent_id}",
      encodeURIComponent(targetId),
    ),
    door: "agent",
    isVersion: Boolean(pinnedVersionId),
  };
}

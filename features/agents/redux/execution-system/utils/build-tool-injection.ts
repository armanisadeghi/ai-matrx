/**
 * buildToolInjection — single source of truth for the new wire-level tool
 * injection contract. Every request builder (executeInstance, resume, etc.)
 * calls this to produce the `tools` / `tools_replace` / `client` fields.
 *
 * Two responsibilities:
 *
 *   1. Turn the slice + widget-handle client-tool list into ToolSpec entries
 *      (`{kind: "registered", name, delegate: true}`).
 *   2. Walk the capability registry, await each provider's payload, and
 *      assemble the `client` envelope. Providers may be async (e.g. the
 *      sandbox provider mints a short-lived bearer on demand).
 *
 * Modes:
 *   - "additive": tools are added on top of the agent's saved tool set.
 *     Used by /ai/agents/{id}, /ai/conversations/{id}, /ai/conversation/{id}/resume.
 *   - "replace":  tools_replace becomes the entire active tool set. Reserved
 *     for surfaces that need to override the saved agent definition.
 */

import type { RootState } from "@/lib/redux/store";
import type {
  ClientCapabilityName,
  ClientCapabilityPayloads,
  ClientContext,
  ToolInjectionResult,
  ToolSpec,
} from "@/features/agents/types/tool-injection.types";
import {
  deriveClientToolsFromHandle,
  isWidgetActionName,
  type WidgetHandle,
} from "@/features/agents/types/widget-handle.types";
import { selectWidgetHandleIdFor } from "../instance-ui-state/instance-ui-state.selectors";
import { callbackManager } from "@/utils/callbackManager";
import { getRegisteredCapabilities } from "../client-capabilities/registry";

interface BuildOptions {
  mode?: "additive" | "replace";
  /**
   * Pre-resolved ToolSpec entries to merge in alongside the client-delegated
   * tool entries. Used when a request needs to ship explicit ToolSpecs that
   * aren't in the slice (e.g. an agent-as-tool projection).
   */
  seedTools?: ToolSpec[];
}

export async function buildToolInjection(
  state: RootState,
  conversationId: string,
  options: BuildOptions = {},
): Promise<ToolInjectionResult> {
  const mode = options.mode ?? "additive";

  // ── 1. Tools — merge non-widget client tools + widget-derived names ─────
  //
  // Source of truth split: the `instanceClientTools` slice holds non-widget
  // client-delegated names (e.g. UI-armed tools), the live widget handle
  // contributes whatever capabilities the currently-attached widget exposes
  // — read fresh on every turn so a widget that just attached or just gained
  // a method takes effect without re-launching.
  const nonWidgetClientTools = (
    state.instanceClientTools.byConversationId[conversationId] ?? []
  ).filter((name) => !isWidgetActionName(name));

  const widgetHandleId = selectWidgetHandleIdFor(state, conversationId);
  const widgetHandle = widgetHandleId
    ? callbackManager.get<WidgetHandle>(widgetHandleId)
    : null;
  const widgetClientTools = deriveClientToolsFromHandle(widgetHandle);

  const clientToolNames = [...nonWidgetClientTools, ...widgetClientTools];
  const clientToolSpecs: ToolSpec[] = clientToolNames.map((name) => ({
    kind: "registered",
    name,
    delegate: true,
  }));

  const allTools: ToolSpec[] = [
    ...(options.seedTools ?? []),
    ...clientToolSpecs,
  ];

  // ── 2. Client envelope — walk capability providers in parallel ──────────
  //
  // Providers may be async (sandbox mints a token on demand). Awaiting in
  // parallel keeps the per-turn cost bounded by the slowest provider, not
  // the sum.
  const providers = getRegisteredCapabilities();
  const resolved = await Promise.all(
    providers.map(async (p) => {
      const payload = await p.selectPayload(state, conversationId);
      return payload == null ? null : { name: p.name, payload };
    }),
  );

  let client: ClientContext | undefined;
  const activeCapabilities: ClientCapabilityName[] = [];
  const stateMap: ClientContext["state"] = {};
  for (const entry of resolved) {
    if (!entry) continue;
    activeCapabilities.push(entry.name);
    // Cast here is safe — registry is keyed on ClientCapabilityName and the
    // payload type is matched per provider via the discriminated registry
    // generic. The runtime check is the !=null guard above.
    (stateMap as Record<string, ClientCapabilityPayloads[ClientCapabilityName]>)[
      entry.name
    ] = entry.payload;
  }
  if (activeCapabilities.length > 0) {
    client = { capabilities: activeCapabilities, state: stateMap };
  }

  // The seven UI-first tools (user / update_plan / request_user_takeover /
  // tasks / user_todos / memory / storage) used to be hardcoded here for
  // every authenticated user. They now ride into the request as
  // ``enabled_tools`` on the ``nextjs-surface`` capability registered in
  // aidream/api/client_capabilities.py — the server auto-injects them
  // with ``delegate=True`` on every request that declares the capability.
  // No frontend push needed.
  //
  // The capability also ships the orchestration envelope (route, scope,
  // admin, permission_mode, …) via the provider in nextjs-surface.provider.ts.

  // ── 3. Assemble result — only include keys with content ─────────────────
  const result: ToolInjectionResult = {};
  if (allTools.length > 0) {
    if (mode === "replace") result.tools_replace = allTools;
    else result.tools = allTools;
  }
  if (client) result.client = client;
  return result;
}

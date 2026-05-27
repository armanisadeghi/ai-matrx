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
import {
  selectWidgetHandleIdFor,
  selectBuilderAdvancedSettings,
} from "../instance-ui-state/instance-ui-state.selectors";
import { callbackManager } from "@/utils/callbackManager";
import { getRegisteredCapabilities } from "../client-capabilities/registry";
// CRITICAL: register the capability providers in the SAME (client) module graph
// that reads them. They were previously only imported from app/Providers.tsx —
// a Server Component — so the side-effect ran server-side and the client
// registry Map was always empty (capabilities: [] on every turn → no sandbox
// binding ever attached). Importing here guarantees registration before this
// consumer runs. See features/.../client-capabilities/register-all.ts.
import "../client-capabilities/register-all";
import { detectActiveSurface } from "@/features/surfaces/utils/route-to-surface";
import { selectCreatorSettings } from "@/lib/redux/preferences/creatorDebugSlice";

interface BuildOptions {
  mode?: "additive" | "replace";
  /**
   * Pre-resolved ToolSpec entries to merge in alongside the client-delegated
   * tool entries. Used when a request needs to ship explicit ToolSpecs that
   * aren't in the slice (e.g. an agent-as-tool projection).
   */
  seedTools?: ToolSpec[];
}

/**
 * TEMPORARY STOPGAP — remove once the aidream `sandbox-fs` capability ships
 * `enabled_tools` (see packages/matrx-ai/matrx_ai/capabilities/built_in.py).
 *
 * Arming the coding toolset is the server's job: declaring the `sandbox-fs`
 * capability should auto-inject these via the capability registry. Until that
 * deploys, a bound box is inert (a normal agent carries none of these tools),
 * so we push them as additive request tools whenever the binding is active.
 * Delete this list + its use below the moment the capability change is live.
 */
const SANDBOX_FS_STOPGAP_TOOL_NAMES = [
  "fs_read",
  "fs_write",
  "fs_edit",
  "fs_patch",
  "fs_list",
  "fs_mkdir",
  "fs_search",
  "shell_execute",
  "shell_python",
  "git_ingest",
] as const;

export async function buildToolInjection(
  state: RootState,
  conversationId: string,
  options: BuildOptions = {},
): Promise<ToolInjectionResult> {
  const mode = options.mode ?? "additive";

  // Creator brakes on surface-driven tool injection. When on, we declare NO
  // `client.surface` so the server's surface resolver never runs — nothing is
  // auto-attached and the agent runs with only its own saved tools. We also
  // skip the sandbox-fs client stopgap below. Two scopes, OR'd together:
  //   - global  (creatorDebugSlice.settings.disableToolInjection) — all runs.
  //   - request (builderAdvancedSettings.disableToolInjection)    — this convo.
  // The durable per-agent equivalent is `agx_agent.tool_config.auto_tools_disabled`
  // (the server's kill switch in tool_merge.py §4), set from the agent's Tools tab.
  const perConversation = selectBuilderAdvancedSettings(conversationId)(state);
  const disableInjection =
    (selectCreatorSettings(state)?.disableToolInjection ?? false) ||
    (perConversation?.disableToolInjection ?? false);

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

  // Per-conversation tools the user added from the Smart Input tools menu
  // (registry UUIDs → server-executed registry specs). Explicit picks, so they
  // ride regardless of the disable-injection brake (which only gates the
  // surface's AUTOMATIC tools, not deliberate additions).
  const addedToolSpecs: ToolSpec[] = (perConversation?.addedTools ?? []).map(
    (id) => ({ kind: "registered", name: id, delegate: false }),
  );

  const allTools: ToolSpec[] = [
    ...(options.seedTools ?? []),
    ...clientToolSpecs,
    ...addedToolSpecs,
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

  // STOPGAP: arm the coding toolset client-side while a sandbox is bound.
  // Remove once aidream's `sandbox-fs` capability declares `enabled_tools`.
  // Skipped under the disable-injection brake — it's an automatic injection.
  if (!disableInjection && activeCapabilities.includes("sandbox-fs")) {
    for (const name of SANDBOX_FS_STOPGAP_TOOL_NAMES) {
      // delegate:false — these run server-side and proxy into the box.
      allTools.push({ kind: "registered", name, delegate: false });
    }
  }

  // The DB-registered surface name the server resolves to a tool set via
  // tool_resolve_for_request + tool_surface_defaults.always_include_tools
  // (e.g. matrx-user/chat carries the UI-first tools; most surfaces carry
  // none — matrx-default/default is intentionally empty).
  // Resolution order:
  //   - brake on  → undefined (server attaches nothing; see disableInjection).
  //   - Surface Simulator set (builderAdvancedSettings.surfaceOverride) → mimic
  //     ANY surface; the server can't tell it's simulated — same wire field.
  //   - otherwise → the surface mapped from the current route.
  const surface = disableInjection
    ? undefined
    : perConversation?.surfaceOverride || detectActiveSurface() || undefined;

  if (surface || activeCapabilities.length > 0) {
    client = {
      surface,
      capabilities: activeCapabilities,
      state: stateMap,
    };
  }

  // ── 3. Assemble result — only include keys with content ─────────────────
  const result: ToolInjectionResult = {};
  if (allTools.length > 0) {
    if (mode === "replace") result.tools_replace = allTools;
    else result.tools = allTools;
  }
  if (client) result.client = client;
  return result;
}

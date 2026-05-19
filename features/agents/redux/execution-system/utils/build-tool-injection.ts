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
import { UI_FIRST_TOOL_NAMES } from "@/features/agents/ui-first-tools/tools/names";

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

  // ── 2b. UI-first tools — auto-merge for any authenticated user ─────────
  //
  // The seven UI-first tools (user / update_plan / request_user_takeover /
  // tasks / user_todos / memory / storage) are declared client-delegated
  // tools that ride alongside any agent's saved tool set. They use the
  // same tool names matrx-extend has been shipping for months — so the
  // names already exist in aidream's `tl_def` registry. We ship them as
  // `kind: "registered"` with `delegate: true` so aidream short-circuits
  // dispatch and emits `tool_delegated` for our client to handle.
  //
  // NOTE: this is INTENTIONALLY decoupled from the `nextjs-surface`
  // capability. Aidream may not have a `load_nextjs_tools` discovery
  // handler registered yet; in that case declaring the capability would
  // 422 the entire request. As long as the user is signed in (which RLS
  // requires for the handlers to write anything), ship the tools.
  if (state.userAuth?.id) {
    const declaredNames = new Set(
      allTools.map((t) => ("name" in t ? (t.name as string) : "")),
    );
    for (const name of UI_FIRST_TOOL_NAMES) {
      if (declaredNames.has(name)) continue;
      allTools.push({ kind: "registered", name, delegate: true });
    }
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

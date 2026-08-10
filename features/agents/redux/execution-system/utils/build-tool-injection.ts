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
import { selectDesktopTargetInstanceId } from "@/lib/redux/preferences/adminPreferencesSlice";
// CRITICAL: register the capability providers in the SAME (client) module graph
// that reads them. They were previously only imported from app/Providers.tsx —
// a Server Component — so the side-effect ran server-side and the client
// registry Map was always empty (capabilities: [] on every turn → no sandbox
// binding ever attached). Importing here guarantees registration before this
// consumer runs. See features/.../client-capabilities/register-all.ts.
import "../client-capabilities/register-all";
import { detectActiveSurface } from "@/features/surfaces/utils/route-to-surface";
import { selectCreatorSettings } from "@/lib/redux/preferences/creatorDebugSlice";
import { isWarRoomToolName } from "@/features/agents/war-room-tools/tools/names";
import { getWarRoomInlineToolDef } from "@/features/agents/war-room-tools/tools/tool-defs";
import { isWarRoomMasterToolName } from "@/features/agents/war-room-master-tools/tools/names";
import { getWarRoomMasterInlineToolDef } from "@/features/agents/war-room-master-tools/tools/tool-defs";
import { isScribeToolName } from "@/features/agents/scribe-tools/tools/names";
import { getScribeInlineToolDef } from "@/features/agents/scribe-tools/tools/tool-defs";
import {
  isDeclaredSurfaceClientToolName,
  listLiveSurfaceClientTools,
} from "@/features/surfaces/runtime/surface-client-tools";
import {
  listAgentWritableTargets,
  SURFACE_WRITE_TOOL_NAME,
} from "@/features/surfaces/runtime/surface-writeback";
import type { ToolSpecInline } from "@/features/agents/types/tool-injection.types";

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

/**
 * The inline spec for `apply_surface_write`, built per turn from the LIVE
 * agent-writable targets (see `listAgentWritableTargets`). Null when nothing
 * is currently agent-writable — no tool is offered, matching aidream's
 * `_write_targets_block` (which likewise stays silent when every target is
 * manual). The `target` enum makes the server reject an undeclared target
 * before it is ever delegated; `value` is deliberately open (each target
 * documents its own shape in the description) — the page handler is the
 * runtime validator.
 */
function buildSurfaceWriteInlineSpec(): ToolSpecInline | null {
  const writable = listAgentWritableTargets();
  if (writable.length === 0) return null;

  const lines = writable.map(({ target, policy }) => {
    const applied =
      policy === "auto" ? "applied immediately" : "the user is asked first";
    const landing =
      target.mode === "draft"
        ? "staged into the page's editor for the user to review and save"
        : target.mode === "entity"
          ? "persisted through the page's canonical save path"
          : "ephemeral view state";
    return `- ${target.name} (type=${target.valueType}, ${landing}, ${applied}): ${target.description}`;
  });

  return {
    kind: "inline",
    name: SURFACE_WRITE_TOOL_NAME,
    description:
      "Write a value into the page the user is currently looking at, through " +
      "one of its declared write targets. The page itself applies the value " +
      "through its own handler — you never touch storage directly, and " +
      "targets not listed here cannot be written. Depending on the target's " +
      "policy the user may be asked to approve in place; a decline is a " +
      "normal outcome (respect it, do not retry). Available targets right " +
      "now:\n" +
      lines.join("\n"),
    input_schema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "The declared write target to apply.",
          enum: writable.map(({ target }) => target.name),
        },
        value: {
          type: ["string", "number", "boolean", "array", "object", "null"],
          description:
            "The value for the chosen target, shaped exactly as that " +
            "target's description specifies.",
        },
      },
      required: ["target", "value"],
    },
  };
}

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

  // War Room, War Room Master, and Scribe tools are currently emitted as
  // Inline tools and armed per conversation through `instanceClientTools` →
  // wire `client_tools`. Inline tools are a permanent, first-class path, but
  // these particular definitions ship in the repo and therefore violate the
  // durability rule: they SHOULD be Registered tools in `tool.definition`.
  // Registration is a separate migration; keep the present wire behavior
  // honest until that work lands. Split them out so known Registered tools use
  // the registered path and the current inline deviation remains explicit.
  const warRoomClientTools = nonWidgetClientTools.filter(isWarRoomToolName);
  const warRoomMasterClientTools = nonWidgetClientTools.filter(
    isWarRoomMasterToolName,
  );
  const scribeClientTools = nonWidgetClientTools.filter(isScribeToolName);
  const registeredClientTools = nonWidgetClientTools.filter(
    (name) =>
      !isWarRoomToolName(name) &&
      !isWarRoomMasterToolName(name) &&
      !isScribeToolName(name) &&
      // Surface client tools are composed from the mounted surface at request
      // time, so Inline tool is the correct path. A name armed via the slice
      // must not also go out as a Registered tool (the server would reject it).
      !isDeclaredSurfaceClientToolName(name),
  );

  const widgetHandleId = selectWidgetHandleIdFor(state, conversationId);
  const widgetHandle = widgetHandleId
    ? callbackManager.get<WidgetHandle>(widgetHandleId)
    : null;
  const widgetClientTools = deriveClientToolsFromHandle(widgetHandle);

  const clientToolNames = [...registeredClientTools, ...widgetClientTools];
  const clientToolSpecs: ToolSpec[] = clientToolNames.map((name) => ({
    kind: "registered",
    name,
    delegate: true,
  }));

  // War-room tools as inline specs (delegated by definition). Maps each armed
  // name to its model-facing definition; unknown names are skipped defensively.
  const warRoomInlineSpecs: ToolSpec[] = warRoomClientTools
    .map((name) => getWarRoomInlineToolDef(name))
    .filter((def): def is NonNullable<typeof def> => def != null);

  // War-room MASTER tools as inline specs — same mechanism, armed only on the
  // master conversation (useMasterAgent.setClientTools).
  const warRoomMasterInlineSpecs: ToolSpec[] = warRoomMasterClientTools
    .map((name) => getWarRoomMasterInlineToolDef(name))
    .filter((def): def is NonNullable<typeof def> => def != null);

  // Scribe tools as inline specs — same mechanism, armed only on a Scribe
  // session's assistant conversation (ScribeScreen.addClientTool).
  const scribeInlineSpecs: ToolSpec[] = scribeClientTools
    .map((name) => getScribeInlineToolDef(name))
    .filter((def): def is NonNullable<typeof def> => def != null);

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
    ...warRoomInlineSpecs,
    ...warRoomMasterInlineSpecs,
    ...scribeInlineSpecs,
    ...addedToolSpecs,
  ];

  // SURFACE client tools (SurfaceManifest.clientTools) — the action half of
  // the surfaces 360 loop. Automatic: every tool that is declared + mounted +
  // handled RIGHT NOW (the live provider stack) is offered as an inline spec,
  // so an agent launched on a surface receives that surface's tools without
  // per-conversation arming. Read fresh every turn — a page that mounted or
  // wired a handler since launch takes effect on the next turn. Skipped under
  // the disable-injection brake (it is an automatic, surface-driven
  // injection, exactly what the brake exists to silence).
  if (!disableInjection) {
    const alreadyNamed = new Set(
      allTools.map((t) => (t.kind === "agent" ? t.agent_id : t.name)),
    );
    for (const live of listLiveSurfaceClientTools()) {
      if (!live.hasHandler) {
        // Declared on a mounted surface but not wired — don't offer the agent
        // a tool that can only fail. The loud failure belongs at the page
        // (see surface-client-tools.ts), not in the model's tool list.
        console.warn(
          `[surface-client-tools] "${live.surfaceName}" declares client tool "${live.tool.name}" with no registered handler — not offered to the agent this turn.`,
        );
        continue;
      }
      if (alreadyNamed.has(live.tool.name)) continue;
      alreadyNamed.add(live.tool.name);
      allTools.push({
        kind: "inline",
        name: live.tool.name,
        description: live.tool.description,
        input_schema: live.tool.inputSchema,
      });
    }

    // SURFACE WRITE TOOL — the stream side of the surfaces 360 loop. Whenever
    // the mounted stack has agent-writable targets (declared + handled +
    // resolving to ask/auto after per-run binding overrides), offer ONE inline
    // tool through which the model lands values in the page. The delegated
    // call routes through `applySurfaceWrite` with `origin: "agent"`, so the
    // apply-policy machinery (ask → in-place confirm, per-binding overrides,
    // the manual floor) governs every write — this injection is the offer, the
    // seam is the gate. Read fresh every turn, like the client tools above.
    const surfaceWriteTool = buildSurfaceWriteInlineSpec();
    if (surfaceWriteTool) {
      if (alreadyNamed.has(surfaceWriteTool.name)) {
        console.warn(
          `[surface-writeback] another tool spec is already named "${surfaceWriteTool.name}" — the surface write tool is not offered this turn.`,
        );
      } else {
        alreadyNamed.add(surfaceWriteTool.name);
        allTools.push(surfaceWriteTool);
      }
    }
  }

  // ── 2. Client envelope — walk capability providers in parallel ──────────
  //
  // Providers may be async (sandbox mints a token on demand). Awaiting in
  // parallel keeps the per-turn cost bounded by the slowest provider, not
  // the sum.
  const providers = getRegisteredCapabilities();
  const resolved = await Promise.all(
    providers.map(async (p) => {
      const payload = await p.selectPayload(state, conversationId);
      return payload == null
        ? null
        : { name: p.name, payload, stateless: p.stateless ?? false };
    }),
  );

  let client: ClientContext | undefined;
  const activeCapabilities: ClientCapabilityName[] = [];
  const stateMap: ClientContext["state"] = {};
  for (const entry of resolved) {
    if (!entry) continue;
    activeCapabilities.push(entry.name);
    // Stateless capabilities (e.g. agent-fs, payload_model=None) are declared
    // in `capabilities[]` only — no `state` entry. This matches the
    // verified-good wire shape and avoids sending a meaningless empty payload.
    if (entry.stateless) continue;
    // Cast here is safe — registry is keyed on ClientCapabilityName and the
    // payload type is matched per provider via the discriminated registry
    // generic. The runtime check is the !=null guard above.
    (stateMap as Record<string, ClientCapabilityPayloads[ClientCapabilityName]>)[
      entry.name
    ] = entry.payload;
  }

  // The admin desktop-target preference may only DIRECT a desktop that the
  // presence-gated provider already declared — never fabricate the
  // `desktop-native` capability from the preference alone. Doing so overrode
  // the provider's null (no live desktop) and made every delegated tool call
  // instance-targeted while the UI truthfully showed no desktop bound; the
  // browser's own /tool_results then failed the submission-binding check
  // (404) and wedged the turn.
  const desktopTargetInstanceId = selectDesktopTargetInstanceId(state);
  const existingDesktopState = stateMap["desktop-native"];
  if (desktopTargetInstanceId && existingDesktopState) {
    stateMap["desktop-native"] = {
      ...existingDesktopState,
      target_instance_id: desktopTargetInstanceId,
    };
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
  // tool_resolve_for_request + tool.surface_defaults.always_include_tools
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

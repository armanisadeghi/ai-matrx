import type { RootState } from "@/lib/redux/store";
import type { ApplicationScope } from "@/features/agents/utils/scope-mapping";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { buildChatContextData } from "./buildChatContextData";
import { getEffectiveSandboxRef } from "@/lib/sandbox/active-binding";
import { selectBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectInstanceOverrideState } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import type {
  ChatRunConfigurationRef,
  ChatSandboxBindingRef,
} from "@/features/surfaces/manifests/chat.manifest";

/**
 * Pure store-read of the `run_configuration` surface value — how the user
 * customized this run via Chat Options (added tools/skills, instance setting
 * overrides, sandbox binding, tool-injection / surface / debug switches).
 *
 * Reads the SAME state Chat Options edits (instance-ui-state advanced
 * settings, instance-model-overrides, the effective sandbox ref — which
 * already honours incognito/ephemeral gating), so the emitted value can never
 * disagree with what the panel shows. The sandbox ref is the stored binding /
 * seed, NOT a liveness check.
 *
 * Returns null when the run has no customization at all — the manifest
 * documents `run_configuration` as empty in that case.
 */
export function buildChatRunConfiguration(
  state: RootState,
  conversationId: string,
): ChatRunConfigurationRef | null {
  const settings = selectBuilderAdvancedSettings(conversationId)(state);
  const overrideState = selectInstanceOverrideState(conversationId)(state);
  const sandboxRef = getEffectiveSandboxRef(state, conversationId);

  const addedTools = settings?.addedTools ?? [];
  const addedSkills = settings?.addedSkills ?? [];
  const disableToolInjection = settings?.disableToolInjection ?? false;
  const surfaceOverride = settings?.surfaceOverride ?? null;
  const debug = settings?.debug ?? false;

  const overriddenSettings = overrideState
    ? Object.keys(overrideState.overrides)
    : [];
  const modelOverrideRaw = overrideState?.overrides?.model;
  const modelOverride =
    typeof modelOverrideRaw === "string" ? modelOverrideRaw : null;

  const sandbox: ChatSandboxBindingRef | null = sandboxRef
    ? {
        row_id: sandboxRef.rowId,
        kind: sandboxRef.kind ?? null,
        name: sandboxRef.name ?? null,
        source: sandboxRef.source,
      }
    : null;

  const customized =
    addedTools.length > 0 ||
    addedSkills.length > 0 ||
    overriddenSettings.length > 0 ||
    sandbox !== null ||
    disableToolInjection ||
    surfaceOverride !== null ||
    debug;
  if (!customized) return null;

  return {
    added_tools: addedTools,
    added_skills: addedSkills,
    disable_tool_injection: disableToolInjection,
    surface_override: surfaceOverride,
    overridden_settings: overriddenSettings,
    model_override: modelOverride,
    sandbox,
    debug,
  };
}

/**
 * Live `matrx-user/chat` scope for agent launches from the run-controls
 * ("Chat Options") panel: the conversation identity + run configuration.
 * The v3 menu / ProTextarea capture the DOM selection themselves; this reads
 * any current window selection as a best-effort baseline.
 */
export function buildRunControlsApplicationScope(
  state: RootState,
  conversationId: string,
): ApplicationScope {
  const selectedText =
    typeof window !== "undefined"
      ? (window.getSelection()?.toString() ?? "")
      : "";
  return buildApplicationScopeFromMenuContext({
    selectedText,
    selectionRange: null,
    contextData: buildChatContextData({
      conversationId,
      runConfiguration: buildChatRunConfiguration(state, conversationId),
    }),
  });
}

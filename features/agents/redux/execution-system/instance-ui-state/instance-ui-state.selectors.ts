/**
 * Instance UI State Selectors
 *
 * SELECTOR RULES enforced here:
 * - Primitives returned directly (string, boolean, null) — stable by value.
 * - No ?? [] / ?? {} defaults — return undefined, guard in component.
 * - ?? for primitives is fine (boolean/string/null are value-compared).
 * - Objects from state returned by reference — safe as long as we don't
 *   construct new objects inside the selector body.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type {
  BuilderAdvancedSettings,
  InstanceUIState,
} from "@/features/agents/types/instance.types";
import type { ResultDisplayMode } from "@/features/agents/utils/run-ui-utils";
import type { VariablesPanelStyle } from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "@/features/agents/types/instance.types";
import { getShortcutRecordFromState } from "@/features/agents/redux/agent-shortcuts/selectors";

// ── Full state accessor ──────────────────────────────────────────────────────

export const selectInstanceUIState =
  (conversationId: string) =>
  (state: RootState): InstanceUIState | undefined =>
    state.instanceUIState.byConversationId[conversationId];

// ── Display Mode ─────────────────────────────────────────────────────────────

export const selectDisplayMode =
  (conversationId: string) =>
  (state: RootState): ResultDisplayMode | undefined =>
    state.instanceUIState.byConversationId[conversationId]?.displayMode;

export const selectIsModalFull =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.displayMode ===
    "modal-full";

export const selectIsModalCompact =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.displayMode ===
    "modal-compact";

export const selectIsChatBubble =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.displayMode ===
    "chat-bubble";

export const selectIsInline =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.displayMode ===
    "inline";

export const selectIsPanel =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.displayMode ===
    "panel";

export const selectIsToast =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.displayMode ===
    "toast";

export const selectIsAnyModal =
  (conversationId: string) =>
  (state: RootState): boolean => {
    const displayMode =
      state.instanceUIState.byConversationId[conversationId]?.displayMode;
    return displayMode === "modal-full" || displayMode === "modal-compact";
  };

// ── Execution behavior ───────────────────────────────────────────────────────

export const selectAutoRun =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.autoRun ?? true;

export const selectAllowChat =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.allowChat ?? true;

// ── Pre-execution gate ───────────────────────────────────────────────────────

export const selectUsePreExecutionInput =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]
      ?.showPreExecutionGate ?? false;

export const selectPreExecutionSatisfied =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]
      ?.preExecutionSatisfied ?? false;

/**
 * Derived: Does this instance need pre-execution input that hasn't been provided yet?
 * Components use this to gate between <AgentPreExecutionInput /> and main content.
 */
export const selectNeedsPreExecutionInput =
  (conversationId: string) =>
  (state: RootState): boolean => {
    const entry = state.instanceUIState.byConversationId[conversationId];
    if (!entry) return false;
    return entry.showPreExecutionGate && !entry.preExecutionSatisfied;
  };

// ── Visibility (fine-grained) ────────────────────────────────────────────────

export const selectShowVariablePanel =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.showVariablePanel ??
    false;

export const selectShowDefinitionMessages =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]
      ?.showDefinitionMessages ?? true;

export const selectShowDefinitionMessageContent =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]
      ?.showDefinitionMessageContent ?? false;

export const selectHiddenMessageCount =
  (conversationId: string) =>
  (state: RootState): number =>
    state.instanceUIState.byConversationId[conversationId]
      ?.hiddenMessageCount ?? 0;

// ── Widget handle integration ────────────────────────────────────────────────

export const selectWidgetHandleId =
  (conversationId: string) =>
  (state: RootState): string | null =>
    state.instanceUIState.byConversationId[conversationId]?.widgetHandleId ??
    null;

/**
 * Non-currying variant for thunks that have the state in hand and just need
 * the id. Selectors are cheap enough that curried + direct coexist.
 */
export const selectWidgetHandleIdFor = (
  state: RootState,
  conversationId: string,
): string | null =>
  state.instanceUIState.byConversationId[conversationId]?.widgetHandleId ??
  null;

// ── Derived: should input be visible ─────────────────────────────────────────

/**
 * Derived selector: should the text input component be visible?
 * True when:
 *   - allowChat is true (user can continue chatting), OR
 *   - autoRun is false and instance is still in draft/ready (user needs to trigger execution)
 */
export const selectShouldShowInput =
  (conversationId: string) =>
  (state: RootState): boolean => {
    const entry = state.instanceUIState.byConversationId[conversationId];
    if (!entry) return false;
    if (entry.allowChat) return true;
    if (!entry.autoRun) {
      const instance = state.conversations.byConversationId[conversationId];
      if (
        instance &&
        (instance.status === "draft" || instance.status === "ready")
      ) {
        return true;
      }
    }
    return false;
  };

// ── Instance identity (simple primitive lookups) ─────────────────────────────

export const selectInstanceAgentId =
  (conversationId: string) =>
  (state: RootState): string | undefined => {
    const inst = state.conversations.byConversationId[conversationId];
    console.log(
      "[selectInstanceAgentId] conversationId:",
      conversationId,
      "| instance exists:",
      !!inst,
      "| agentId:",
      inst?.agentId,
      "| all conversationIds:",
      Object.keys(state.conversations.byConversationId).slice(0, 3),
    );
    return inst?.agentId || undefined;
  };

export const selectInstanceShortcutId =
  (conversationId: string) =>
  (state: RootState): string | null =>
    state.conversations.byConversationId[conversationId]?.shortcutId ?? null;

export const selectInstanceOrigin =
  (conversationId: string) =>
  (state: RootState): string | undefined =>
    state.conversations.byConversationId[conversationId]?.origin;

// ── Instance title selectors (three tiers) ───────────────────────────────────
//
// Three selectors with increasing priority, each returning a guaranteed string.
// All reads are primitives — no new objects, no ?? [] traps, safe for bare
// useAppSelector.
//
// Tier 1 — agent name only:       selectInstanceAgentName (string | undefined)
// Tier 2 — shortcut label first:  selectInstanceTitle     (string | undefined)
// Tier 3 — conversation override: selectInstanceDisplayTitle (always string)
//
// Use the lowest tier that satisfies your use case. Pre-execution UI that
// specifically shows the agent name should use Tier 1. Any chrome that shows
// the best available label should use Tier 2 or 3.

/** Shortcut label — only available when the instance was created from a shortcut. */
export const selectInstanceShortcutLabel =
  (conversationId: string) =>
  (state: RootState): string | undefined => {
    const shortcutId =
      state.conversations.byConversationId[conversationId]?.shortcutId;
    if (!shortcutId) return undefined;
    return getShortcutRecordFromState(state, shortcutId)?.label || undefined;
  };

/**
 * Tier 1 — Agent name only.
 * Returns the agent's name from the definition slice, or undefined.
 * Use when you specifically want the agent name, not a shortcut or conversation label.
 */
export const selectInstanceAgentName =
  (conversationId: string) =>
  (state: RootState): string | undefined => {
    const agentId =
      state.conversations.byConversationId[conversationId]?.agentId;
    if (!agentId) return undefined;
    return state.agentDefinition.agents?.[agentId]?.name || undefined;
  };

/**
 * Tier 1 — Agent description only.
 * Raw read from the definition slice — no ?? / defaults (redux-selector-rules).
 * undefined: missing instance/agent id or agent record not in map yet.
 * null: record exists with description explicitly null.
 */
export const selectInstanceAgentDescription =
  (conversationId: string) =>
  (state: RootState): string | null | undefined => {
    const agentId =
      state.conversations.byConversationId[conversationId]?.agentId;
    if (!agentId) return undefined;
    return state.agentDefinition.agents?.[agentId]?.description;
  };

/**
 * Tier 2 — Static title: shortcut label → agent name → undefined.
 * Use when you want the best static label but don't need conversation context.
 */
export const selectInstanceTitle =
  (conversationId: string) =>
  (state: RootState): string | undefined => {
    const instance = state.conversations.byConversationId[conversationId];
    if (!instance) return undefined;

    if (instance.shortcutId) {
      const label = getShortcutRecordFromState(
        state,
        instance.shortcutId,
      )?.label;
      if (label) return label;
    }

    if (instance.agentId) {
      const name = state.agentDefinition.agents?.[instance.agentId]?.name;
      if (name) return name;
    }

    return undefined;
  };

/**
 * Tier 3 — Full display title: conversationTitle → shortcutLabel → agentName → "Agent".
 *
 * Always returns a string — the "Agent" fallback is inlined so the component
 * never needs a null guard or ?? fallback. Use for any title bar or header
 * that should show the best available label at all times.
 */
export const selectInstanceDisplayTitle =
  (conversationId: string) =>
  (state: RootState): string => {
    const conversationTitle =
      state.messages.byConversationId[conversationId]?.title;
    if (conversationTitle) return conversationTitle;

    const instance = state.conversations.byConversationId[conversationId];
    if (!instance) return "Agent";

    if (instance.shortcutId) {
      const label = getShortcutRecordFromState(
        state,
        instance.shortcutId,
      )?.label;
      if (label) return label;
    }

    if (instance.agentId) {
      const name = state.agentDefinition.agents?.[instance.agentId]?.name;
      if (name) return name;
    }

    return "Agent";
  };

// ── Layout & interaction (existing) ──────────────────────────────────────────

export const selectSubmitOnEnter =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.submitOnEnter ??
    true;

export const selectIsCreator =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.isCreator ?? false;

export const selectShowCreatorDebug =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.showCreatorDebug ??
    false;

export const selectExpandedVariableId =
  (conversationId: string) =>
  (state: RootState): string | null =>
    state.instanceUIState.byConversationId[conversationId]
      ?.expandedVariableId ?? null;

export const selectAutoClearConversation =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]
      ?.autoClearConversation ?? false;

export const selectShowAutoClearToggle =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]
      ?.showAutoClearToggle ?? false;

export const selectIsExpanded =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.isExpanded ?? true;

export const selectModeState =
  (conversationId: string) =>
  (state: RootState): Record<string, unknown> | undefined =>
    state.instanceUIState.byConversationId[conversationId]?.modeState;

export const selectReuseConversationId =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]
      ?.reuseConversationId ?? false;

export const selectBuilderAdvancedSettings =
  (conversationId: string) =>
  (state: RootState): BuilderAdvancedSettings | undefined =>
    state.instanceUIState.byConversationId[conversationId]
      ?.builderAdvancedSettings;

export const selectBuilderDebug =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]
      ?.builderAdvancedSettings?.debug ?? false;

export const selectBuilderStore =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]
      ?.builderAdvancedSettings?.store ?? false;

export const selectUseStructuredSystemInstruction =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]
      ?.builderAdvancedSettings?.useStructuredSystemInstruction ?? false;

export const selectStructuredInstruction =
  (conversationId: string) => (state: RootState) =>
    state.instanceUIState.byConversationId[conversationId]
      ?.builderAdvancedSettings?.structuredInstruction;

// ── Content visibility selectors ──────────────────────────────────────────────

export const selectHideReasoning =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.hideReasoning ??
    false;

export const selectHideToolResults =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.hideToolResults ??
    false;

/**
 * How much tool-call detail to show by default. `default` = the per-tool
 * behavior (expand while streaming → auto-collapse after done, unless a tool
 * overrides). `verbose` = every tool always expanded. `minimal` = nothing
 * auto-opens (single line until clicked).
 */
export type ToolDisplayPreference = "default" | "verbose" | "minimal";

/**
 * The user's global tool-display preference. STUBBED to "default" until the
 * settings UI lands — the shell already honors all three values, so wiring this
 * to a real per-user/org setting later is a one-line change here.
 */
export const selectToolDisplayPreference =
  (_conversationId?: string) =>
  (_state: RootState): ToolDisplayPreference =>
    "default";

export const selectResponseDensity =
  (conversationId: string) =>
  (state: RootState): "comfortable" | "compact" =>
    state.instanceUIState.byConversationId[conversationId]?.responseDensity ??
    "comfortable";

// ── App-settable input / display chrome ─────────────────────────────────────
// Returned with sensible defaults so existing surfaces that never set these
// continue to render the full set of affordances (placeholder, mic, etc.).

export const selectInputPlaceholder =
  (conversationId: string) =>
  (state: RootState): string | null =>
    state.instanceUIState.byConversationId[conversationId]?.inputPlaceholder ??
    null;

export const selectShowFreeformInput =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.showFreeformInput ??
    true;

export const selectShowAttachments =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.showAttachments ??
    true;

export const selectShowMicrophone =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.showMicrophone ??
    true;

export const selectShowUserMessageOptions =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]
      ?.showUserMessageOptions ?? true;

export const selectShowAssistantMessageOptions =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]
      ?.showAssistantMessageOptions ?? true;

export const selectBufferStream =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUIState.byConversationId[conversationId]?.bufferStream ??
    false;

export const selectPreExecutionMessage =
  (conversationId: string) =>
  (state: RootState): string | null =>
    state.instanceUIState.byConversationId[conversationId]
      ?.preExecutionMessage ?? null;

export const selectBypassGateSeconds =
  (conversationId: string) =>
  (state: RootState): number =>
    state.instanceUIState.byConversationId[conversationId]?.bypassGateSeconds ??
    0;

export const selectVariableInputStyle =
  (conversationId: string) =>
  (state: RootState): VariablesPanelStyle =>
    state.instanceUIState.byConversationId[conversationId]
      ?.variablesPanelStyle ?? "inline";

// ── Global preference selectors ───────────────────────────────────────────────

export const selectIsBlockMode = (state: RootState): boolean =>
  state.instanceUIState.isBlockMode;

export const selectIsSnapshot = (state: RootState): boolean =>
  state.instanceUIState.isSnapshot;

export const selectIsMemoryToggleRequested = (state: RootState): boolean =>
  state.instanceUIState.isMemoryToggleRequested;

export const selectMemoryToggleTarget = (state: RootState): boolean =>
  state.instanceUIState.memoryToggleTarget;

export const selectMemoryModel = (state: RootState): string | null =>
  state.instanceUIState.memoryModel;

export const selectMemoryScope = (state: RootState): "thread" | "resource" =>
  state.instanceUIState.memoryScope;

// ── Global registry selectors (keyed by display Mode) ────────────────────────

export const selectInstanceIdsByDisplayMode = (
  displayMode: ResultDisplayMode,
) =>
  createSelector(
    (state: RootState) => state.instanceUIState.byConversationId,
    (byConversationId): string[] | undefined => {
      const ids = Object.keys(byConversationId).filter(
        (id) => byConversationId[id]?.displayMode === displayMode,
      );
      return ids.length > 0 ? ids : undefined;
    },
  );

export const selectModalInstanceIds = createSelector(
  (state: RootState) => state.instanceUIState.byConversationId,
  (byConversationId): string[] | undefined => {
    const ids = Object.keys(byConversationId).filter((id) => {
      const displayMode = byConversationId[id]?.displayMode;
      return displayMode === "modal-full" || displayMode === "modal-compact";
    });
    return ids.length > 0 ? ids : undefined;
  },
);

export const selectPersistentInstanceIds = createSelector(
  (state: RootState) => state.instanceUIState.byConversationId,
  (byConversationId): string[] | undefined => {
    const ids = Object.keys(byConversationId).filter((id) => {
      const displayMode = byConversationId[id]?.displayMode;
      return displayMode === "panel" || displayMode === "chat-bubble";
    });
    return ids.length > 0 ? ids : undefined;
  },
);

// ── All conversation IDs in instance UI state ─────────────────────────────────

export const selectAllUIStateConversationIds = createSelector(
  (state: RootState) => state.instanceUIState.byConversationId,
  (byConversationId): string[] => Object.keys(byConversationId),
);

// ── Instances grouped by agent (for tree view) ────────────────────────────────
//
// Returns stable references: groups with no instances are omitted.
// Instances whose conversations entry has no agentId go into the
// "unassigned" bucket (agentId: null).

export interface InstanceAgentGroup {
  agentId: string | null;
  agentName: string | undefined;
  conversationIds: string[];
}

export const selectUIStateInstancesByAgent = createSelector(
  (state: RootState) => state.instanceUIState.byConversationId,
  (state: RootState) => state.conversations.byConversationId,
  (state: RootState) => state.agentDefinition.agents,
  (byUIConversationId, byExecConversationId, agents): InstanceAgentGroup[] => {
    const groupMap = new Map<string | null, string[]>();

    for (const conversationId of Object.keys(byUIConversationId)) {
      const agentId = byExecConversationId[conversationId]?.agentId ?? null;
      if (!groupMap.has(agentId)) groupMap.set(agentId, []);
      groupMap.get(agentId)!.push(conversationId);
    }

    const result: InstanceAgentGroup[] = [];

    // Named agents first (sorted by name), then unassigned
    const namedAgentIds = Array.from(groupMap.keys())
      .filter((id): id is string => id !== null)
      .sort((a, b) => {
        const nameA = agents?.[a]?.name ?? a;
        const nameB = agents?.[b]?.name ?? b;
        return nameA.localeCompare(nameB);
      });

    for (const agentId of namedAgentIds) {
      result.push({
        agentId,
        agentName: agents?.[agentId]?.name,
        conversationIds: groupMap.get(agentId)!,
      });
    }

    if (groupMap.has(null)) {
      result.push({
        agentId: null,
        agentName: undefined,
        conversationIds: groupMap.get(null)!,
      });
    }

    return result;
  },
);

// ── Full instance UI state slice (for slice viewer) ───────────────────────────

export const selectFullInstanceUIStateSlice = (state: RootState) =>
  state.instanceUIState;

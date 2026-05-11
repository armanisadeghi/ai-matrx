/**
 * Instance UI State Slice
 *
 * Manages per-instance UI configuration and display state.
 * Controls how the instance's results are rendered (modal, chat bubble,
 * inline, panel, toast) and tracks displayMode-specific state.
 *
 * Philosophy: Fine-grained state, coarse-grained config.
 * Each field controls exactly one behavior. Launch options / shortcut configs
 * flip multiple fields at once via helpers (e.g. resolveVisibilitySettings).
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  BuilderAdvancedSettings,
  InstanceUIState,
  JsonExtractionConfig,
} from "@/features/agents/types/instance.types";
import type { ResultDisplayMode } from "@/features/agents/utils/run-ui-utils";
import type { VariablesPanelStyle } from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "@/features/agents/types/instance.types";
import { destroyInstance } from "../conversations/conversations.slice";
import { callbackManager } from "@/utils/callbackManager";

// =============================================================================
// Visibility helper — maps coarse showVariables config to fine-grained state
// =============================================================================

export function resolveVisibilitySettings(showVariables?: boolean): {
  showVariablePanel?: boolean;
  showDefinitionMessages?: boolean;
  showDefinitionMessageContent?: boolean;
} {
  if (showVariables === false) {
    return {
      showVariablePanel: false,
      showDefinitionMessages: false,
      showDefinitionMessageContent: false,
    };
  }
  if (showVariables === true) {
    return {
      showVariablePanel: true,
      showDefinitionMessages: true,
      showDefinitionMessageContent: false,
    };
  }
  return {};
}

// =============================================================================
// State
// =============================================================================

export interface InstanceUIStateSlice {
  byConversationId: Record<string, InstanceUIState>;

  /**
   * Admin/pilot feature — when true, chat renders in "block format" where each
   * message is a distinct, collapsible block instead of a continuous thread.
   *
   * Lives here until promoted to a full user preference (userPreferencesSlice).
   * Read at execute time like apiBaseUrl — applied to the instance at creation.
   * Not tied to any specific instance — it is a global display preference.
   */
  isBlockMode: boolean;

  /**
   * Admin-only — when true, every outbound agent / conversation / chat-manual
   * request is sent with `snapshot: true` so the server captures a full
   * snapshot of the request + response payload for offline inspection.
   *
   * Global on purpose: snapshot mode is a debugging session preference, not
   * a per-instance setting. Read at request-assembly time by the execute
   * thunks and serialized onto the wire payload.
   */
  isSnapshot: boolean;

  /**
   * Admin-only — when true, the next outbound turn sends `memory: true` to
   * enable Observational Memory on the conversation. From that point on the
   * backend persists the flag on `cx_conversation.metadata` and the flag no
   * longer needs to be resent.
   *
   * Unlike `isBlockMode` / `isSnapshot`, which are sent on every turn, this
   * is a **one-shot signal** — see the execute thunks for the consumption
   * logic (they clear this flag after emitting it).
   */
  isMemoryToggleRequested: boolean;

  /**
   * Admin-only — the target enabled state when `isMemoryToggleRequested`
   * fires. `true` enables, `false` disables. Ignored when the toggle flag
   * is false.
   */
  memoryToggleTarget: boolean;

  /**
   * Admin-only — optional `memory_model` override sent with the memory
   * toggle. When null, the backend falls back to `MATRX_OM_DEFAULT_MODEL`.
   * Example values: "google/gemini-2.5-flash", "openai/gpt-5-mini".
   */
  memoryModel: string | null;

  /**
   * Admin-only — `memory_scope` sent with the memory toggle.
   *   "thread"   (default) — memory scoped to this conversation
   *   "resource" — memory scoped across conversations for this user
   */
  memoryScope: "thread" | "resource";
}

const initialState: InstanceUIStateSlice = {
  byConversationId: {},
  isBlockMode: false,
  isSnapshot: false,
  isMemoryToggleRequested: false,
  memoryToggleTarget: true,
  memoryModel: null,
  memoryScope: "thread",
};

// =============================================================================
// Init payload type
// =============================================================================

export interface InitInstanceUIStatePayload {
  conversationId: string;
  displayMode?: ResultDisplayMode;
  autoRun?: boolean;
  allowChat?: boolean;
  showPreExecutionGate?: boolean;
  showVariablePanel?: boolean;
  showDefinitionMessages?: boolean;
  showDefinitionMessageContent?: boolean;
  hiddenMessageCount?: number;
  widgetHandleId?: string | null;
  isCreator?: boolean;
  submitOnEnter?: boolean;
  showAutoClearToggle?: boolean;
  autoClearConversation?: boolean;
  reuseConversationId?: boolean;
  builderAdvancedSettings?: Partial<BuilderAdvancedSettings>;
  hideReasoning?: boolean;
  hideToolResults?: boolean;
  preExecutionMessage?: string | null;
  bypassGateSeconds?: number;
  variablesPanelStyle?: VariablesPanelStyle;
  jsonExtraction?: JsonExtractionConfig | null;
  /** Original text selected in an editor/notes surface before launch. Used by text-manipulation callbacks. */
  originalText?: string | null;
  /**
   * Render density for the transcript chrome — see `InstanceUIState`. Default
   * "comfortable". Surfaces that drive heavy agentic flows (e.g. coding
   * agents, multi-tool research) can pass "compact" at instance creation.
   */
  responseDensity?: "comfortable" | "compact";
  /**
   * App-level identity overrides shown in AgentEmptyMessageDisplay (the
   * centered hero before the first message). When null/undefined, the
   * empty display falls back to the agent's name/description. Set by
   * surfaces (e.g. agent-apps) that want to display their own app
   * identity rather than the underlying agent's.
   */
  displayNameOverride?: string | null;
  displayDescriptionOverride?: string | null;
  /** See InstanceUIState (instance.types.ts) — input/display settings. */
  inputPlaceholder?: string | null;
  showFreeformInput?: boolean;
  showAttachments?: boolean;
  showMicrophone?: boolean;
  showUserMessageOptions?: boolean;
  showAssistantMessageOptions?: boolean;
  bufferStream?: boolean;
}

// =============================================================================
// Slice
// =============================================================================

const instanceUIStateSlice = createSlice({
  name: "instanceUIState",
  initialState,
  reducers: {
    initInstanceUIState(
      state,
      action: PayloadAction<InitInstanceUIStatePayload>,
    ) {
      const {
        conversationId,
        displayMode = "direct",
        autoRun = false,
        allowChat = true,
        showPreExecutionGate = false,
        showVariablePanel = false,
        showDefinitionMessages = true,
        showDefinitionMessageContent = false,
        hiddenMessageCount = 0,
        widgetHandleId = null,
        isCreator = false,
        submitOnEnter = true,
        showAutoClearToggle = false,
        autoClearConversation = false,
        reuseConversationId = false,
        builderAdvancedSettings,
        hideReasoning = false,
        hideToolResults = false,
        preExecutionMessage = null,
        bypassGateSeconds = 0,
        variablesPanelStyle = "inline",
        jsonExtraction = null,
        originalText = null,
        responseDensity = "comfortable",
        displayNameOverride = null,
        displayDescriptionOverride = null,
        inputPlaceholder = null,
        showFreeformInput = true,
        showAttachments = true,
        showMicrophone = true,
        showUserMessageOptions = true,
        showAssistantMessageOptions = true,
        bufferStream = false,
      } = action.payload;

      state.byConversationId[conversationId] = {
        conversationId,
        displayMode,
        autoRun,
        allowChat,
        showPreExecutionGate: showPreExecutionGate,
        preExecutionSatisfied: false,
        showVariablePanel,
        showDefinitionMessages,
        showDefinitionMessageContent,
        hiddenMessageCount,
        widgetHandleId,
        isExpanded: true,
        expandedVariableId: null,
        isCreator,
        showCreatorDebug: false,
        submitOnEnter,
        showAutoClearToggle,
        autoClearConversation,
        reuseConversationId,
        builderAdvancedSettings: {
          ...DEFAULT_BUILDER_ADVANCED_SETTINGS,
          ...builderAdvancedSettings,
        },
        hideReasoning,
        hideToolResults,
        preExecutionMessage,
        bypassGateSeconds,
        variablesPanelStyle,
        modeState: {},
        jsonExtraction,
        originalText,
        responseDensity,
        displayNameOverride,
        displayDescriptionOverride,
        inputPlaceholder,
        showFreeformInput,
        showAttachments,
        showMicrophone,
        showUserMessageOptions,
        showAssistantMessageOptions,
        bufferStream,
      };
    },

    setResponseDensity(
      state,
      action: PayloadAction<{
        conversationId: string;
        density: "comfortable" | "compact";
      }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.responseDensity = action.payload.density;
      }
    },

    setDisplayNameOverride(
      state,
      action: PayloadAction<{
        conversationId: string;
        value: string | null;
      }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.displayNameOverride = action.payload.value;
      }
    },

    setDisplayDescriptionOverride(
      state,
      action: PayloadAction<{
        conversationId: string;
        value: string | null;
      }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.displayDescriptionOverride = action.payload.value;
      }
    },

    setInputPlaceholder(
      state,
      action: PayloadAction<{
        conversationId: string;
        value: string | null;
      }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) entry.inputPlaceholder = action.payload.value;
    },

    setShowFreeformInput(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) entry.showFreeformInput = action.payload.value;
    },

    setShowAttachments(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) entry.showAttachments = action.payload.value;
    },

    setShowMicrophone(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) entry.showMicrophone = action.payload.value;
    },

    setShowUserMessageOptions(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) entry.showUserMessageOptions = action.payload.value;
    },

    setShowAssistantMessageOptions(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) entry.showAssistantMessageOptions = action.payload.value;
    },

    setBufferStream(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) entry.bufferStream = action.payload.value;
    },

    setDisplayMode(
      state,
      action: PayloadAction<{
        conversationId: string;
        displayMode: ResultDisplayMode;
      }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.displayMode = action.payload.displayMode;
        entry.modeState = {};
      }
    },

    setAutoRun(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.autoRun = action.payload.value;
      }
    },

    setAllowChat(
      state,
      action: PayloadAction<{ conversationId: string; allow: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.allowChat = action.payload.allow;
      }
    },

    setUsePreExecutionInput(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.showPreExecutionGate = action.payload.value;
      }
    },

    setPreExecutionSatisfied(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.preExecutionSatisfied = action.payload.value;
      }
    },

    // ── Visibility controls ──────────────────────────────────────────────────

    toggleVariablePanel(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (entry) {
        entry.showVariablePanel = !entry.showVariablePanel;
      }
    },

    setShowVariablePanel(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.showVariablePanel = action.payload.value;
      }
    },

    setShowDefinitionMessages(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.showDefinitionMessages = action.payload.value;
      }
    },

    setShowDefinitionMessageContent(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.showDefinitionMessageContent = action.payload.value;
      }
    },

    setHiddenMessageCount(
      state,
      action: PayloadAction<{ conversationId: string; count: number }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.hiddenMessageCount = action.payload.count;
      }
    },

    /**
     * @deprecated Coarse-grained action: flipped all three fine-grained
     * visibility fields via resolveVisibilitySettings. No callers remained
     * after Phase 3.5, kept only as a historical note. Use setShowVariablePanel
     * / setShowDefinitionMessages / setShowDefinitionMessageContent directly.
     */
    applyShowVariablesConfig(
      state,
      action: PayloadAction<{ conversationId: string; showVariables: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        const resolved = resolveVisibilitySettings(
          action.payload.showVariables,
        );
        if (resolved.showVariablePanel !== undefined)
          entry.showVariablePanel = resolved.showVariablePanel;
        if (resolved.showDefinitionMessages !== undefined)
          entry.showDefinitionMessages = resolved.showDefinitionMessages;
        if (resolved.showDefinitionMessageContent !== undefined)
          entry.showDefinitionMessageContent =
            resolved.showDefinitionMessageContent;
      }
    },

    // ── Widget handle ────────────────────────────────────────────────────────

    setWidgetHandleId(
      state,
      action: PayloadAction<{
        conversationId: string;
        widgetHandleId: string | null;
      }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.widgetHandleId = action.payload.widgetHandleId;
      }
    },

    // ── Layout & interaction ─────────────────────────────────────────────────

    toggleExpanded(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (entry) {
        entry.isExpanded = !entry.isExpanded;
      }
    },

    updateModeState(
      state,
      action: PayloadAction<{
        conversationId: string;
        changes: Record<string, unknown>;
      }>,
    ) {
      const { conversationId, changes } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (entry) {
        Object.assign(entry.modeState, changes);
      }
    },

    setExpandedVariableId(
      state,
      action: PayloadAction<{
        conversationId: string;
        variableId: string | null;
      }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.expandedVariableId = action.payload.variableId;
      }
    },

    toggleCreatorDebug(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (entry) {
        entry.showCreatorDebug = !entry.showCreatorDebug;
      }
    },

    setSubmitOnEnter(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.submitOnEnter = action.payload.value;
      }
    },

    /**
     * Editor-context bridge: replace the disabled-tab id list for this
     * instance. Used by the ContextChip popover to toggle individual tabs
     * in/out of the editor → agent context stream.
     */
    setEditorContextDisabledTabs(
      state,
      action: PayloadAction<{ conversationId: string; tabIds: string[] }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.editorContextDisabledTabs = action.payload.tabIds;
      }
    },

    /**
     * Sandbox / multi-server bridge: route this conversation's AI calls
     * to a specific backend URL instead of the global
     * `selectResolvedBaseUrl`. Pass `null` to clear and revert to the
     * global default.
     *
     * The execute thunks read this BEFORE consulting `selectResolvedBaseUrl`,
     * so the rest of the app keeps hitting whichever server the admin
     * server-toggle picked while this one conversation talks to (e.g.) an
     * in-container Python via the orchestrator proxy.
     */
    setServerOverrideUrl(
      state,
      action: PayloadAction<{
        conversationId: string;
        url: string | null;
      }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.serverOverrideUrl = action.payload.url;
        // Clearing the URL clears the paired token — keeping a stale
        // bearer around with no target it can authenticate against
        // would just be a bug factory.
        if (action.payload.url === null) {
          entry.serverOverrideAuthToken = null;
          entry.serverOverrideAuthTokenError = null;
        }
      }
    },

    /**
     * Set the bearer token paired with `serverOverrideUrl` for direct
     * sandbox-proxy calls. Pass `null` to clear (e.g. on disconnect or
     * when the previous token expired and a new one couldn't be minted).
     */
    setServerOverrideAuthToken(
      state,
      action: PayloadAction<{
        conversationId: string;
        token: string | null;
      }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.serverOverrideAuthToken = action.payload.token;
        if (action.payload.token) {
          entry.serverOverrideAuthTokenError = null;
        }
      }
    },

    /**
     * Record the latest bearer-token mint failure for this conversation
     * so admin debug surfaces (BackendTargetPanel, CodeWorkspaceDebug)
     * can show *why* a sandbox-mode call is unauthenticated. Pass `null`
     * to clear (e.g. on retry success or when the binding goes away).
     *
     * This is observability-only — runtime auth resolution still keys
     * exclusively off `serverOverrideAuthToken`.
     */
    setServerOverrideAuthTokenError(
      state,
      action: PayloadAction<{
        conversationId: string;
        error: string | null;
      }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.serverOverrideAuthTokenError = action.payload.error;
      }
    },

    setShowAutoClearToggle(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.showAutoClearToggle = action.payload.value;
      }
    },
    setAutoClearConversation(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.autoClearConversation = action.payload.value;
      }
    },

    setReuseConversationId(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.reuseConversationId = action.payload.value;
      }
    },

    setBuilderAdvancedSettings(
      state,
      action: PayloadAction<{
        conversationId: string;
        changes: Partial<BuilderAdvancedSettings>;
      }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        Object.assign(entry.builderAdvancedSettings, action.payload.changes);
      }
    },

    resetBuilderAdvancedSettings(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (entry) {
        entry.builderAdvancedSettings = {
          ...DEFAULT_BUILDER_ADVANCED_SETTINGS,
        };
      }
    },

    setStructuredInstruction(
      state,
      action: PayloadAction<{
        conversationId: string;
        changes: Record<string, unknown>;
      }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        Object.assign(
          entry.builderAdvancedSettings.structuredInstruction,
          action.payload.changes,
        );
      }
    },

    resetStructuredInstruction(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (entry) {
        entry.builderAdvancedSettings.structuredInstruction = {};
      }
    },

    setHideReasoning(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.hideReasoning = action.payload.value;
      }
    },

    setHideToolResults(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.hideToolResults = action.payload.value;
      }
    },

    setPreExecutionMessage(
      state,
      action: PayloadAction<{ conversationId: string; message: string | null }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.preExecutionMessage = action.payload.message;
      }
    },

    setVariablesPanelStyle(
      state,
      action: PayloadAction<{
        conversationId: string;
        style: VariablesPanelStyle;
      }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.variablesPanelStyle = action.payload.style;
      }
    },

    setOriginalText(
      state,
      action: PayloadAction<{ conversationId: string; text: string | null }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.originalText = action.payload.text;
      }
    },

    removeInstanceUIState(state, action: PayloadAction<string>) {
      delete state.byConversationId[action.payload];
    },

    setUseBlockMode(state, action: PayloadAction<boolean>) {
      state.isBlockMode = action.payload;
    },

    setUseSnapshot(state, action: PayloadAction<boolean>) {
      state.isSnapshot = action.payload;
    },

    // ── Observational Memory (admin-only) ────────────────────────────────────

    /**
     * Queue a one-shot `memory: true|false` signal to ride the next outbound
     * turn. The execute thunks read + clear this on each call.
     */
    requestMemoryToggle(state, action: PayloadAction<{ enabled: boolean }>) {
      state.isMemoryToggleRequested = true;
      state.memoryToggleTarget = action.payload.enabled;
    },

    /** Clear the queued toggle after it has been sent. */
    clearMemoryToggleRequest(state) {
      state.isMemoryToggleRequested = false;
    },

    setMemoryModel(state, action: PayloadAction<string | null>) {
      state.memoryModel = action.payload;
    },

    setMemoryScope(state, action: PayloadAction<"thread" | "resource">) {
      state.memoryScope = action.payload;
    },
  },

  extraReducers: (builder) => {
    builder.addCase(destroyInstance, (state, action) => {
      const conversationId = action.payload;
      const entry = state.byConversationId[conversationId];
      if (entry?.widgetHandleId) {
        // Widget handles are SINGLE entries (not groups) — use unregister,
        // not removeGroup. removeGroup here would silently no-op and leak.
        callbackManager.unregister(entry.widgetHandleId);
      }
      delete state.byConversationId[conversationId];
    });
  },
});

export const {
  initInstanceUIState,
  setDisplayMode,
  setAutoRun,
  setAllowChat,
  setUsePreExecutionInput,
  setPreExecutionSatisfied,
  toggleVariablePanel,
  setShowVariablePanel,
  setShowDefinitionMessages,
  setShowDefinitionMessageContent,
  setHiddenMessageCount,
  applyShowVariablesConfig,
  setWidgetHandleId,
  toggleExpanded,
  updateModeState,
  setExpandedVariableId,
  toggleCreatorDebug,
  setSubmitOnEnter,
  setEditorContextDisabledTabs,
  setServerOverrideUrl,
  setServerOverrideAuthToken,
  setServerOverrideAuthTokenError,
  setShowAutoClearToggle,
  setAutoClearConversation,
  setReuseConversationId,
  setBuilderAdvancedSettings,
  resetBuilderAdvancedSettings,
  setStructuredInstruction,
  resetStructuredInstruction,
  setHideReasoning,
  setHideToolResults,
  setResponseDensity,
  setDisplayNameOverride,
  setDisplayDescriptionOverride,
  setInputPlaceholder,
  setShowFreeformInput,
  setShowAttachments,
  setShowMicrophone,
  setShowUserMessageOptions,
  setShowAssistantMessageOptions,
  setBufferStream,
  setPreExecutionMessage,
  setVariablesPanelStyle,
  setOriginalText,
  removeInstanceUIState,
  setUseBlockMode,
  setUseSnapshot,
  requestMemoryToggle,
  clearMemoryToggleRequest,
  setMemoryModel,
  setMemoryScope,
} = instanceUIStateSlice.actions;

export default instanceUIStateSlice.reducer;

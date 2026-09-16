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
import { createInstanceFull } from "../create-instance-full";

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
   * THE PROVISIONAL LEDGER (D326). Writes that arrived for a conversation whose
   * entry did not exist yet, keyed by conversation id. `stageOrApply` records
   * every such field here while it keeps the provisional entry alive; the real
   * `initInstanceUIState` — which REPLACES the whole entry — replays them on
   * top of the created row for every field the creation did not state itself,
   * and then clears the record. Cleared by destroy/remove as well.
   */
  pendingByConversationId: Record<string, Partial<InstanceUIState>>;

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
  pendingByConversationId: {},
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
  displayIconNameOverride?: string | null;
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
// THE NO-DROPPED-WRITE RULE (D326)
// =============================================================================

/**
 * Every setter in this slice used to read
 * `const entry = state.byConversationId[id]; if (entry) { … }` — so a write
 * aimed at a conversation whose UI-state entry did not exist YET was discarded
 * in silence, and the calling code read as though it had taken effect.
 *
 * That window is not exotic, it is the normal order of things: a launcher hands
 * a surface its `conversationId` before `createInstanceFull` writes the row,
 * which is exactly when a mount-once effect fires. It cost the Masterwork
 * interview its "Your interviewer" hero and the Conductor its "who is in the
 * room" introduction — both surfaces dispatched their three display overrides
 * on mount, both were no-ops whenever the row landed a beat later, and neither
 * logged a thing (D326, 2026-09-16). Every other setter here shared the bug.
 *
 * `stageOrApply` is now the ONE write path. When the entry exists it applies
 * the patch. When it does not, it creates the entry at this slice's own
 * documented defaults (the canonical factory is `initInstanceUIState` itself,
 * so a provisional entry is a COMPLETE entry, never a partial one), applies the
 * patch on top, says so once in the console, and records the written fields in
 * `pendingByConversationId` so the real creation — which replaces the entry
 * wholesale — replays them instead of undoing them.
 *
 * A reducer that cannot apply a write must queue it or raise. It must never
 * swallow it.
 */
function stageOrApply(
  state: InstanceUIStateSlice,
  conversationId: string,
  actionName: string,
  patch: Partial<InstanceUIState>,
): void {
  const existing = state.byConversationId[conversationId];
  if (existing) {
    Object.assign(existing, patch);
    // Still provisional: keep the ledger current so the real creation replays
    // this field too.
    const pending = state.pendingByConversationId[conversationId];
    if (pending) Object.assign(pending, patch);
    return;
  }

  console.error(
    `[instance-ui-state] ${actionName} arrived for conversation ` +
      `"${conversationId}" before its UI-state entry existed. The entry is ` +
      `being created at defaults and the write kept; it will be replayed on ` +
      `top of the real instance when it lands. If the instance never lands, ` +
      `the surface launched its UI without a conversation.`,
  );

  instanceUIStateSlice.caseReducers.initInstanceUIState(
    state,
    instanceUIStateSlice.actions.initInstanceUIState({ conversationId }),
  );
  Object.assign(state.byConversationId[conversationId], patch);
  state.pendingByConversationId[conversationId] = { ...patch };
}

/**
 * Read a field for a setter that needs the CURRENT value (a toggle, a merge
 * into a nested object). Falls back to this slice's documented default when
 * neither the entry nor a staged write has a value, so a toggle dispatched
 * before the instance exists flips from the same starting point it would have
 * flipped from after.
 */
function readField<K extends keyof InstanceUIState>(
  state: InstanceUIStateSlice,
  conversationId: string,
  key: K,
  fallback: InstanceUIState[K],
): InstanceUIState[K] {
  const entry = state.byConversationId[conversationId];
  if (entry && entry[key] !== undefined) return entry[key];
  const pending = state.pendingByConversationId[conversationId];
  if (pending && pending[key] !== undefined)
    return pending[key] as InstanceUIState[K];
  return fallback;
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
        displayIconNameOverride = null,
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
        displayIconNameOverride,
        inputPlaceholder,
        showFreeformInput,
        showAttachments,
        showMicrophone,
        showUserMessageOptions,
        showAssistantMessageOptions,
        bufferStream,
      };

      // THE REPLAY (D326). Writes that landed before this entry existed were
      // kept on the provisional entry and recorded in the ledger. This creation
      // REPLACED that entry, so put them back — except for any field this
      // creation stated itself, which is the more recent intent and wins.
      const staged = state.pendingByConversationId[conversationId];
      if (staged) {
        delete state.pendingByConversationId[conversationId];
        const stated = new Set(Object.keys(action.payload));
        const replayed = (Object.keys(staged) as (keyof InstanceUIState)[])
          .filter((key) => !stated.has(key as string));
        if (replayed.length > 0) {
          const entry = state.byConversationId[conversationId];
          for (const key of replayed) {
            (entry as Record<string, unknown>)[key as string] = staged[key];
          }
          console.warn(
            `[instance-ui-state] conversation "${conversationId}" was created ` +
              `after ${replayed.length} write(s) had already been made against ` +
              `it (${replayed.join(", ")}); they were replayed on top of the ` +
              `new entry. A surface is writing display state before its ` +
              `instance exists — that is handled, but it is worth knowing.`,
          );
        }
      }
    },

    setResponseDensity(
      state,
      action: PayloadAction<{
        conversationId: string;
        density: "comfortable" | "compact";
      }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setResponseDensity", {
        responseDensity: action.payload.density,
      });
    },

    setDisplayNameOverride(
      state,
      action: PayloadAction<{
        conversationId: string;
        value: string | null;
      }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setDisplayNameOverride", {
        displayNameOverride: action.payload.value,
      });
    },

    setDisplayDescriptionOverride(
      state,
      action: PayloadAction<{
        conversationId: string;
        value: string | null;
      }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setDisplayDescriptionOverride", {
        displayDescriptionOverride: action.payload.value,
      });
    },

    setDisplayIconNameOverride(
      state,
      action: PayloadAction<{
        conversationId: string;
        value: string | null;
      }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setDisplayIconNameOverride", {
        displayIconNameOverride: action.payload.value,
      });
    },

    setInputPlaceholder(
      state,
      action: PayloadAction<{
        conversationId: string;
        value: string | null;
      }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setInputPlaceholder", {
        inputPlaceholder: action.payload.value,
      });
    },

    setShowFreeformInput(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setShowFreeformInput", {
        showFreeformInput: action.payload.value,
      });
    },

    setShowAttachments(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setShowAttachments", {
        showAttachments: action.payload.value,
      });
    },

    setShowMicrophone(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setShowMicrophone", {
        showMicrophone: action.payload.value,
      });
    },

    setShowUserMessageOptions(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setShowUserMessageOptions", {
        showUserMessageOptions: action.payload.value,
      });
    },

    setShowAssistantMessageOptions(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setShowAssistantMessageOptions", {
        showAssistantMessageOptions: action.payload.value,
      });
    },

    setBufferStream(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setBufferStream", {
        bufferStream: action.payload.value,
      });
    },

    setDisplayMode(
      state,
      action: PayloadAction<{
        conversationId: string;
        displayMode: ResultDisplayMode;
      }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setDisplayMode", {
        displayMode: action.payload.displayMode,
        modeState: {},
      });
    },

    setAutoRun(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setAutoRun", {
        autoRun: action.payload.value,
      });
    },

    setAllowChat(
      state,
      action: PayloadAction<{ conversationId: string; allow: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setAllowChat", {
        allowChat: action.payload.allow,
      });
    },

    setUsePreExecutionInput(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setUsePreExecutionInput", {
        showPreExecutionGate: action.payload.value,
      });
    },

    setPreExecutionSatisfied(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setPreExecutionSatisfied", {
        preExecutionSatisfied: action.payload.value,
      });
    },

    // ── Visibility controls ──────────────────────────────────────────────────

    toggleVariablePanel(state, action: PayloadAction<string>) {
      stageOrApply(state, action.payload, "toggleVariablePanel", {
        showVariablePanel: !readField(
          state,
          action.payload,
          "showVariablePanel",
          false,
        ),
      });
    },

    setShowVariablePanel(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setShowVariablePanel", {
        showVariablePanel: action.payload.value,
      });
    },

    setShowDefinitionMessages(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setShowDefinitionMessages", {
        showDefinitionMessages: action.payload.value,
      });
    },

    setShowDefinitionMessageContent(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setShowDefinitionMessageContent", {
        showDefinitionMessageContent: action.payload.value,
      });
    },

    setHiddenMessageCount(
      state,
      action: PayloadAction<{ conversationId: string; count: number }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setHiddenMessageCount", {
        hiddenMessageCount: action.payload.count,
      });
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
      const resolved = resolveVisibilitySettings(action.payload.showVariables);
      stageOrApply(
        state,
        action.payload.conversationId,
        "applyShowVariablesConfig",
        resolved,
      );
    },

    // ── Widget handle ────────────────────────────────────────────────────────

    setWidgetHandleId(
      state,
      action: PayloadAction<{
        conversationId: string;
        widgetHandleId: string | null;
      }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setWidgetHandleId", {
        widgetHandleId: action.payload.widgetHandleId,
      });
    },

    // ── Layout & interaction ─────────────────────────────────────────────────

    toggleExpanded(state, action: PayloadAction<string>) {
      stageOrApply(state, action.payload, "toggleExpanded", {
        isExpanded: !readField(state, action.payload, "isExpanded", true),
      });
    },

    updateModeState(
      state,
      action: PayloadAction<{
        conversationId: string;
        changes: Record<string, unknown>;
      }>,
    ) {
      const { conversationId, changes } = action.payload;
      stageOrApply(state, conversationId, "updateModeState", {
        modeState: {
          ...readField(state, conversationId, "modeState", {}),
          ...changes,
        },
      });
    },

    setExpandedVariableId(
      state,
      action: PayloadAction<{
        conversationId: string;
        variableId: string | null;
      }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setExpandedVariableId", {
        expandedVariableId: action.payload.variableId,
      });
    },

    toggleCreatorDebug(state, action: PayloadAction<string>) {
      stageOrApply(state, action.payload, "toggleCreatorDebug", {
        showCreatorDebug: !readField(
          state,
          action.payload,
          "showCreatorDebug",
          false,
        ),
      });
    },

    setSubmitOnEnter(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setSubmitOnEnter", {
        submitOnEnter: action.payload.value,
      });
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
      stageOrApply(state, action.payload.conversationId, "setEditorContextDisabledTabs", {
        editorContextDisabledTabs: action.payload.tabIds,
      });
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
      stageOrApply(
        state,
        action.payload.conversationId,
        "setServerOverrideUrl",
        {
          serverOverrideUrl: action.payload.url,
          // Clearing the URL clears the paired token — keeping a stale
          // bearer around with no target it can authenticate against
          // would just be a bug factory.
          ...(action.payload.url === null
            ? {
                serverOverrideAuthToken: null,
                serverOverrideAuthTokenError: null,
              }
            : {}),
        },
      );
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
      stageOrApply(
        state,
        action.payload.conversationId,
        "setServerOverrideAuthToken",
        {
          serverOverrideAuthToken: action.payload.token,
          ...(action.payload.token ? { serverOverrideAuthTokenError: null } : {}),
        },
      );
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
      stageOrApply(state, action.payload.conversationId, "setServerOverrideAuthTokenError", {
        serverOverrideAuthTokenError: action.payload.error,
      });
    },

    setShowAutoClearToggle(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setShowAutoClearToggle", {
        showAutoClearToggle: action.payload.value,
      });
    },
    setAutoClearConversation(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setAutoClearConversation", {
        autoClearConversation: action.payload.value,
      });
    },

    setReuseConversationId(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setReuseConversationId", {
        reuseConversationId: action.payload.value,
      });
    },

    /**
     * Never drop a per-run pick. On `/chat/new` the landing composer renders
     * against the minted conversation id BEFORE the launcher's create effect
     * runs (`ChatRoomClient` gates it on `ready: !isInitializing &&
     * isFreshRoute`), so a person could attach an MCP server or a tool, see
     * nothing happen, and send a run without it. `stageOrApply` (see above) is
     * what keeps it — and `createInstanceFull` additionally carries the
     * per-run additions across a genuine RE-create (see extraReducers below).
     */
    setBuilderAdvancedSettings(
      state,
      action: PayloadAction<{
        conversationId: string;
        changes: Partial<BuilderAdvancedSettings>;
      }>,
    ) {
      const { conversationId, changes } = action.payload;
      stageOrApply(state, conversationId, "setBuilderAdvancedSettings", {
        builderAdvancedSettings: {
          ...readField(
            state,
            conversationId,
            "builderAdvancedSettings",
            DEFAULT_BUILDER_ADVANCED_SETTINGS,
          ),
          ...changes,
        },
      });
    },

    resetBuilderAdvancedSettings(state, action: PayloadAction<string>) {
      stageOrApply(state, action.payload, "resetBuilderAdvancedSettings", {
        builderAdvancedSettings: { ...DEFAULT_BUILDER_ADVANCED_SETTINGS },
      });
    },

    setStructuredInstruction(
      state,
      action: PayloadAction<{
        conversationId: string;
        changes: Record<string, unknown>;
      }>,
    ) {
      const { conversationId, changes } = action.payload;
      const current = readField(
        state,
        conversationId,
        "builderAdvancedSettings",
        DEFAULT_BUILDER_ADVANCED_SETTINGS,
      );
      stageOrApply(state, conversationId, "setStructuredInstruction", {
        builderAdvancedSettings: {
          ...current,
          structuredInstruction: {
            ...current.structuredInstruction,
            ...changes,
          },
        },
      });
    },

    resetStructuredInstruction(state, action: PayloadAction<string>) {
      const conversationId = action.payload;
      stageOrApply(state, conversationId, "resetStructuredInstruction", {
        builderAdvancedSettings: {
          ...readField(
            state,
            conversationId,
            "builderAdvancedSettings",
            DEFAULT_BUILDER_ADVANCED_SETTINGS,
          ),
          structuredInstruction: {},
        },
      });
    },

    setHideReasoning(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setHideReasoning", {
        hideReasoning: action.payload.value,
      });
    },

    setHideToolResults(
      state,
      action: PayloadAction<{ conversationId: string; value: boolean }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setHideToolResults", {
        hideToolResults: action.payload.value,
      });
    },

    setPreExecutionMessage(
      state,
      action: PayloadAction<{ conversationId: string; message: string | null }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setPreExecutionMessage", {
        preExecutionMessage: action.payload.message,
      });
    },

    setVariablesPanelStyle(
      state,
      action: PayloadAction<{
        conversationId: string;
        style: VariablesPanelStyle;
      }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setVariablesPanelStyle", {
        variablesPanelStyle: action.payload.style,
      });
    },

    setOriginalText(
      state,
      action: PayloadAction<{ conversationId: string; text: string | null }>,
    ) {
      stageOrApply(state, action.payload.conversationId, "setOriginalText", {
        originalText: action.payload.text,
      });
    },

    removeInstanceUIState(state, action: PayloadAction<string>) {
      delete state.byConversationId[action.payload];
      delete state.pendingByConversationId[action.payload];
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
    // Atomic creation. Delegate to the slice's own initInstanceUIState case
    // reducer (resolved at dispatch time) so the ~45-field init can never drift
    // from the createInstanceFull path. When no uiState bundle is present the
    // defaults apply (conversationId only).
    builder.addCase(createInstanceFull, (state, action) => {
      const { conversationId, uiState } = action.payload;
      // PER-RUN ADDITIONS SURVIVE A RE-CREATE. Init REPLACES the whole entry,
      // which is right for the ~45 display fields — but `addedTools`,
      // `addedMcpServers` and `addedSkills` are deliberate user picks, not
      // display config. A surface that re-creates the same conversation id
      // (the chat launcher re-runs its effect whenever `ready` or the
      // fresh-session nonce changes, and `destroyInstanceIfAbandoned` +
      // re-create is its normal cleanup path) would otherwise wipe an MCP the
      // person attached seconds earlier, with nothing on screen to say so.
      // Carry them forward unless THIS creation explicitly states its own.
      const prior = state.byConversationId[conversationId]?.builderAdvancedSettings;
      const incoming = uiState?.builderAdvancedSettings;
      const carried = (
        ["addedTools", "addedMcpServers", "addedSkills"] as const
      ).filter(
        (key) =>
          (prior?.[key]?.length ?? 0) > 0 && incoming?.[key] === undefined,
      );

      instanceUIStateSlice.caseReducers.initInstanceUIState(
        state,
        instanceUIStateSlice.actions.initInstanceUIState({
          conversationId,
          ...(uiState ?? {}),
        }),
      );

      if (carried.length > 0 && prior) {
        for (const key of carried) {
          state.byConversationId[conversationId].builderAdvancedSettings[key] = [
            ...(prior[key] ?? []),
          ];
        }
        console.warn(
          `[instance-ui-state] conversation "${conversationId}" was re-created while it ` +
            `already carried per-run additions (${carried.join(", ")}) — they were kept. ` +
            `A re-create on a conversation the person has already configured means a ` +
            `launcher effect re-ran under them; the picks must never be the casualty.`,
        );
      }
    });

    builder.addCase(destroyInstance, (state, action) => {
      const conversationId = action.payload;
      // Do NOT unregister the widget handle here. The handle is owned by the
      // REGISTRANT (useWidgetHandle / useOptionalWidgetHandle unregister on
      // component unmount) and its lifetime is the WIDGET's, not the
      // conversation's: the context-menu shell registers ONE handle per
      // surface and passes the same id to every launch, and a widget can
      // outlive any single conversation (new-conversation reset, gate
      // cancel). Unregistering here permanently killed inline editing for a
      // still-mounted surface — the hooks never re-register after an
      // external unregister, so every later launch carried a dead id.
      delete state.byConversationId[conversationId];
      // The instance is gone; a write staged for an instance that will never
      // arrive must not be replayed onto a future one with the same id.
      delete state.pendingByConversationId[conversationId];
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
  setDisplayIconNameOverride,
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

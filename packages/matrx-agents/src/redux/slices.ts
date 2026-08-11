/**
 * Slice reducers + actions barrel. Consumers plug these reducers into their
 * root reducer keyed EXACTLY as listed here — the slice names are part of
 * the public contract, because every selector reads `state.<sliceKey>...`.
 *
 * Expected store layout:
 *
 *   {
 *     conversations,               // entity
 *     messages,                    // DB-faithful message records
 *     conversationList,            // unified list (global + agent-scoped)
 *     observability,               // cx_user_request + cx_request + cx_tool_call + timelines
 *     cacheBypass,                 // one-shot per-conversation bust flags
 *     messageActions,              // action-bar registry
 *     conversationFocus,           // surface → conversationId
 *     activeRequests,              // live stream state
 *     instanceUIState,             // display flags
 *     instanceModelOverrides,      // 3-state overrides
 *     instanceVariableValues,      // 3-state variables
 *     instanceResources,           // attachments
 *     instanceContext,             // typed context dict
 *     instanceClientTools,         // client-executable tool names
 *     instanceUserInput,           // draft input (+ undo/redo)
 *     agentDefinition,             // agent library
 *     agentShortcut,               // shortcuts
 *     agentApp,                    // apps (scaffold)
 *     agentConsumers,              // consumer surface registry
 *     tools,                       // tool catalog
 *     mcp,                         // MCP server catalog
 *   }
 *
 * Phase 9.5 provides a helper `buildAgentsReducerMap()` that returns this
 * map directly so consumers can spread it into their `combineReducers`.
 */

// ── Entity + DB-faithful data ───────────────────────────────────────────────
export {
  default as conversationsReducer,
  createInstance,
  setInstanceStatus,
  confirmServerSync,
  setConversationLabel,
  patchConversation,
  hydrateConversation,
  setDebugSession,
  destroyInstance,
  destroyInstancesForAgent,
} from "@/features/agents/redux/execution-system/conversations/conversations.slice";

export {
  default as messagesReducer,
  initInstanceMessages,
  addOptimisticUserMessage,
  promoteMessageId,
  reserveMessage,
  updateMessageRecord,
  hydrateMessages,
  removeMessage,
  setConversationLabel as setMessagesConversationLabel,
  clearMessages,
} from "@/features/agents/redux/execution-system/messages/messages.slice";

export { conversationListCacheKey } from "@/features/agents/redux/conversation-list/conversation-list.types";
export {
  default as observabilityReducer,
  upsertUserRequest,
  patchUserRequest,
  upsertRequest,
  patchRequest,
  upsertToolCall,
  patchToolCall,
  setTimeline,
  appendTimelineEntry,
  upsertReservation as upsertObservabilityReservation,
  hydrateObservability,
  clearForConversation,
} from "@/features/agents/redux/execution-system/observability/observability.slice";

// ── Unified list (sidebar + agent caches) ──────────────────────────────────
export {
  conversationListReducer,
  conversationListActions,
  setGlobalListLoading,
  setGlobalListSuccess,
  setGlobalListError,
  upsertConversation,
  prependConversation,
  renameConversation,
  revertRename,
  removeConversation,
  touchConversation,
  markPending,
  clearPending,
  setAgentCacheLoading,
  setAgentCacheSuccess,
  setAgentCacheError,
  upsertConversationInCaches,
  patchConversationMetadata,
  invalidateAgentCache,
  clearAllAgentCaches,
  resetConversationList,
} from "@/features/agents/redux/conversation-list/conversation-list.slice";

// ── Per-conversation companions ────────────────────────────────────────────
export { default as instanceUIStateReducer } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
export { default as instanceClientToolsReducer } from "@/features/agents/redux/execution-system/instance-client-tools/instance-client-tools.slice";
export { default as instanceContextReducer } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
export { default as instanceWorkingDocumentReducer } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
export { default as instanceModelOverridesReducer } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
export { default as instanceVariableValuesReducer } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
export { default as instanceResourcesReducer } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
export { default as instanceUserInputReducer } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
export { default as conversationFocusReducer } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
export { default as activeRequestsReducer } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
export { default as conversationInboxReducer } from "@/features/agents/redux/execution-system/inbox/inbox.slice";
export { activeToolsReducer } from "@/features/agents/redux/execution-system/active-tools/active-tools.slice";
export { default as contextStateReducer } from "@/features/agents/redux/execution-system/context-state/context-state.slice";
export { default as observationalMemoryReducer } from "@/features/agents/redux/execution-system/observational-memory/observational-memory.slice";
export {
  messageActionsReducer,
  messageActionsActions,
} from "@/features/agents/redux/execution-system/message-actions/message-actions.slice";
export { cacheBypassReducer } from "@/features/agents/redux/execution-system/message-crud/cache-bypass.slice";

// ── Catalogs (agent source) ────────────────────────────────────────────────
export { default as agentDefinitionReducer } from "@/features/agents/redux/agent-definition/slice";
export { default as agentShortcutReducer } from "@/features/agents/redux/agent-shortcuts/slice";
export { default as agentShortcutCategoryReducer } from "@/features/agents/redux/agent-shortcut-categories/slice";
export { agentAppReducer } from "@/features/agents/redux/agent-apps/slice";
export { default as agentConsumersReducer } from "@/features/agents/redux/agent-consumers/slice";
export { default as toolsReducer } from "@/features/agents/redux/tools/tools.slice";
export { default as mcpReducer } from "@/features/agents/redux/mcp/mcp.slice";

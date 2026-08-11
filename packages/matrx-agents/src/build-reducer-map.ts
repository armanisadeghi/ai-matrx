/**
 * buildAgentsReducerMap() — returns the full set of reducers the package
 * owns, keyed exactly as the selectors expect.
 *
 * Consumers spread it into their own `combineReducers` call:
 *
 *   const rootReducer = combineReducers({
 *     ...buildAgentsReducerMap(),
 *     // host-app slices below
 *     user: userReducer,
 *     theme: themeReducer,
 *     // ...
 *   });
 *
 * The returned object is stable across calls (no new keys), so this is
 * safe to call once at module scope.
 */

import {
  conversationsReducer,
  messagesReducer,
  observabilityReducer,
  conversationListReducer,
  instanceUIStateReducer,
  instanceClientToolsReducer,
  instanceContextReducer,
  instanceWorkingDocumentReducer,
  instanceModelOverridesReducer,
  instanceVariableValuesReducer,
  instanceResourcesReducer,
  instanceUserInputReducer,
  conversationFocusReducer,
  activeRequestsReducer,
  conversationInboxReducer,
  activeToolsReducer,
  contextStateReducer,
  observationalMemoryReducer,
  messageActionsReducer,
  cacheBypassReducer,
  agentDefinitionReducer,
  agentShortcutReducer,
  agentShortcutCategoryReducer,
  agentAppReducer,
  agentConsumersReducer,
  toolsReducer,
  mcpReducer,
} from "./redux/slices";

export function buildAgentsReducerMap() {
  return {
    // Entity + DB-faithful
    conversations: conversationsReducer,
    messages: messagesReducer,
    observability: observabilityReducer,
    conversationList: conversationListReducer,

    // Per-conversation companions
    instanceUIState: instanceUIStateReducer,
    instanceClientTools: instanceClientToolsReducer,
    instanceContext: instanceContextReducer,
    instanceWorkingDocument: instanceWorkingDocumentReducer,
    instanceModelOverrides: instanceModelOverridesReducer,
    instanceVariableValues: instanceVariableValuesReducer,
    instanceResources: instanceResourcesReducer,
    instanceUserInput: instanceUserInputReducer,
    conversationFocus: conversationFocusReducer,
    activeRequests: activeRequestsReducer,
    conversationInbox: conversationInboxReducer,
    activeTools: activeToolsReducer,
    contextState: contextStateReducer,
    observationalMemory: observationalMemoryReducer,
    messageActions: messageActionsReducer,
    cacheBypass: cacheBypassReducer,

    // Catalogs
    agentDefinition: agentDefinitionReducer,
    agentShortcut: agentShortcutReducer,
    agentShortcutCategory: agentShortcutCategoryReducer,
    agentApp: agentAppReducer,
    agentConsumers: agentConsumersReducer,
    tools: toolsReducer,
    mcp: mcpReducer,
  } as const;
}

/**
 * Type of the reducer map returned by `buildAgentsReducerMap()` — useful
 * for consumers that want to type their root reducer shape explicitly.
 */
export type AgentsReducerMap = ReturnType<typeof buildAgentsReducerMap>;

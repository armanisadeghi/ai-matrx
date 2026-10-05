// packages/chat/src/store/slices.ts
//
// THE CHAT STORE CONTRACT — the slices this package owns, under the SAME top-level keys the
// host store has always mounted them at (PACKAGE-INDEPENDENCE.md §2.2, slice P2). A host that
// brings its own Redux store spreads `chatReducers` into its root reducer; a bare host gets them
// from `createChatStore()`. Keys are never renamed: persisted caches and every app reader of
// `state.messages` etc. depend on them. `chat-slices-mount-under-the-same-keys.test.ts` pins
// the key set and proves the host mounts these exact reducers.
//
// Adding a chat-owned slice: add it HERE (never in the host's root reducer) and to the test's
// expected key list.

import voiceAgentReducer from "../voice-agent/state/voiceAgentSlice";
import agentDefinitionReducer from "../agents/redux/agent-definition/slice";
import { conversationListReducer } from "../agents/redux/conversation-list/conversation-list.slice";
import { conversationHistoryReducer } from "../agents/redux/conversation-history/slice";
import agentShortcutReducer from "../agents/redux/agent-shortcuts/slice";
import agentShortcutCategoryReducer from "../agents/redux/agent-shortcut-categories/slice";
import { surfaceUserStateReducer } from "../surfaces/redux/userStateSlice";
import toolsReducer from "../agents/redux/tools/tools.slice";
import mcpReducer from "../agents/redux/mcp/mcp.slice";
import { default as instanceUIStateReducer } from "../agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { default as instanceClientToolsReducer } from "../agents/redux/execution-system/instance-client-tools/instance-client-tools.slice";
import { default as instanceContextReducer } from "../agents/redux/execution-system/instance-context/instance-context.slice";
import { default as instanceWorkingDocumentReducer } from "../agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import { default as pendingAsksReducer } from "../agents/ui-first-tools/redux/pending-asks.slice";
import { default as conversationInboxReducer } from "../agents/redux/execution-system/inbox/inbox.slice";
import { default as agentListsReducer } from "../agents/ui-first-tools/redux/agent-lists.slice";
import { activeToolsReducer } from "../agents/redux/execution-system/active-tools/active-tools.slice";
import { default as instanceModelOverridesReducer } from "../agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import { default as instanceInputCapabilitiesReducer } from "../agents/redux/execution-system/instance-input-capabilities/instance-input-capabilities.slice";
import { default as instanceVariableValuesReducer } from "../agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { default as instanceResourcesReducer } from "../agents/redux/execution-system/instance-resources/instance-resources.slice";
import { default as instanceUserInputReducer } from "../agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { default as conversationsReducer } from "../agents/redux/execution-system/conversations/conversations.slice";
import chatIncognitoReducer from "../agents/redux/chat/chat-incognito.slice";
import chatRouteReducer from "../agents/redux/chat/chat-route.slice";
import { default as activeRequestsReducer } from "../agents/redux/execution-system/active-requests/active-requests.slice";
import { default as runSetsReducer } from "../agents/redux/execution-system/run-sets/run-sets.slice";
import { default as observabilityReducer } from "../agents/redux/execution-system/observability/observability.slice";
import { default as contextStateReducer } from "../agents/redux/execution-system/context-state/context-state.slice";
import { default as observationalMemoryReducer } from "../agents/redux/execution-system/observational-memory/observational-memory.slice";
import { cacheBypassReducer } from "../agents/redux/execution-system/message-crud/cache-bypass.slice";
import { default as messagesReducer } from "../agents/redux/execution-system/messages/messages.slice";
import { default as conversationFocusReducer } from "../agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import { surfacesReducer } from "../agents/redux/surfaces/surfaces.slice";
import { surfacesCatalogReducer } from "../surfaces/redux/surfacesCatalogSlice";
import { agentSurfaceBindingsReducer } from "../surfaces/redux/agentSurfaceBindingsSlice";
import { surfaceConfigReducer } from "../surfaces/redux/surfaceConfigSlice";
import agentAssistantMarkdownDraftReducer from "../agents/redux/agent-assistant-markdown-draft.slice";
import proposedDirectivesReducer from "../agents/redux/proposed-directives/proposedDirectivesSlice";
import agentSettingsReducer from "../agents/redux/agent-settings/agentSettingsSlice";
import conversationAttachmentsReducer from "../agents/connectors/attachments.slice";
import { chatHostReducer } from "./chat-host.slice";

export const chatReducers = {
  voiceAgent: voiceAgentReducer,
  agentDefinition: agentDefinitionReducer,
  conversationList: conversationListReducer,
  conversationHistory: conversationHistoryReducer,
  agentShortcut: agentShortcutReducer,
  agentShortcutCategory: agentShortcutCategoryReducer,
  surfaceUserState: surfaceUserStateReducer,
  tools: toolsReducer,
  conversations: conversationsReducer,
  chatIncognito: chatIncognitoReducer,
  chatRoute: chatRouteReducer,
  instanceModelOverrides: instanceModelOverridesReducer,
  instanceInputCapabilities: instanceInputCapabilitiesReducer,
  instanceVariableValues: instanceVariableValuesReducer,
  instanceResources: instanceResourcesReducer,
  instanceContext: instanceContextReducer,
  instanceWorkingDocument: instanceWorkingDocumentReducer,
  instanceUserInput: instanceUserInputReducer,
  instanceClientTools: instanceClientToolsReducer,
  pendingAsks: pendingAsksReducer,
  conversationInbox: conversationInboxReducer,
  agentLists: agentListsReducer,
  instanceUIState: instanceUIStateReducer,
  activeTools: activeToolsReducer,
  activeRequests: activeRequestsReducer,
  runSets: runSetsReducer,
  messages: messagesReducer,
  observability: observabilityReducer,
  contextState: contextStateReducer,
  observationalMemory: observationalMemoryReducer,
  cacheBypass: cacheBypassReducer,
  conversationFocus: conversationFocusReducer,
  surfaces: surfacesReducer,
  // features/surfaces module — catalog + bindings (unrelated to the
  // navigation registry above, which is misnamed; we'll rename it later).
  surfacesCatalog: surfacesCatalogReducer,
  agentSurfaceBindings: agentSurfaceBindingsReducer,
  surfaceConfig: surfaceConfigReducer,
  agentAssistantMarkdownDraft: agentAssistantMarkdownDraftReducer,
  mcp: mcpReducer,
  // Agent-proposed actions awaiting approval (the `ask` apply policy); package-owned since P17b.
  proposedDirectives: proposedDirectivesReducer,
  // Agent/prompt settings (builder defaults, chat overrides); package-owned since P17.
  agentSettings: agentSettingsReducer,
  // What is attached to each chat (connector picks); package-owned since P17.
  conversationAttachments: conversationAttachmentsReducer,
  // Host state the package reads (identity, active org, server, prefs), synced by <ChatProvider> (P3).
  chatHost: chatHostReducer,
};

export type ChatReducers = typeof chatReducers;
export type ChatSliceKey = keyof ChatReducers;

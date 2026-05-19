// lib/redux/rootReducer.ts
"use client";

// Slim root reducer — entity-free. Used by `makeStore()` in `./store.ts`
// for the ~95% of routes that don't touch the deprecated entity system.
//
// Entity-bound routes (under `app/(legacy)/legacy/*`) use
// `createEntityRootReducer` from `./entity-rootReducer.ts`, which composes
// `slimReducerMap` with the entity slices (`entities`, `entityFields`,
// `globalCache`, `entitySystem`).
//
// See `~/.claude/plans/the-entity-system-which-bubbly-wind.md` for the
// migration that produced this split.

import { combineReducers } from "@reduxjs/toolkit";
import { featureSchemas } from "./dynamic/featureSchema";
import { createFeatureSlice } from "./slices/featureSliceCreator";
import { createModuleSlice } from "./slices/moduleSliceCreator";
import { moduleSchemas, ModuleName } from "./dynamic/moduleSchema";
import layoutReducer from "./slices/layoutSlice";
// Phase 4: legacy `userSlice` replaced by userAuth + userProfile (decisions D1).
// userAuth is volatile (auth secrets MUST NOT persist).
// userProfile uses boot-critical preset (userMetadata persists for first paint).
import userAuthReducer from "./slices/userAuthSlice";
import userProfileReducer from "./slices/userProfileSlice";

import userPreferencesReducer from "./slices/userPreferencesSlice";
import flashcardChatReducer from "./slices/flashcardChatSlice";
import adminDebugReducer from "./slices/adminDebugSlice";
import themeReducer from "@/styles/themes/themeSlice";
import uiReducer from "./ui/uiSlice";

import socketConnectionReducer from "./socket-io/slices/socketConnectionsSlice";
import socketResponseReducer from "./socket-io/slices/socketResponseSlice";
import socketTasksReducer from "./socket-io/slices/socketTasksSlice";
import { componentDefinitionsSlice } from "./app-runner/slices/componentDefinitionsSlice";
import { appBuilderSlice } from "./app-builder/slices/appBuilderSlice";
import { appletBuilderSlice } from "./app-builder/slices/appletBuilderSlice";
import { containerBuilderSlice } from "./app-builder/slices/containerBuilderSlice";
import { fieldBuilderSlice } from "./app-builder/slices/fieldBuilderSlice";
import customAppRuntimeSlice from "./app-runner/slices/customAppRuntimeSlice";
import customAppletRuntimeSlice from "./app-runner/slices/customAppletRuntimeSlice";

import brokerSlice from "./brokerSlice/slice";
import overlaySlice from "./slices/overlaySlice";
import overlayDataReducer from "./slices/overlayDataSlice";
import voicePadReducer from "./slices/voicePadSlice";
import windowManagerReducer from "./slices/windowManagerSlice";
import dbFunctionNodeSlice from "./workflows/db-function-node/dbFunctionNodeSlice";
import workflowSlice from "./workflow/slice";
import workflowNodeSlice from "./workflow-nodes/slice";
import canvasReducer from "@/features/canvas/redux/canvasSlice";
import textDiffReducer from "./slices/textDiffSlice";
import noteVersionsReducer from "./slices/noteVersionsSlice";
import notesReducer from "@/features/notes/redux/slice";
import schedulingTasksReducer from "@/features/scheduling/redux/tasks/slice";
import schedulingRunsReducer from "@/features/scheduling/redux/runs/slice";
import pageExtractionReducer from "@/features/page-extraction/redux/pageExtractionSlice";
import { pdfStudioReducer } from "@/features/pdf-extractor/state/pdfStudioSlice";
import transcriptStudioReducer from "@/features/transcript-studio/redux/slice";
import recordingsReducer from "@/lib/redux/slices/recordingsSlice";
import { codeFilesReducer } from "@/features/code-files/redux/slice";
import codeWorkspaceReducer from "@/features/code/redux/codeWorkspaceSlice";
import codeTabsReducer from "@/features/code/redux/tabsSlice";
import codeTerminalReducer from "@/features/code/redux/terminalSlice";
import terminalSessionsReducer from "@/features/code/redux/terminalSessionsSlice";
import codeDiagnosticsReducer from "@/features/code/redux/diagnosticsSlice";
import codePatchesReducer from "@/features/code/redux/codePatchesSlice";
import codeEditHistoryReducer from "@/features/code/redux/codeEditHistorySlice";
import fsChangesReducer from "@/features/code/redux/fsChangesSlice";
import { cloudFilesReducer } from "@/features/files";
import messagingReducer from "@/features/messaging/redux/messagingSlice";
import smsReducer from "@/features/sms/redux/smsSlice";
import adminPreferencesReducer from "./slices/adminPreferencesSlice";
import apiConfigReducer from "./slices/apiConfigSlice";
import urlSyncReducer from "./slices/urlSyncSlice";

import agentCacheReducer from "./slices/agentCacheSlice";
import agentDefinitionReducer from "@/features/agents/redux/agent-definition/slice";
import agentComparisonReducer from "@/features/agent-comparison/redux/battleSlice";
import agentComparisonSettingsReducer from "@/features/agent-comparison/modes/settings/redux/slice";
import agentComparisonSystemPromptReducer from "@/features/agent-comparison/modes/system-prompt/redux/slice";
import agentComparisonToolsReducer from "@/features/agent-comparison/modes/tools/redux/slice";
import agentComparisonRequestModReducer from "@/features/agent-comparison/modes/request-mod/redux/slice";
import agentComparisonModelReducer from "@/features/agent-comparison/modes/model/redux/slice";
import agentComparisonTuningReducer from "@/features/agent-comparison/modes/tuning/redux/slice";
import { conversationListReducer } from "@/features/agents/redux/conversation-list/conversation-list.slice";
import { conversationHistoryReducer } from "@/features/agents/redux/conversation-history/slice";
import agentShortcutReducer from "@/features/agents/redux/agent-shortcuts/slice";
import agentShortcutCategoryReducer from "@/features/agents/redux/agent-shortcut-categories/slice";
import agentContentBlockReducer from "@/features/agents/redux/agent-content-blocks/slice";
import { sklReducer } from "@/features/agent-connections/redux/skl/slice";
import { agentConnectionsUiReducer } from "@/features/agent-connections/redux/ui/slice";
import { agentAppReducer } from "@/features/agents/redux/agent-apps/slice";
import agentAppConsumersReducer from "@/features/agent-apps/redux/agent-app-consumers/slice";
import agentConsumersReducer from "@/features/agents/redux/agent-consumers/slice";
import toolsReducer from "@/features/agents/redux/tools/tools.slice";

import promptCacheReducer from "./slices/promptCacheSlice";
import promptConsumersReducer from "./slices/promptConsumersSlice";
import contextMenuCacheReducer from "./slices/contextMenuCacheSlice";
import agentContextMenuCacheReducer from "./slices/agentContextMenuCacheSlice";
import promptRunnerReducer from "./slices/promptRunnerSlice";
import promptExecutionReducer from "./prompt-execution/slice";
import actionCacheReducer from "./prompt-execution/actionCacheSlice";
import scopeTypesReducer from "@/features/agent-context/redux/scope/scopeTypesSlice";
import scopesReducer from "@/features/agent-context/redux/scope/scopesSlice";
import scopeAssignmentsReducer from "@/features/agent-context/redux/scope/scopeAssignmentsSlice";
import scopeContextReducer from "@/features/agent-context/redux/scope/scopeContextSlice";
import contextItemsReducer from "@/features/scope-system/redux/contextItemsSlice";
import scopeValuesReducer from "@/features/scope-system/redux/scopeValuesSlice";
import templatesReducer from "@/features/scope-system/redux/templatesSlice";
import promptEditorReducer from "./slices/promptEditorSlice";
import modelRegistryReducer from "../../features/ai-models/redux/modelRegistrySlice";
import { messageActionsReducer } from "@/features/agents/redux/execution-system/message-actions/message-actions.slice";
import agentSettingsReducer from "./slices/agent-settings/agentSettingsSlice";

import artifactsReducer from "./slices/artifactsSlice";
import htmlPagesReducer from "./slices/htmlPagesSlice";

import mcpReducer from "@/features/agents/redux/mcp/mcp.slice";
import appContextReducer from "@/lib/redux/slices/appContextSlice";

// ─── New scopes module (features/scopes) ────────────────────────────
// Mounted alongside the legacy scope slices until Phase 5 deletes them.
// New code reads from these three keys exclusively. Legacy keys
// (scopes, scopeTypes, scopeAssignments, scopeContext, contextItems,
// scopeValues, templates) stay live for now so old consumers keep
// rendering — they are slated for deletion in Phase 5.
import scopesTreeReducer from "@/features/scopes/redux/scopesSlice";
import contextValuesReducer from "@/features/scopes/redux/contextValuesSlice";
import scopeTemplatesReducer from "@/features/scopes/redux/templatesSlice";

import hierarchyReducer from "@/features/agent-context/redux/hierarchySlice";
import organizationsReducer from "@/features/agent-context/redux/organizationsSlice";
import projectsReducer from "@/features/agent-context/redux/projectsSlice";
import tasksReducer from "@/features/agent-context/redux/tasksSlice";
import taskUiReducer from "@/features/tasks/redux/taskUiSlice";
import quickTasksWindowReducer from "@/features/tasks/redux/quickTasksWindowSlice";
import taskAssociationsReducer from "@/features/tasks/redux/taskAssociationsSlice";

import { default as instanceUIStateReducer } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { default as instanceClientToolsReducer } from "@/features/agents/redux/execution-system/instance-client-tools/instance-client-tools.slice";
import { default as instanceContextReducer } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { editorStateReducer } from "@/features/code-editor/redux/editor-state.slice";
import { activeToolsReducer } from "@/features/agents/redux/execution-system/active-tools/active-tools.slice";
import { default as instanceModelOverridesReducer } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import { default as instanceVariableValuesReducer } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { default as instanceResourcesReducer } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import { default as instanceUserInputReducer } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { default as conversationsReducer } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { default as activeRequestsReducer } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { default as observabilityReducer } from "@/features/agents/redux/execution-system/observability/observability.slice";
import { default as contextStateReducer } from "@/features/agents/redux/execution-system/context-state/context-state.slice";
import { default as observationalMemoryReducer } from "@/features/agents/redux/execution-system/observational-memory/observational-memory.slice";
import { cacheBypassReducer } from "@/features/agents/redux/execution-system/message-crud/cache-bypass.slice";
import { default as messagesReducer } from "@/features/agents/redux/execution-system/messages/messages.slice";
import { default as conversationFocusReducer } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import { surfacesReducer } from "@/features/agents/redux/surfaces/surfaces.slice";
import { surfacesCatalogReducer } from "@/features/surfaces/redux/surfacesCatalogSlice";
import { agentSurfaceBindingsReducer } from "@/features/surfaces/redux/agentSurfaceBindingsSlice";
import agentAssistantMarkdownDraftReducer from "@/features/agents/redux/agent-assistant-markdown-draft.slice";
import { default as netRequestsReducer } from "@/lib/redux/net/netRequestsSlice";
import { default as netHealthReducer } from "@/lib/redux/net/netHealthSlice";

const featureReducers = Object.keys(featureSchemas).reduce(
  (acc, featureName) => {
    const featureSchema =
      featureSchemas[featureName as keyof typeof featureSchemas];
    const featureSlice = createFeatureSlice(featureName as any, featureSchema);
    acc[featureName] = featureSlice.reducer;
    return acc;
  },
  {} as Record<string, any>,
);

const moduleReducers = Object.keys(moduleSchemas).reduce(
  (acc, moduleName) => {
    const moduleSchema =
      moduleSchemas[moduleName as keyof typeof moduleSchemas];
    const moduleSlice = createModuleSlice(
      moduleName as ModuleName,
      moduleSchema,
    );
    acc[moduleName] = moduleSlice.reducer;
    return acc;
  },
  {} as Record<string, any>,
);

/**
 * Slice map for the slim store. Every key here is a non-entity slice — safe
 * to mount on routes that don't import the entity system.
 *
 * `createEntityRootReducer` (in ./entity-rootReducer.ts) spreads this map and
 * appends the entity-only keys (`entities`, `entityFields`, `globalCache`,
 * `entitySystem`).
 */
export const slimReducerMap = {
  userAuth: userAuthReducer,
  userProfile: userProfileReducer,
  userPreferences: userPreferencesReducer,

  adminDebug: adminDebugReducer,
  overlays: overlaySlice,
  overlayData: overlayDataReducer,
  voicePad: voicePadReducer,
  windowManager: windowManagerReducer,
  urlSync: urlSyncReducer,

  // Canvas and Artifacts system ----------
  canvas: canvasReducer,
  // Artifact tracking — universal registry for all AI-generated content
  artifacts: artifactsReducer,
  // HTML pages — editor session state + page catalog
  htmlPages: htmlPagesReducer,

  // Text diff system
  textDiff: textDiffReducer,
  noteVersions: noteVersionsReducer,
  notes: notesReducer,
  transcriptStudio: transcriptStudioReducer,
  recordings: recordingsReducer,
  codeFiles: codeFilesReducer,

  // New VSCode-style workspace (features/code) ----------------------------
  codeWorkspace: codeWorkspaceReducer,
  codeTabs: codeTabsReducer,
  codeTerminal: codeTerminalReducer,
  terminalSessions: terminalSessionsReducer,
  codeDiagnostics: codeDiagnosticsReducer,
  codePatches: codePatchesReducer,
  codeEditHistory: codeEditHistoryReducer,
  fsChanges: fsChangesReducer,
  // New cloud-files system (migration from Supabase Storage buckets).
  cloudFiles: cloudFilesReducer,
  // SMS integration
  sms: smsReducer,

  theme: themeReducer,

  ...featureReducers,
  ...moduleReducers,
  layout: layoutReducer,
  flashcardChat: flashcardChatReducer,
  ui: uiReducer,

  // ===== LEGACY CX CHAT SLICES — UNMOUNTED =====
  // `activeChat`, `chatConversations`, `cxConversations`, `agentConversations`
  // were removed from the store during the Redux unification.
  messageActions: messageActionsReducer,

  // ===== OLD SOCKET.IO SYSTEM (DEPRECATED) ====
  socketConnections: socketConnectionReducer,
  socketResponse: socketResponseReducer,
  socketTasks: socketTasksReducer,

  // ==== OLD APPLET SYSTEM (DEPRECATED) ====
  componentDefinitions: componentDefinitionsSlice.reducer,
  appBuilder: appBuilderSlice.reducer,
  appletBuilder: appletBuilderSlice.reducer,
  containerBuilder: containerBuilderSlice.reducer,
  fieldBuilder: fieldBuilderSlice.reducer,
  customAppRuntime: customAppRuntimeSlice,
  customAppletRuntime: customAppletRuntimeSlice,
  broker: brokerSlice,

  // OLD PROMPT SYSTEM (DEPRECATED)
  contextMenuCache: contextMenuCacheReducer,
  agentContextMenuCache: agentContextMenuCacheReducer,
  agentCache: agentCacheReducer,
  promptCache: promptCacheReducer,
  promptConsumers: promptConsumersReducer,
  promptRunner: promptRunnerReducer,
  promptExecution: promptExecutionReducer,
  actionCache: actionCacheReducer,

  dbFunctionNode: dbFunctionNodeSlice,

  workflows: workflowSlice,
  workflowNodes: workflowNodeSlice,

  promptEditor: promptEditorReducer,

  messaging: messagingReducer,

  adminPreferences: adminPreferencesReducer,

  agentSettings: agentSettingsReducer,

  modelRegistry: modelRegistryReducer,

  apiConfig: apiConfigReducer,

  // NEW AGENTS SYSTEM =======================================================
  agentDefinition: agentDefinitionReducer,
  conversationList: conversationListReducer,
  conversationHistory: conversationHistoryReducer,
  agentShortcut: agentShortcutReducer,
  agentShortcutCategory: agentShortcutCategoryReducer,
  agentContentBlock: agentContentBlockReducer,
  skl: sklReducer,
  agentConnectionsUi: agentConnectionsUiReducer,
  agentApp: agentAppReducer,
  agentAppConsumers: agentAppConsumersReducer,
  agentConsumers: agentConsumersReducer,
  tools: toolsReducer,

  appContext: appContextReducer,

  // ─── features/scopes (new module) ──────────────────────────────────
  // Phase 5 will delete the legacy `scopes`, `scopeTypes`, `scopeAssignments`,
  // `scopeContext`, `contextItems`, `scopeValues`, and `templates` keys below
  // and the new `scopesTree` can be renamed to `scopes` at that point.
  scopesTree: scopesTreeReducer,
  contextValues: contextValuesReducer,
  scopeTemplates: scopeTemplatesReducer,

  hierarchy: hierarchyReducer,

  organizations: organizationsReducer,
  projects: projectsReducer,
  tasks: tasksReducer,

  scopeTypes: scopeTypesReducer,
  scopes: scopesReducer,
  scopeAssignments: scopeAssignmentsReducer,
  scopeContext: scopeContextReducer,
  contextItems: contextItemsReducer,
  scopeValues: scopeValuesReducer,
  templates: templatesReducer,

  tasksUi: taskUiReducer,
  quickTasksWindow: quickTasksWindowReducer,
  taskAssociations: taskAssociationsReducer,

  conversations: conversationsReducer,
  instanceModelOverrides: instanceModelOverridesReducer,
  instanceVariableValues: instanceVariableValuesReducer,
  instanceResources: instanceResourcesReducer,
  instanceContext: instanceContextReducer,
  instanceUserInput: instanceUserInputReducer,
  instanceClientTools: instanceClientToolsReducer,
  instanceUIState: instanceUIStateReducer,
  editorState: editorStateReducer,
  activeTools: activeToolsReducer,

  activeRequests: activeRequestsReducer,
  netRequests: netRequestsReducer,
  netHealth: netHealthReducer,
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
  agentAssistantMarkdownDraft: agentAssistantMarkdownDraftReducer,

  mcp: mcpReducer,

  schedulingTasks: schedulingTasksReducer,
  schedulingRuns: schedulingRunsReducer,

  pageExtraction: pageExtractionReducer,
  pdfStudio: pdfStudioReducer,

  agentComparison: agentComparisonReducer,
  agentComparisonSettings: agentComparisonSettingsReducer,
  agentComparisonSystemPrompt: agentComparisonSystemPromptReducer,
  agentComparisonTools: agentComparisonToolsReducer,
  agentComparisonRequestMod: agentComparisonRequestModReducer,
  agentComparisonModel: agentComparisonModelReducer,
  agentComparisonTuning: agentComparisonTuningReducer,
};

export const createSlimRootReducer = () => combineReducers(slimReducerMap);

/**
 * Derive RootState from the root reducer directly so that slice files and
 * thunks can import it from here instead of from store.ts, avoiding the
 * store → rootReducer → slice → store circular dependency.
 *
 * This type is structurally identical to `ReturnType<AppStore["getState"]>`
 * in store.ts — both are driven by the same slimReducerMap.
 */
export type RootState = ReturnType<ReturnType<typeof createSlimRootReducer>>;

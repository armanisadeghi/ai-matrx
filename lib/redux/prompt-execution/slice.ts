/**
 * Prompt Execution Slice
 * 
 * Central Redux slice managing ALL prompt execution instances.
 * 
 * ARCHITECTURE:
 * - instances: Stable core data (identity, config, messages, execution tracking)
 * - currentInputs: Isolated map for user typing (high-frequency updates)
 * - resources: Isolated map for attachments
 * - uiState: Isolated map for UI controls
 * 
 * This separation eliminates re-renders when:
 * - User types in input field (only currentInputs changes)
 * - User toggles UI controls (only uiState changes)
 * - User adds/removes attachments (only resources changes)
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type {
  PromptExecutionState,
  ExecutionInstance,
  ExecutionStatus,
  ConversationMessage,
  UpdateVariablePayload,
  SetCurrentInputPayload,
  InstanceUIState,
} from './types';
import type { Resource } from '@/features/agents/resources/types';
import type {
  DynamicContextState,
  DynamicContextsMap,
  InitializeDynamicContextPayload,
  UpdateDynamicContextPayload,
  SetDynamicContextsPayload,
  RemoveDynamicContextPayload,
  ClearDynamicContextsPayload,
} from './types/dynamic-context';

// ========== EMPTY STABLE REFERENCES ==========
// Used by selectors to return stable references for missing data
// EXPORTED so hooks can use them instead of creating new references
// Note: These are frozen at runtime but typed as mutable for compatibility
export const EMPTY_ARRAY: any[] = [];
export const EMPTY_MESSAGES: ConversationMessage[] = [];
export const EMPTY_OBJECT: Record<string, any> = {};
export const DEFAULT_UI_STATE: InstanceUIState = {
  expandedVariable: null,
  showVariables: false,
  isCreator: undefined,
  showCreatorDebug: false,
  showSystemMessage: false,
  showTemplateMessages: false,
};

const initialState: PromptExecutionState = {
  instances: {},
  currentInputs: {},
  resources: {},
  uiState: {},
  dynamicContexts: {},
  runsByPromptId: {},
  scopedVariables: {
    user: null,
    org: null,
    project: null,
    fetchedAt: null,
    status: 'idle',
  },
};

const promptExecutionSlice = createSlice({
  name: 'promptExecution',
  initialState,
  reducers: {
    // ========== INSTANCE MANAGEMENT ==========

    /**
     * Create a new execution instance (run)
     */
    createInstance: (state, action: PayloadAction<ExecutionInstance>) => {
      const instance = action.payload;
      state.instances[instance.runId] = instance;

      // Initialize isolated state maps
      state.currentInputs[instance.runId] = '';
      state.resources[instance.runId] = [];
      state.dynamicContexts[instance.runId] = {};
      state.uiState[instance.runId] = {
        expandedVariable: null,
        showVariables: instance.executionConfig.show_variables ?? false,
        isCreator: true, // Default to true for now, will be determined later
        showCreatorDebug: false,
        showSystemMessage: false,
        showTemplateMessages: false,
      };

      // Update lookup maps
      if (!state.runsByPromptId[instance.promptId]) {
        state.runsByPromptId[instance.promptId] = [];
      }
      state.runsByPromptId[instance.promptId].push(instance.runId);
    },

    /**
     * Remove an instance (cleanup)
     */
    removeInstance: (state, action: PayloadAction<{ runId: string }>) => {
      const { runId } = action.payload;
      const instance = state.instances[runId];

      if (instance) {
        // Remove from lookup maps
        const promptRuns = state.runsByPromptId[instance.promptId];
        if (promptRuns) {
          state.runsByPromptId[instance.promptId] =
            promptRuns.filter(id => id !== runId);
        }

        // Remove instance and isolated state
        delete state.instances[runId];
        delete state.currentInputs[runId];
        delete state.resources[runId];
        delete state.dynamicContexts[runId];
        delete state.uiState[runId];
      }
    },

    /**
     * Update instance status
     */
    setInstanceStatus: (
      state,
      action: PayloadAction<{ runId: string; status: ExecutionStatus; error?: string }>
    ) => {
      const { runId, status, error } = action.payload;
      const instance = state.instances[runId];

      if (instance) {
        instance.status = status;
        instance.error = error || null;
        // Note: updatedAt is NOT changed here - only on execution completion
      }
    },

    // ========== CURRENT INPUT (ISOLATED) ==========

    /**
     * Set current input (user typing) - ISOLATED from instance
     */
    setCurrentInput: (state, action: PayloadAction<SetCurrentInputPayload>) => {
      const { runId, input } = action.payload;
      // Only update if instance exists
      if (state.instances[runId]) {
        state.currentInputs[runId] = input;
      }
    },

    /**
     * Clear current input
     */
    clearCurrentInput: (state, action: PayloadAction<{ runId: string }>) => {
      const { runId } = action.payload;
      if (state.instances[runId]) {
        state.currentInputs[runId] = '';
      }
    },

    // ========== RESOURCES (ISOLATED) ==========

    /**
     * Set resources for an instance
     */
    setResources: (
      state,
      action: PayloadAction<{ runId: string; resources: Resource[] }>
    ) => {
      const { runId, resources } = action.payload;
      if (state.instances[runId]) {
        state.resources[runId] = resources;
      }
    },

    /**
     * Add a resource
     */
    addResource: (
      state,
      action: PayloadAction<{ runId: string; resource: Resource }>
    ) => {
      const { runId, resource } = action.payload;
      if (state.instances[runId]) {
        if (!state.resources[runId]) {
          state.resources[runId] = [];
        }
        state.resources[runId].push(resource);
      }
    },

    /**
     * Remove a resource by index
     */
    removeResource: (
      state,
      action: PayloadAction<{ runId: string; index: number }>
    ) => {
      const { runId, index } = action.payload;
      if (state.resources[runId]) {
        state.resources[runId].splice(index, 1);
      }
    },

    /**
     * Clear all resources
     */
    clearResources: (state, action: PayloadAction<{ runId: string }>) => {
      const { runId } = action.payload;
      if (state.instances[runId]) {
        state.resources[runId] = [];
      }
    },

    // ========== DYNAMIC CONTEXTS (ISOLATED) ==========

    /**
     * Initialize a new dynamic context
     */
    initializeDynamicContext: (
      state,
      action: PayloadAction<InitializeDynamicContextPayload>
    ) => {
      const { runId, contextId, content, metadata } = action.payload;
      
      if (state.instances[runId]) {
        if (!state.dynamicContexts[runId]) {
          state.dynamicContexts[runId] = {};
        }

        const now = new Date().toISOString();
        const contextState: DynamicContextState = {
          contextId,
          currentVersion: 1,
          currentContent: content,
          versions: [
            {
              version: 1,
              content,
              timestamp: now,
            },
          ],
          metadata,
          createdAt: now,
          updatedAt: now,
        };

        state.dynamicContexts[runId][contextId] = contextState;
      }
    },

    /**
     * Update a dynamic context with a new version
     */
    updateDynamicContext: (
      state,
      action: PayloadAction<UpdateDynamicContextPayload>
    ) => {
      const { runId, contextId, content, summary } = action.payload;
      
      const context = state.dynamicContexts[runId]?.[contextId];
      if (context) {
        const newVersion = context.currentVersion + 1;
        const now = new Date().toISOString();

        context.currentVersion = newVersion;
        context.currentContent = content;
        context.updatedAt = now;
        
        context.versions.push({
          version: newVersion,
          content,
          timestamp: now,
          changesSummary: summary,
        });
      }
    },

    /**
     * Set all dynamic contexts for a run (bulk operation, e.g., from DB)
     */
    setDynamicContexts: (
      state,
      action: PayloadAction<SetDynamicContextsPayload>
    ) => {
      const { runId, contexts } = action.payload;
      
      if (state.instances[runId]) {
        state.dynamicContexts[runId] = contexts;
      }
    },

    /**
     * Remove a dynamic context
     */
    removeDynamicContext: (
      state,
      action: PayloadAction<RemoveDynamicContextPayload>
    ) => {
      const { runId, contextId } = action.payload;
      
      if (state.dynamicContexts[runId]) {
        delete state.dynamicContexts[runId][contextId];
      }
    },

    /**
     * Clear all dynamic contexts for a run
     */
    clearDynamicContexts: (
      state,
      action: PayloadAction<ClearDynamicContextsPayload>
    ) => {
      const { runId } = action.payload;
      
      if (state.instances[runId]) {
        state.dynamicContexts[runId] = {};
      }
    },

    // ========== UI STATE (ISOLATED) ==========

    /**
     * Set expanded variable
     */
    setExpandedVariable: (
      state,
      action: PayloadAction<{ runId: string; variableName: string | null }>
    ) => {
      const { runId, variableName } = action.payload;
      if (state.uiState[runId]) {
        state.uiState[runId].expandedVariable = variableName;
      }
    },

    /**
     * Toggle show variables
     */
    toggleShowVariables: (state, action: PayloadAction<{ runId: string }>) => {
      const { runId } = action.payload;
      if (state.uiState[runId]) {
        state.uiState[runId].showVariables = !state.uiState[runId].showVariables;
      }
    },

    /**
     * Set show variables explicitly
     */
    setShowVariables: (
      state,
      action: PayloadAction<{ runId: string; show: boolean }>
    ) => {
      const { runId, show } = action.payload;
      if (state.uiState[runId]) {
        state.uiState[runId].showVariables = show;
      }
    },

    /**
     * Set creator debug mode
     */
    setCreatorDebug: (
      state,
      action: PayloadAction<{ runId: string; enabled: boolean }>
    ) => {
      const { runId, enabled } = action.payload;
      if (state.uiState[runId]) {
        state.uiState[runId].showCreatorDebug = enabled;
      }
    },

    /**
     * Set show system message
     */
    setShowSystemMessage: (
      state,
      action: PayloadAction<{ runId: string; show: boolean }>
    ) => {
      const { runId, show } = action.payload;
      if (state.uiState[runId]) {
        state.uiState[runId].showSystemMessage = show;
      }
    },

    /**
     * Set show template messages
     */
    setShowTemplateMessages: (
      state,
      action: PayloadAction<{ runId: string; show: boolean }>
    ) => {
      const { runId, show } = action.payload;
      if (state.uiState[runId]) {
        state.uiState[runId].showTemplateMessages = show;
      }
    },

    // ========== VARIABLE MANAGEMENT ==========

    /**
     * Update a single variable value
     */
    updateVariable: (state, action: PayloadAction<UpdateVariablePayload>) => {
      const { runId, variableName, value } = action.payload;
      const instance = state.instances[runId];

      if (instance) {
        instance.variables.userValues[variableName] = value;
        // Note: updatedAt is NOT changed - variables are not "execution"
      }
    },

    /**
     * Update multiple variables at once
     */
    updateVariables: (
      state,
      action: PayloadAction<{ runId: string; variables: Record<string, string> }>
    ) => {
      const { runId, variables } = action.payload;
      const instance = state.instances[runId];

      if (instance) {
        instance.variables.userValues = {
          ...instance.variables.userValues,
          ...variables,
        };
      }
    },

    /**
     * Set computed variables (runtime values)
     */
    setComputedVariables: (
      state,
      action: PayloadAction<{ runId: string; variables: Record<string, string> }>
    ) => {
      const { runId, variables } = action.payload;
      const instance = state.instances[runId];

      if (instance) {
        instance.variables.computedValues = variables;
      }
    },

    // ========== MESSAGE MANAGEMENT ==========

    /**
     * Add a message to conversation history
     * This DOES update updatedAt since it's part of execution
     */
    addMessage: (
      state,
      action: PayloadAction<{ runId: string; message: ConversationMessage }>
    ) => {
      const { runId, message } = action.payload;
      const instance = state.instances[runId];

      if (instance) {
        instance.messages.push(message);
        instance.updatedAt = Date.now();
      }
    },

    /**
     * Clear all messages (used when replacing templates with processed versions)
     */
    clearMessages: (state, action: PayloadAction<{ runId: string }>) => {
      const { runId } = action.payload;
      const instance = state.instances[runId];

      if (instance) {
        instance.messages = [];
      }
    },

    /**
     * Set the variable replacement flag (used after first execution)
     */
    setRequiresVariableReplacement: (
      state,
      action: PayloadAction<{ runId: string; value: boolean }>
    ) => {
      const { runId, value } = action.payload;
      const instance = state.instances[runId];

      if (instance) {
        instance.requiresVariableReplacement = value;
      }
    },

    /**
     * Clear conversation (reset messages)
     */
    clearConversation: (state, action: PayloadAction<{ runId: string }>) => {
      const { runId } = action.payload;
      const instance = state.instances[runId];

      if (instance) {
        instance.messages = [];
        instance.runTracking.runName = null;
        instance.runTracking.savedToDatabase = false;
        // Clear input as well
        state.currentInputs[runId] = '';
      }
    },

    // ========== EXECUTION TRACKING ==========

    /**
     * Start execution (set taskId and start time)
     */
    startExecution: (
      state,
      action: PayloadAction<{ runId: string; taskId: string }>
    ) => {
      const { runId, taskId } = action.payload;
      const instance = state.instances[runId];

      if (instance) {
        instance.execution.currentTaskId = taskId;
        instance.execution.messageStartTime = Date.now();
        instance.execution.timeToFirstToken = undefined;
        instance.status = 'executing';
        // Note: updatedAt not changed - execution hasn't completed yet
      }
    },

    /**
     * Mark streaming started
     */
    startStreaming: (state, action: PayloadAction<{ runId: string }>) => {
      const { runId } = action.payload;
      const instance = state.instances[runId];

      if (instance) {
        instance.status = 'streaming';

        // Record time to first token if not set
        if (
          instance.execution.messageStartTime &&
          instance.execution.timeToFirstToken === undefined
        ) {
          instance.execution.timeToFirstToken =
            Date.now() - instance.execution.messageStartTime;
        }
      }
    },

    /**
     * Complete execution (store final stats)
     * This DOES update updatedAt since execution is complete
     */
    completeExecution: (
      state,
      action: PayloadAction<{
        runId: string;
        stats: {
          timeToFirstToken?: number;
          totalTime?: number;
          tokens?: number;
          cost?: number;
        };
      }>
    ) => {
      const { runId, stats } = action.payload;
      const instance = state.instances[runId];

      if (instance) {
        instance.execution.lastMessageStats = stats;
        instance.execution.currentTaskId = null;
        instance.execution.messageStartTime = null;
        instance.status = 'completed';
        instance.updatedAt = Date.now(); // Only here: execution completed

        // Update run totals
        if (stats.tokens) {
          instance.runTracking.totalTokens += stats.tokens;
        }
        if (stats.cost) {
          instance.runTracking.totalCost += stats.cost;
        }
      }
    },

    // ========== RUN TRACKING ==========

    /**
     * Set run tracking info (when run created in DB)
     */
    setRunId: (
      state,
      action: PayloadAction<{ runId: string; runName: string; savedToDatabase: boolean }>
    ) => {
      const { runId, runName, savedToDatabase } = action.payload;
      const instance = state.instances[runId];

      if (instance) {
        instance.runTracking.runName = runName;
        instance.runTracking.savedToDatabase = savedToDatabase;
      }
    },

    // ========== SCOPED VARIABLES ==========

    /**
     * Set scoped variables status
     */
    setScopedVariablesStatus: (
      state,
      action: PayloadAction<'idle' | 'loading' | 'loaded' | 'error'>
    ) => {
      state.scopedVariables.status = action.payload;
    },

    /**
     * Set scoped variables (from DB)
     */
    setScopedVariables: (
      state,
      action: PayloadAction<{
        user?: Record<string, string>;
        org?: Record<string, string>;
        project?: Record<string, string>;
      }>
    ) => {
      const { user, org, project } = action.payload;

      if (user) state.scopedVariables.user = user;
      if (org) state.scopedVariables.org = org;
      if (project) state.scopedVariables.project = project;

      state.scopedVariables.fetchedAt = Date.now();
      state.scopedVariables.status = 'loaded';
    },

    /**
     * Clear scoped variables (logout)
     */
    clearScopedVariables: (state) => {
      state.scopedVariables = {
        user: null,
        org: null,
        project: null,
        fetchedAt: null,
        status: 'idle',
      };
    },
  },
});

// ========== ACTIONS ==========
export const {
  createInstance,
  removeInstance,
  setInstanceStatus,
  setCurrentInput,
  clearCurrentInput,
  setResources,
  addResource,
  removeResource,
  clearResources,
  initializeDynamicContext,
  updateDynamicContext,
  setDynamicContexts,
  removeDynamicContext,
  clearDynamicContexts,
  setExpandedVariable,
  toggleShowVariables,
  setShowVariables,
  setCreatorDebug,
  setShowSystemMessage,
  setShowTemplateMessages,
  updateVariable,
  updateVariables,
  setComputedVariables,
  addMessage,
  clearMessages,
  setRequiresVariableReplacement,
  clearConversation,
  startExecution,
  startStreaming,
  completeExecution,
  setRunId,
  setScopedVariablesStatus,
  setScopedVariables,
  clearScopedVariables,
} = promptExecutionSlice.actions;

// ========== BASIC SELECTORS ==========
// These return primitives or stable references for null/undefined cases

/**
 * Select instance by runId
 * Returns null if not found (stable reference)
 */
type WithPromptExecution = { promptExecution: PromptExecutionState };

export const selectInstance = (state: WithPromptExecution, runId: string): ExecutionInstance | null =>
  state.promptExecution?.instances[runId] ?? null;

/**
 * Select all instances
 */
export const selectAllInstances = (state: WithPromptExecution) =>
  state.promptExecution?.instances ?? EMPTY_OBJECT;

/**
 * Select instances for a prompt
 */
export const selectInstancesByPromptId = (state: WithPromptExecution, promptId: string) => {
  const runIds = state.promptExecution?.runsByPromptId[promptId] ?? EMPTY_ARRAY;
  return runIds
    .map(id => state.promptExecution.instances[id])
    .filter(Boolean) as ExecutionInstance[];
};

/**
 * Select current input (ISOLATED)
 * Returns empty string if not found (stable primitive)
 */
export const selectCurrentInput = (state: WithPromptExecution, runId: string): string =>
  state.promptExecution?.currentInputs[runId] ?? '';

/**
 * Select resources (ISOLATED)
 * Returns stable empty array if not found
 */
export const selectResources = (state: WithPromptExecution, runId: string): any[] =>
  state.promptExecution?.resources[runId] ?? EMPTY_ARRAY;

/**
 * Select UI state (ISOLATED)
 * Returns stable default if not found
 */
export const selectUIState = (state: WithPromptExecution, runId: string): InstanceUIState =>
  state.promptExecution?.uiState[runId] ?? DEFAULT_UI_STATE;

/**
 * Select messages from instance
 * Returns stable empty array if not found
 */
export const selectMessages = (state: WithPromptExecution, runId: string): ConversationMessage[] =>
  state.promptExecution?.instances[runId]?.messages ?? EMPTY_MESSAGES;

/**
 * Select instance status
 * Returns null if not found (stable primitive)
 */
export const selectInstanceStatus = (state: WithPromptExecution, runId: string): ExecutionStatus | null =>
  state.promptExecution?.instances[runId]?.status ?? null;

/**
 * Select instance error
 */
export const selectInstanceError = (state: WithPromptExecution, runId: string): string | null =>
  state.promptExecution?.instances[runId]?.error ?? null;

/**
 * Select user variables
 * Returns stable empty object if not found
 */
export const selectUserVariables = (state: WithPromptExecution, runId: string): Record<string, string> =>
  state.promptExecution?.instances[runId]?.variables.userValues ?? EMPTY_OBJECT;

/**
 * Select execution tracking
 */
export const selectExecutionTracking = (state: WithPromptExecution, runId: string) =>
  state.promptExecution?.instances[runId]?.execution ?? null;

/**
 * Select run tracking
 */
export const selectRunTracking = (state: WithPromptExecution, runId: string) =>
  state.promptExecution?.instances[runId]?.runTracking ?? null;

/**
 * Select execution config
 */
export const selectExecutionConfig = (state: WithPromptExecution, runId: string) =>
  state.promptExecution?.instances[runId]?.executionConfig ?? null;

/**
 * Select scoped variables
 */
export const selectScopedVariables = (state: WithPromptExecution) =>
  state.promptExecution?.scopedVariables ?? null;

export default promptExecutionSlice.reducer;

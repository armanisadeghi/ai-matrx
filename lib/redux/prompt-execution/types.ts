/**
 * Prompt Execution Engine - Type Definitions
 *
 * ARCHITECTURE NOTES:
 * - ExecutionInstance contains stable data that rarely changes after creation
 * - High-frequency update data (currentInput, resources, uiState) live in separate top-level maps
 * - This separation prevents re-renders when typing in input fields
 */
import { PromptSettings, PromptVariable } from "@/features/prompts/types/core";
import type { Resource } from "@/features/agents/resources/types";
import type { ArchivedContextsMap } from "./types/dynamic-context";

export interface ExecutionConfig {
  auto_run: boolean;
  allow_chat: boolean;
  show_variables: boolean;
  apply_variables: boolean;
  track_in_runs: boolean;
  use_pre_execution_input: boolean; // Show input modal before execution
}

export interface ExecutionVariables {
  // User-provided values (from UI)
  userValues: Record<string, string>;

  // Scoped variables (fetched from DB - user/organizations/project level)
  scopedValues: Record<string, string>;

  // Runtime computed variables (e.g., current_date, user_timezone)
  computedValues: Record<string, string>;
}

export interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
  taskId?: string;
  timestamp: string;
  metadata?: {
    fromTemplate?: boolean; // Marks messages that originated from prompt/builtin templates
    timeToFirstToken?: number;
    totalTime?: number;
    tokens?: number;
    cost?: number;
    /**
     * Archived contexts for non-current messages.
     * Used to track which context versions existed at this point in the conversation
     * without including their full content (for token optimization).
     */
    archivedContexts?: ArchivedContextsMap;
    [key: string]: any;
  };
}

export interface ExecutionTracking {
  currentTaskId: string | null;
  messageStartTime: number | null;
  timeToFirstToken: number | undefined;
  lastMessageStats: {
    timeToFirstToken?: number;
    totalTime?: number;
    tokens?: number;
    cost?: number;
  } | null;
}

export interface RunTracking {
  sourceType: string;
  sourceId: string;
  runName: string | null;
  totalTokens: number;
  totalCost: number;
  savedToDatabase: boolean;
}

export type ExecutionStatus =
  | "idle" // Created but not started
  | "initializing" // Loading prompt/variables
  | "ready" // Ready to execute
  | "executing" // Sending message
  | "streaming" // Receiving response
  | "completed" // Execution finished
  | "error"; // Error occurred

/**
 * Core execution instance (Run)
 *
 * Contains STABLE data that changes infrequently:
 * - Identity and configuration
 * - Message history (only changes during execution)
 * - Execution tracking
 *
 * HIGH-FREQUENCY data lives in separate top-level maps:
 * - currentInputs[runId] - User typing
 * - resources[runId] - Attachments
 * - uiState[runId] - UI controls
 */
export interface ExecutionInstance {
  // ========== Identity ==========
  runId: string;
  promptId: string;
  promptSource: "prompts" | "prompt_builtins";
  promptName: string; // Name of the prompt (from database)

  // ========== Status ==========
  status: ExecutionStatus;
  error: string | null;

  // ========== Timestamps ==========
  /** Set once when instance is created */
  createdAt: number;
  /** Only updated when execution completes (message added to history) */
  updatedAt: number;

  // ========== Configuration ==========
  settings: PromptSettings;
  executionConfig: ExecutionConfig;

  // ========== Variables ==========
  variables: ExecutionVariables;
  variableDefaults: PromptVariable[];

  // ========== Messages ==========
  /** Conversation history - only changes during execution */
  messages: ConversationMessage[];

  // ========== First Execution Flag ==========
  /**
   * If true, indicates templates need variable replacement on first execution.
   * Set to false after first message is processed.
   */
  requiresVariableReplacement: boolean;

  // ========== Execution Tracking ==========
  execution: ExecutionTracking;

  // ========== Run Tracking (DB) ==========
  runTracking: RunTracking;
}

/**
 * UI state for an instance (isolated for performance)
 */
export interface InstanceUIState {
  expandedVariable: string | null;
  showVariables: boolean;

  // Creator/Debug controls
  /**
   * Indicates if the current user is the creator of this prompt.
   * undefined = unknown, true = is creator, false = not creator
   */
  isCreator?: boolean;

  /**
   * When true, shows debug information for creators (system messages, template variables, etc.)
   */
  showCreatorDebug: boolean;

  /**
   * Show system message in conversation (creator option)
   */
  showSystemMessage: boolean;

  /**
   * Show template messages before first submission (creator option)
   */
  showTemplateMessages: boolean;
}

/**
 * Scoped variables fetched from database
 * These are user/organizations/project level variables that auto-populate
 */
export interface ScopedVariables {
  user: Record<string, string> | null;
  org: Record<string, string> | null;
  project: Record<string, string> | null;
  fetchedAt: number | null;
  status: "idle" | "loading" | "loaded" | "error";
}

/**
 * Main slice state
 *
 * ARCHITECTURE:
 * - instances: Stable core data, changes only during execution
 * - currentInputs: Isolated input state, changes on every keystroke
 * - resources: Isolated attachments, changes on user interaction
 * - uiState: Isolated UI controls, changes on user interaction
 * - dynamicContexts: Isolated versioned contexts, changes on context updates
 */
export interface PromptExecutionState {
  // Core instances (stable after creation)
  instances: {
    [runId: string]: ExecutionInstance;
  };

  // High-frequency update maps (isolated from instances)
  currentInputs: {
    [runId: string]: string;
  };

  resources: {
    [runId: string]: Resource[];
  };

  uiState: {
    [runId: string]: InstanceUIState;
  };

  // Dynamic contexts (versioned content that updates during execution)
  dynamicContexts: {
    [runId: string]: {
      [
        contextId: string
      ]: import("./types/dynamic-context").DynamicContextState;
    };
  };

  // Quick lookup maps
  runsByPromptId: {
    [promptId: string]: string[];
  };

  // Scoped variables cache (fetched once per session)
  scopedVariables: ScopedVariables;
}

// ========== Thunk Payloads ==========

export interface StartInstancePayload {
  promptId: string;
  promptSource?: "prompts" | "prompt_builtins";
  executionConfig: ExecutionConfig;
  variables?: Record<string, string>;
  initialMessage?: string;
  runId?: string;
  resources?: Resource[];
  initialContexts?: Array<{
    contextId: string;
    content: string;
    metadata: import("./types/dynamic-context").ContextMetadata;
  }>;
}

export interface ExecuteMessagePayload {
  runId: string;
  userInput?: string;
}

export interface CompleteExecutionPayload {
  runId: string;
}

export interface UpdateVariablePayload {
  runId: string;
  variableName: string;
  value: string;
}

export interface SetCurrentInputPayload {
  runId: string;
  input: string;
}

export interface FetchScopedVariablesPayload {
  userId: string;
  orgId?: string;
  projectId?: string;
  force?: boolean;
}

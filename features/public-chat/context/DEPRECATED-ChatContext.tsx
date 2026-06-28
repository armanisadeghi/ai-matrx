"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useRef,
  useEffect,
  ReactNode,
} from "react";
import type { VariableDefinition as PromptVariable } from "@/features/agents/types/agent-definition.types";
import type { PublicResource, ContentItem } from "../types/content";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";

// ============================================================================
// TYPES
// ============================================================================

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  status: "pending" | "sending" | "streaming" | "complete" | "error";
  /** Resources attached to this message */
  resources?: PublicResource[];
  /** Content items sent to API (for reference) */
  contentItems?: ContentItem[];
  variables?: Record<string, any>;
  /** Whether this is a condensed message (out of context window but still visible) */
  isCondensed?: boolean;
  /** Stream events for block-mode messages — passed to MarkdownStream instead of plain content */
  streamEvents?: TypedStreamEvent[];
}

export interface ChatSettings {
  searchEnabled: boolean;
  thinkEnabled: boolean;
  planEnabled: boolean;
  audioEnabled: boolean;
  enableAskQuestions: boolean;
  toolsEnabled: boolean;
}

export interface AgentConfig {
  promptId: string;
  name: string;
  description?: string;
  variableDefaults?: PromptVariable[];
}

export interface ChatState {
  conversationId: string;
  /** Database conversation ID — set when a cx_conversation row is created */
  dbConversationId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  isExecuting: boolean;
  error: { type: string; message: string } | null;
  currentAgent: AgentConfig | null;
  settings: ChatSettings;
  modelOverride?: string;
  useLocalhost: boolean;
  /** When true, routes to agents-blocks endpoint which emits content_block events */
  isBlockMode: boolean;
}

// ============================================================================
// ACTIONS
// ============================================================================

type ChatAction =
  | { type: "SET_AGENT"; payload: AgentConfig }
  | { type: "ADD_MESSAGE"; payload: ChatMessage }
  | {
      type: "UPDATE_MESSAGE";
      payload: { id: string; updates: Partial<ChatMessage> };
    }
  | { type: "SET_STREAMING"; payload: boolean }
  | { type: "SET_EXECUTING"; payload: boolean }
  | { type: "SET_ERROR"; payload: { type: string; message: string } | null }
  | { type: "UPDATE_SETTINGS"; payload: Partial<ChatSettings> }
  | { type: "SET_MODEL_OVERRIDE"; payload: string | undefined }
  | { type: "CLEAR_MESSAGES" }
  | { type: "START_NEW_CONVERSATION" }
  | { type: "APPEND_TO_LAST_MESSAGE"; payload: string }
  | { type: "SET_USE_LOCALHOST"; payload: boolean }
  | { type: "SET_USE_BLOCK_MODE"; payload: boolean }
  | { type: "SET_DB_CONVERSATION_ID"; payload: string | null }
  | { type: "SET_MESSAGES"; payload: ChatMessage[] }
  | {
      type: "LOAD_CONVERSATION";
      payload: {
        conversationId: string;
        dbConversationId: string;
        messages: ChatMessage[];
      };
    };

// ============================================================================
// INITIAL STATE
// ============================================================================

const defaultSettings: ChatSettings = {
  searchEnabled: false,
  thinkEnabled: false,
  planEnabled: false,
  audioEnabled: false,
  enableAskQuestions: false,
  toolsEnabled: false,
};

const createInitialState = (): ChatState => ({
  conversationId: "",
  dbConversationId: null,
  messages: [],
  isStreaming: false,
  isExecuting: false,
  error: null,
  currentAgent: null,
  settings: defaultSettings,
  modelOverride: undefined,
  useLocalhost: false,
  isBlockMode: false,
});

// ============================================================================
// REDUCER
// ============================================================================

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SET_USE_LOCALHOST":
      return { ...state, useLocalhost: action.payload };

    case "SET_USE_BLOCK_MODE":
      return { ...state, isBlockMode: action.payload };

    case "SET_AGENT":
      return { ...state, currentAgent: action.payload };

    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.payload] };

    case "UPDATE_MESSAGE":
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.payload.id
            ? { ...msg, ...action.payload.updates }
            : msg,
        ),
      };

    case "APPEND_TO_LAST_MESSAGE": {
      const messages = [...state.messages];
      const lastIndex = messages.length - 1;
      if (lastIndex >= 0 && messages[lastIndex].role === "assistant") {
        messages[lastIndex] = {
          ...messages[lastIndex],
          content: messages[lastIndex].content + action.payload,
        };
      }
      return { ...state, messages };
    }

    case "SET_STREAMING":
      return { ...state, isStreaming: action.payload };

    case "SET_EXECUTING":
      return { ...state, isExecuting: action.payload };

    case "SET_ERROR":
      return { ...state, error: action.payload };

    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.payload } };

    case "SET_MODEL_OVERRIDE":
      return { ...state, modelOverride: action.payload };

    case "CLEAR_MESSAGES":
      return { ...state, messages: [] };

    case "START_NEW_CONVERSATION":
      return {
        ...state,
        conversationId: "",
        dbConversationId: null,
        messages: [],
        error: null,
      };

    case "SET_DB_CONVERSATION_ID":
      console.log("[chatReducer] SET_DB_CONVERSATION_ID:", action.payload);
      return { ...state, dbConversationId: action.payload };

    case "SET_MESSAGES":
      return { ...state, messages: action.payload };

    case "LOAD_CONVERSATION":
      return {
        ...state,
        conversationId: action.payload.conversationId,
        dbConversationId: action.payload.dbConversationId,
        messages: action.payload.messages,
        error: null,
      };

    default:
      return state;
  }
}

// ============================================================================
// CONTEXT
// ============================================================================

interface ChatContextValue {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
  /** Ref that always holds the latest dbConversationId — use inside callbacks to avoid stale closures */
  conversationIdRef: React.RefObject<string | null>;
  setAgent: (agent: AgentConfig) => void;
  addMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => string;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  appendToLastMessage: (content: string) => void;
  setStreaming: (streaming: boolean) => void;
  setExecuting: (executing: boolean) => void;
  setError: (error: { type: string; message: string } | null) => void;
  updateSettings: (settings: Partial<ChatSettings>) => void;
  setModelOverride: (model: string | undefined) => void;
  clearMessages: () => void;
  startNewConversation: () => void;
  setUseLocalhost: (useLocalhost: boolean) => void;
  setUseBlockMode: (isBlockMode: boolean) => void;
  setDbConversationId: (id: string | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  loadConversation: (
    conversationId: string,
    dbConversationId: string,
    messages: ChatMessage[],
  ) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

interface ChatProviderProps {
  children: ReactNode;
  initialAgent?: AgentConfig;
}

export function ChatProvider({ children, initialAgent }: ChatProviderProps) {
  const [state, dispatch] = useReducer(chatReducer, undefined, () => {
    const initial = createInitialState();
    if (initialAgent) {
      initial.currentAgent = initialAgent;
    }
    return initial;
  });

  // Ref that always tracks the latest dbConversationId for use in async callbacks.
  // This is the server-assigned conversation ID (null until the first response).
  const conversationIdRef = useRef<string | null>(state.dbConversationId);
  useEffect(() => {
    conversationIdRef.current = state.dbConversationId;
  }, [state.dbConversationId]);

  const setUseLocalhost = (useLocalhost: boolean) => {
    dispatch({ type: "SET_USE_LOCALHOST", payload: useLocalhost });
  };

  const setUseBlockMode = (isBlockMode: boolean) => {
    dispatch({ type: "SET_USE_BLOCK_MODE", payload: isBlockMode });
  };

  const setAgent = (agent: AgentConfig) => {
    dispatch({ type: "SET_AGENT", payload: agent });
  };

  const addMessage = (
    message: Omit<ChatMessage, "id" | "timestamp">,
  ): string => {
    const id = crypto.randomUUID();
    dispatch({
      type: "ADD_MESSAGE",
      payload: { ...message, id, timestamp: new Date() },
    });
    return id;
  };

  const updateMessage = (id: string, updates: Partial<ChatMessage>) => {
    dispatch({ type: "UPDATE_MESSAGE", payload: { id, updates } });
  };

  const appendToLastMessage = (content: string) => {
    dispatch({ type: "APPEND_TO_LAST_MESSAGE", payload: content });
  };

  const setStreaming = (streaming: boolean) => {
    dispatch({ type: "SET_STREAMING", payload: streaming });
  };

  const setExecuting = (executing: boolean) => {
    dispatch({ type: "SET_EXECUTING", payload: executing });
  };

  const setError = (error: { type: string; message: string } | null) => {
    dispatch({ type: "SET_ERROR", payload: error });
  };

  const updateSettings = (settings: Partial<ChatSettings>) => {
    dispatch({ type: "UPDATE_SETTINGS", payload: settings });
  };

  const setModelOverride = (model: string | undefined) => {
    dispatch({ type: "SET_MODEL_OVERRIDE", payload: model });
  };

  const clearMessages = () => {
    dispatch({ type: "CLEAR_MESSAGES" });
  };

  const startNewConversation = () => {
    dispatch({ type: "START_NEW_CONVERSATION" });
  };

  const setDbConversationId = (id: string | null) => {
    dispatch({ type: "SET_DB_CONVERSATION_ID", payload: id });
  };

  const setMessages = (messages: ChatMessage[]) => {
    dispatch({ type: "SET_MESSAGES", payload: messages });
  };

  const loadConversation = (
    conversationId: string,
    dbConversationId: string,
    messages: ChatMessage[],
  ) => {
    dispatch({
      type: "LOAD_CONVERSATION",
      payload: { conversationId, dbConversationId, messages },
    });
  };

  const value: ChatContextValue = {
    state,
    dispatch,
    conversationIdRef,
    setAgent,
    addMessage,
    updateMessage,
    appendToLastMessage,
    setStreaming,
    setExecuting,
    setError,
    updateSettings,
    setModelOverride,
    clearMessages,
    startNewConversation,
    setUseLocalhost,
    setUseBlockMode,
    setDbConversationId,
    setMessages,
    loadConversation,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// ============================================================================
// HOOKS
// ============================================================================

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}

export function useChatState() {
  const { state } = useChatContext();
  return state;
}

export function useChatActions() {
  const {
    setAgent,
    addMessage,
    updateMessage,
    appendToLastMessage,
    setStreaming,
    setExecuting,
    setError,
    updateSettings,
    setModelOverride,
    clearMessages,
    startNewConversation,
    setUseLocalhost,
    setUseBlockMode,
    setDbConversationId,
    setMessages,
  } = useChatContext();

  return {
    setAgent,
    addMessage,
    updateMessage,
    appendToLastMessage,
    setStreaming,
    setExecuting,
    setError,
    updateSettings,
    setModelOverride,
    clearMessages,
    startNewConversation,
    setUseLocalhost,
    setUseBlockMode,
    setDbConversationId,
    setMessages,
  };
}

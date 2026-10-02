// TEMPORARY STUB — delete when cx-chat/cx-conversation refactor lands.
// Replaces removed `@/features/agents/redux/legacy-shims/*` modules with
// typed no-op placeholders so TypeScript compiles. Dispatched actions are
// harmless (no reducer handles them); selectors return empty defaults.

import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import type { Resource } from "@/features/agents/resources/types";

// ────────────────────────────────────────────────────────────────────────────
// Re-export real types where canonical definitions still exist. Using the
// real types prevents TS2741/TS2322 mismatches at component boundaries.
// ────────────────────────────────────────────────────────────────────────────

export type {
  ApiMode,
  ChatModeConfig,
  MessageRole,
  MessageStatus,
  SessionStatus,
  SessionUIState,
  ConversationMessage,
  ConversationResource,
  ConversationSession,
  ChatConversationsState,
  StartSessionPayload,
  AddMessagePayload,
  UpdateMessagePayload,
  AppendStreamChunkPayload,
  PushStreamEventPayload,
  SetConversationIdPayload,
  SetCurrentInputPayload,
  UpdateVariablePayload,
  SetExpandedVariablePayload,
  AddResourcePayload,
  RemoveResourcePayload,
  UpdateUIStatePayload,
  LoadConversationPayload,
} from "./types/conversation";

import type {
  SessionUIState,
  ConversationMessage,
  ConversationResource,
  ConversationSession,
  ApiMode,
  SessionStatus,
} from "./types/conversation";

export interface ActiveChatAgent {
  promptId?: string;
  name?: string;
  description?: string;
  configFetched?: boolean;
  variableDefaults?: VariableDefinition[];
}

// ────────────────────────────────────────────────────────────────────────────
// Reducer (no-op)
// ────────────────────────────────────────────────────────────────────────────

export const chatConversationsReducer = (
  state: { sessions: Record<string, ConversationSession> } = { sessions: {} },
  _action: { type: string; payload?: unknown },
): { sessions: Record<string, ConversationSession> } => state;

// ────────────────────────────────────────────────────────────────────────────
// Action creators — return PayloadAction-shaped objects. No reducer handles
// them; dispatching is a harmless no-op. Payloads are permissive (`unknown`)
// so caller-specific shapes (e.g. extra fields) flow through without TS2353.
// ────────────────────────────────────────────────────────────────────────────

const makeAction =
  <P = unknown>(type: string) =>
  (payload: P) =>
    ({ type: `cx/stub/${type}`, payload }) as { type: string; payload: P };

// `addResource`/`updateVariable` payloads are widened to accept either the
// strict real type or the looser shapes callers actually pass today.
export const chatConversationsActions = {
  startSession: makeAction<unknown>("startSession"),
  removeSession: makeAction<string>("removeSession"),
  clearMessages: makeAction<string>("clearMessages"),
  addMessage: makeAction<unknown>("addMessage"),
  updateMessage: makeAction<unknown>("updateMessage"),
  resetMessageContent: makeAction<{ sessionId?: string; messageId: string }>(
    "resetMessageContent",
  ),
  appendStreamChunk: makeAction<unknown>("appendStreamChunk"),
  pushStreamEvent: makeAction<unknown>("pushStreamEvent"),
  setConversationId: makeAction<unknown>("setConversationId"),
  setCurrentInput: makeAction<{ sessionId: string; input: string }>(
    "setCurrentInput",
  ),
  updateVariable: makeAction<{
    sessionId: string;
    variableName?: string;
    name?: string;
    value: unknown;
  }>("updateVariable"),
  setExpandedVariable: makeAction<unknown>("setExpandedVariable"),
  addResource: makeAction<{
    sessionId: string;
    resource: Resource | ConversationResource;
  }>("addResource"),
  removeResource: makeAction<{ sessionId: string; resourceId: string }>(
    "removeResource",
  ),
  clearResources: makeAction<string>("clearResources"),
  updateUIState: makeAction<{
    sessionId: string;
    updates: Partial<SessionUIState>;
  }>("updateUIState"),
  loadConversation: makeAction<unknown>("loadConversation"),
};

export const activeChatActions = {
  setSelectedAgent: makeAction<ActiveChatAgent>("setSelectedAgent"),
  setModelOverride: makeAction<string>("setModelOverride"),
  setAgentDefaultSettings: makeAction<unknown>("setAgentDefaultSettings"),
};

// ────────────────────────────────────────────────────────────────────────────
// Thunks — async no-ops. Callers do `await dispatch(thunk(args)).unwrap()`,
// `await dispatch(thunk(args))`, or just `dispatch(thunk(args))`.
//
// Returning a Redux-thunk function (`(dispatch, getState) => Promise`) means
// `dispatch(stubThunk(...))` returns the inner promise. We attach an
// `.unwrap()` method to that promise so the RTK call-pattern works too.
// ────────────────────────────────────────────────────────────────────────────

type UnwrappablePromise<T> = Promise<T> & { unwrap: () => Promise<T> };

type StubThunk<A> = (
  args: A,
) => (dispatch: unknown, getState: unknown) => UnwrappablePromise<void>;

const stubThunk =
  <A>(_type: string): StubThunk<A> =>
  (_args: A) =>
  (_dispatch: unknown, _getState: unknown) => {
    const promise = Promise.resolve() as UnwrappablePromise<void>;
    promise.unwrap = () => Promise.resolve();
    return promise;
  };

export const sendMessage = stubThunk<{
  sessionId: string;
  input?: string;
  content?: string;
  resources?: unknown;
  variables?: unknown;
  signal?: AbortSignal;
  [key: string]: unknown;
}>("sendMessage");

export const loadConversationHistory = stubThunk<{
  sessionId: string;
  conversationId: string;
  agentId?: string;
  [key: string]: unknown;
}>("loadConversationHistory");

export const editMessage = stubThunk<{
  sessionId?: string;
  messageId: string;
  contentBlocks?: unknown;
  newContent?: unknown;
  [key: string]: unknown;
}>("editMessage");

// ────────────────────────────────────────────────────────────────────────────
// Selectors — empty defaults with concrete return types so callers don't see
// `unknown`. State typed as `unknown` so the app RootState passes without
// conflict.
// ────────────────────────────────────────────────────────────────────────────

const EMPTY_ARRAY: readonly unknown[] = Object.freeze([]);

const EMPTY_UI: SessionUIState = Object.freeze({
  expandedVariable: null,
  showVariables: false,
  showSystemMessages: false,
  modelOverride: null,
  modelSettings: {},
  useLocalhost: false,
  isBlockMode: false,
  showDebugInfo: false,
}) as SessionUIState;

const EMPTY_SESSION: ConversationSession = Object.freeze({
  sessionId: "",
  conversationId: null,
  agentId: "",
  apiMode: "agent",
  chatModeConfig: null,
  status: "idle",
  error: null,
  variableDefaults: [],
  requiresVariableReplacement: false,
  messages: [],
  toolCallsById: {},
  createdAt: 0,
  updatedAt: 0,
}) as ConversationSession;

export const selectSession = (
  _state: unknown,
  _sessionId?: string,
): ConversationSession => EMPTY_SESSION;

export const selectMessages = (
  _state: unknown,
  _sessionId?: string,
): ConversationMessage[] => EMPTY_ARRAY as ConversationMessage[];

export const selectGroupedMessages = (
  _state: unknown,
  _sessionId?: string,
): ConversationMessage[] => EMPTY_ARRAY as ConversationMessage[];

export const selectResources = (
  _state: unknown,
  _sessionId?: string,
): ConversationResource[] => EMPTY_ARRAY as ConversationResource[];

export const selectUIState = (
  _state: unknown,
  _sessionId?: string,
): SessionUIState => EMPTY_UI;

export const selectIsStreaming = (
  _state: unknown,
  _sessionId?: string,
): boolean => false;

export const selectIsExecuting = (
  _state: unknown,
  _sessionId?: string,
): boolean => false;

export const selectSessionStatus = (
  _state: unknown,
  _sessionId?: string,
): SessionStatus => "idle";

export const selectSessionError = (
  _state: unknown,
  _sessionId?: string,
): string | null => null;

export const selectConversationId = (
  _state: unknown,
  _sessionId?: string,
): string | null => null;

export const selectCurrentInput = (
  _state: unknown,
  _sessionId?: string,
): string => "";

export const selectVariableDefaults = (
  _state: unknown,
  _sessionId?: string,
): VariableDefinition[] => EMPTY_ARRAY as VariableDefinition[];

export const selectApiMode = (
  _state: unknown,
  _sessionId?: string,
): ApiMode => "agent";

export const selectExpandedVariable = (
  _state: unknown,
  _sessionId?: string,
): string | null => null;

export const selectShowVariables = (
  _state: unknown,
  _sessionId?: string,
): boolean => false;

export const selectShowDebugInfo = (
  _state: unknown,
  _sessionId?: string,
): boolean => false;

export const selectShowSystemMessages = (
  _state: unknown,
  _sessionId?: string,
): boolean => false;

export const selectSessionHasUnsavedChanges = (
  _state: unknown,
  _sessionId?: string,
): boolean => false;

export const selectDirtyMessages = (
  _state: unknown,
  _sessionId?: string,
): ConversationMessage[] => EMPTY_ARRAY as ConversationMessage[];

export const selectMessageHasUnsavedChanges = (
  _state: unknown,
  _sessionId?: string,
  _messageId?: string,
): boolean => false;

export const selectActiveChatAgent = (_state: unknown): ActiveChatAgent => ({
  promptId: undefined,
  name: undefined,
  configFetched: false,
});

// Used by ChatConversationClient — replaces missing messages.selectors export.
export const selectTurnCount =
  (_conversationId: string) =>
  (_state: unknown): number =>
    0;

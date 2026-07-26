/**
 * Types barrel — the public type surface of `@matrx/agents`.
 *
 * Currently re-exports from the in-repo paths. When Phase 9.4 physically
 * moves the source into the package, these re-exports become local
 * `./foo` paths.
 */

// ── Conversation invocation contract ────────────────────────────────────────
export type {
  ConversationInvocation,
  ConversationInvocationIdentity,
  ConversationInvocationEngine,
  ConversationInvocationEngineKind,
  ConversationInvocationRouting,
  ConversationInvocationOrigin,
  ConversationInvocationInputs,
  ConversationInvocationScope,
  ConversationInvocationRelation,
  ConversationInvocationDisplay,
  ConversationInvocationBehavior,
  ConversationInvocationCallbacks,
} from "@/features/agents/types/conversation-invocation.types";

// ── Core execution types ────────────────────────────────────────────────────
export type {
  ExecutionInstance,
  InstanceStatus,
  InstanceOrigin,
  SourceFeature,
  ApiEndpointMode,
  ResultDisplayMode,
  JsonExtractionConfig,
  BuilderAdvancedSettings,
  CompletionStats,
  AggregatedUsageResult,
  ModelUsageSummary,
  UsageTotals,
  TimingStatsResult,
  ToolCallStatsResult,
  ToolCallByTool,
  InstanceUIState,
  InstanceModelOverrideState,
  ManagedResource,
  ResourceStatus,
  ResourceBlockType,
  ResourceOptions,
  InstanceContextEntry,
  InstanceUserInputState,
  ManagedAgentOptions,
} from "@/features/agents/types/instance.types";

export type { ContextObjectType } from "@/features/agents/types/agent-api-types";
export type { InstanceVariableValuesEntry } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";

// ── Agent definition types ──────────────────────────────────────────────────
export type {
  AgentDefinition,
  AgentDefinitionRecord,
  AgentDefinitionSliceState,
  AgentType,
  VariableDefinition,
  LoadedFields,
  UndoEntry,
  AgentFetchStatus,
  FieldSnapshot,
} from "@/features/agents/types/agent-definition.types";

// ── Slice records / states (DB-faithful) ───────────────────────────────────
export type {
  ConversationRecord,
  ConversationsState,
} from "@/features/agents/redux/execution-system/conversations/conversations.slice";

export type {
  MessageRecord,
  MessagesEntry,
  MessagesState,
} from "@/features/agents/redux/execution-system/messages/messages.slice";

export type {
  CxUserRequestRecord,
  CxRequestRecord,
  CxToolCallRecord,
  ObservabilityState,
  ObservabilityUserRequestTimeline,
} from "@/features/agents/redux/execution-system/observability/observability.slice";

export type {
  ConversationListItem,
  ConversationListState,
  ConversationListAgentCacheEntry,
  ConversationListLoadStatus,
} from "@/features/agents/redux/conversation-list/conversation-list.types";

export type {
  ActiveRequest,
  RequestStatus,
  PendingToolCall,
  ToolLifecycleEntry,
  ToolLifecycleStatus,
  TimelineEntry,
  RawStreamEvent,
  ReservationRecord,
  ReservationStatus,
  ClientMetrics,
} from "@/features/agents/types/request.types";

export type {
  CacheBypassFlags,
  CacheBypassState,
} from "@/features/agents/redux/execution-system/message-crud/cache-bypass.slice";

export type {
  MessageActionInstance,
  MessageActionsState,
} from "@/features/agents/redux/execution-system/message-actions/message-actions.slice";

// ── Shared utility types ────────────────────────────────────────────────────
export type { FieldFlags } from "@/features/agents/redux/shared/field-flags";

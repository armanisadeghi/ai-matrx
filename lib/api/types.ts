// lib/api/types.ts
// Canonical types for the Python FastAPI backend API.
//
// Stream event types and request/response schemas are auto-generated from
// the Python Pydantic models. This file re-exports them alongside the
// frontend-only types (auth, scope, error) that have no Python counterpart.
//
// NEVER define API types manually here. If the type comes from Python, it
// MUST be imported from @/@ai-matrx/agents/generated/. Run `pnpm update-api-types`
// to regenerate after backend changes.

// ============================================================================
// RE-EXPORTS — Auto-generated from Python (stream events)
// ============================================================================

export type {
  EventType,
  ToolEventType,
  Phase,
  Operation,
  InitCompletionStatus,
  WarningLevel,
  ChunkPayload,
  ReasoningChunkPayload,
  ReasoningPayload,
  PhasePayload,
  InitPayload,
  DataPayload,
  CompletionPayload,
  ErrorPayload,
  ToolEventPayload,
  WarningPayload,
  InfoPayload,
  HeartbeatPayload,
  EndPayload,
  RenderBlockPayload,
  RecordReservedPayload,
  RecordUpdatePayload,
  TypedStreamEvent,
  CompactChunkEvent,
  CompactReasoningChunkEvent,
  CompactStreamEvent,
  RawStreamLine,
  TypedDataPayload,
  ChunkEvent,
  ReasoningChunkEvent,
  PhaseEvent,
  InitEvent,
  TypedDataEvent,
  CompletionEvent,
  ErrorEvent,
  ToolEventEvent,
  WarningEvent,
  InfoEvent,
  HeartbeatEvent,
  EndEvent,
  RenderBlockEvent,
  RecordReservedEvent,
  RecordUpdateEvent,
  UserRequestResult,
  LlmRequestResult,
  ToolExecutionResult,
  SubAgentResult,
  PersistenceResult,
  AggregatedUsageResult,
  ModelUsageSummary,
  UsageTotals,
  TimingStatsResult,
  ToolCallStatsResult,
  ToolCallByTool,
} from "@ai-matrx/agents/generated/stream-events";

export {
  EventType as EventTypeEnum,
  isChunkEvent,
  isReasoningChunkEvent,
  isReasoningEvent,
  isPhaseEvent,
  isInitEvent,
  isTypedDataEvent,
  isCompletionEvent,
  isErrorEvent,
  isToolEventEvent,
  isWarningEvent,
  isInfoEvent,
  isHeartbeatEvent,
  isEndEvent,
  isRenderBlockEvent,
  isRecordReservedEvent,
  isRecordUpdateEvent,
  isCompactEvent,
  isCompactChunkEvent,
  isCompactReasoningChunkEvent,
  expandCompactEvent,
} from "@ai-matrx/agents/generated/stream-events";

// ============================================================================
// RE-EXPORTS — Auto-generated from Python (OpenAPI request/response schemas)
// ============================================================================

export type {
  components,
  operations,
  paths,
} from "@ai-matrx/agents/generated/api-types";

import type { components } from "@ai-matrx/agents/generated/api-types";

// Named aliases — every one of these resolves to a generated schema.
// If a schema is renamed/removed in Python, TypeScript will error here immediately.
export type ChatRequestBody = components["schemas"]["ChatRequest"];
export type AgentStartRequestBody = components["schemas"]["AgentStartRequest"];
export type AgentBlocksStartRequestBody =
  components["schemas"]["AgentBlocksStartRequest"];
export type ConversationContinueRequestBody =
  components["schemas"]["ConversationContinueRequest"];
export type LLMParams = components["schemas"]["LLMParams"];
export type ToolTestExecuteRequestBody =
  components["schemas"]["ToolTestExecuteRequest"];
export type ClientToolResult = components["schemas"]["ClientToolResult"];
export type ToolResultsRequestBody =
  components["schemas"]["ToolResultsRequest"];
export type DirectChatRequestBody = components["schemas"]["DirectChatRequest"];

export type ResearchConfigCreateBody = Record<string, unknown>;
export type ResearchConfigUpdateBody = Record<string, unknown>;
export type KeywordCreateBody = components["schemas"]["KeywordCreate"];
export type SourceUpdateBody = components["schemas"]["SourceUpdate"];
export type SourceBulkActionBody = components["schemas"]["SourceBulkAction"];
export type SynthesisRequestBody = components["schemas"]["SynthesisRequest"];
export type SuggestRequestBody = components["schemas"]["SuggestRequest"];
export type TagCreateBody = components["schemas"]["TagCreate"];
export type TemplateCreateBody = components["schemas"]["TemplateCreate"];

/**
 * Utility: extract the keys of ChatRequest as a runtime Set.
 * Use this instead of hardcoding allowed field lists.
 * NOTE: This is a compile-time type — for runtime validation, use the
 * llm-params.schema.json or openapi.json directly.
 */
export type ChatRequestKey = keyof ChatRequestBody;
export type LLMParamsKey = keyof LLMParams;

// ============================================================================
// ERROR TYPES (frontend-only — no Python counterpart)
// ============================================================================

// The server error shape and its codes live with the error model in
// `@ai-matrx/agents/matrx` (P9); re-exported here.
export type { BackendApiErrorData, BackendErrorCode } from "@ai-matrx/agents/matrx";

// ============================================================================
// CONTEXT / SCOPE TYPES
// ============================================================================

/**
 * Org/project/task context that scopes API requests.
 * Sent in the request body (not headers) per backend convention.
 * All fields are optional — omit when not applicable.
 */
export interface ContextScope {
  organization_id?: string;
  project_id?: string;
  task_id?: string;
}

/** URL search param names mapped to ContextScope field names */
export const SCOPE_URL_PARAMS = {
  org: "organization_id",
  proj: "project_id",
  task: "task_id",
} as const;

export type ScopeUrlParam = keyof typeof SCOPE_URL_PARAMS;

// ============================================================================
// AUTH TYPES
// ============================================================================

/**
 * Authentication credentials for backend requests.
 * Exactly one of: JWT token, fingerprint ID, or anonymous.
 */
export type AuthCredentials =
  | { type: "token"; token: string }
  | { type: "fingerprint"; fingerprintId: string }
  | { type: "anonymous" };

// ============================================================================
// RESPONSE TYPES (not in OpenAPI — simple enough to define here)
// ============================================================================

/** Tool test session response */
export interface ToolTestSessionResponse {
  conversation_id: string;
  user_id: string;
}

/** Health check response */
export interface HealthCheckResponse {
  status: string;
  service: string;
  timestamp: string;
}

/** Health detailed response */
export interface HealthDetailedResponse extends HealthCheckResponse {
  components: Record<string, unknown>;
  version: string;
}

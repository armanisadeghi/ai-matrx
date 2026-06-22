// AUTO-GENERATED — do not edit manually.
// Sources:
//   matrx_connect.context.*  — stream event types
//   matrx_ai.db.message_parts — cx_message.content[] types
// Run: uv run python scripts/generate_types.py stream

export const EventType = {
  CHUNK: "chunk",
  REASONING_CHUNK: "reasoning_chunk",
  PHASE: "phase",
  WARNING: "warning",
  INFO: "info",
  DATA: "data",
  INIT: "init",
  COMPLETION: "completion",
  ERROR: "error",
  TOOL_EVENT: "tool_event",
  BROKER: "broker",
  HEARTBEAT: "heartbeat",
  END: "end",
  RENDER_BLOCK: "render_block",
  RECORD_RESERVED: "record_reserved",
  RECORD_UPDATE: "record_update",
  RESOURCE_CHANGED: "resource_changed",
  CONTEXT_ANALYSIS: "context_analysis",
  STRUCTURED_OUTPUT: "structured_output",
  CONTEXT_STATE: "context_state",
  CONTEXT_TRIMMED: "context_trimmed",
  INJECTION_CONSUMED: "injection_consumed",
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

export type Phase =
  | "connected"
  | "processing"
  | "generating"
  | "using_tools"
  | "persisting"
  | "searching"
  | "scraping"
  | "analyzing"
  | "synthesizing"
  | "retrying"
  | "executing"
  | "complete";

export type Operation =
  | "llm_request"
  | "tool_execution"
  | "user_request"
  | "sub_agent"
  | "persistence";

export type ToolEventType =
  | "tool_started"
  | "tool_progress"
  | "tool_step"
  | "tool_result_preview"
  | "tool_completed"
  | "tool_error"
  | "tool_delegated";

export type WarningLevel =
  | "low"
  | "medium"
  | "high";

export type InitCompletionStatus =
  | "success"
  | "failed"
  | "cancelled";

export interface ChunkPayload {
  text: string;
}

export interface ReasoningChunkPayload {
  text: string;
}

export interface PhasePayload {
  phase: "connected" | "processing" | "generating" | "using_tools" | "persisting" | "searching" | "scraping" | "analyzing" | "synthesizing" | "retrying" | "executing" | "complete";
}

export interface WarningPayload {
  code: string;
  system_message: string;
  user_message?: string | null;
  level?: "low" | "medium" | "high";
  recoverable?: boolean;
  metadata?: Record<string, unknown>;
}

export interface InfoPayload {
  code: string;
  system_message: string;
  user_message?: string | null;
  metadata?: Record<string, unknown>;
}

export interface InitPayload {
  operation: "llm_request" | "tool_execution" | "user_request" | "sub_agent" | "persistence";
  operation_id: string;
  parent_operation_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CompletionPayload {
  operation: "llm_request" | "tool_execution" | "user_request" | "sub_agent" | "persistence";
  operation_id: string;
  status: "success" | "failed" | "cancelled";
  result?: Record<string, unknown>;
}

export interface ErrorPayload {
  error_type: string;
  message: string;
  user_message?: string;
  code?: string | null;
  details?: Record<string, unknown> | null;
}

export interface ToolEventPayload {
  event: "tool_started" | "tool_progress" | "tool_step" | "tool_result_preview" | "tool_completed" | "tool_error" | "tool_delegated";
  call_id: string;
  tool_name: string;
  timestamp?: number;
  message?: string | null;
  show_spinner?: boolean;
  data?: Record<string, unknown>;
}

export interface BrokerPayload {
  broker_id: string;
  value: unknown;
  source?: string | null;
  source_id?: string | null;
}

export interface HeartbeatPayload {
  timestamp?: number;
  seq?: number | null;
  late_by_seconds?: number | null;
}

export interface EndPayload {
  reason?: string;
}

export interface RenderBlockPayload {
  blockId: string;
  blockIndex: number;
  type: string;
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface RecordReservedPayload {
  db_project: string;
  table: string;
  record_id: string;
  status?: "pending";
  parent_refs?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface RecordUpdatePayload {
  db_project: string;
  table: string;
  record_id: string;
  status: "active" | "completed" | "failed";
  metadata?: Record<string, unknown>;
}

export interface ResourceChangedPayload {
  kind: string;
  action: "created" | "modified" | "deleted" | "moved" | "renamed" | "invalidated";
  resource_id: string;
  sandbox_id?: string | null;
  user_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ContextAnalysisPayload {
  provider: string;
  model?: string | null;
  iteration?: number | null;
  conversation_id?: string | null;
  request_id?: string | null;
  attempt?: number;
  is_streaming?: boolean;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Record<string, unknown> | null;
  body_raw?: string | null;
  body_size_bytes?: number;
  timestamp?: number;
}

export interface StructuredOutputPayload {
  schema_name?: string | null;
  json_schema: Record<string, unknown>;
  data?: Record<string, unknown> | unknown[] | null;
  success: boolean;
  reason?: string;
  match_count?: number;
  agent_name?: string | null;
  operation_id?: string | null;
}

export interface ConsumedInjection {
  injection_id: string;
  kind: string;
  text?: string | null;
  is_visible_to_user?: boolean;
  position?: number | null;
  message_id?: string | null;
}

export interface InjectionConsumedPayload {
  conversation_id: string;
  items: ConsumedInjection[];
  count: number;
}

export interface ContextStatePayload {
  conversation_id: string;
  last_request_input_tokens?: number;
  last_request_cached_tokens?: number;
  last_request_output_tokens?: number;
  total_chars_visible_to_model?: number;
  message_count_visible?: number;
  cache_state?: Record<string, unknown>;
  measured_at: string;
}

export interface ContextTrimmedPayload {
  conversation_id: string;
  request_id?: string | null;
  trim_summary: Record<string, unknown>;
  measured_at: string;
}

// --- Typed Record Reservation Variants (discriminated on `table`) ---

// Narrows RecordReservedPayload.metadata / parent_refs by table.
// Server guarantees these shapes for cx_message, cx_request, cx_tool_call.

export interface CxMessageReservedParentRefs {
  [key: string]: unknown;
  conversation_id: string;
  user_request_id: string;
}

export interface CxMessageReservedMetadata {
  [key: string]: unknown;
  role: "user" | "assistant" | "system" | "tool";
  position: number;
}

export interface CxRequestReservedParentRefs {
  [key: string]: unknown;
  conversation_id: string;
  user_request_id: string;
}

export interface CxRequestReservedMetadata {
  [key: string]: unknown;
  iteration: number;
}

export interface CxToolCallReservedParentRefs {
  [key: string]: unknown;
  conversation_id: string;
  user_request_id: string;
  call_id: string;
}

export interface CxToolCallReservedMetadata {
  [key: string]: unknown;
  tool_name: string;
  call_id: string;
  iteration: number;
}

export type CxMessageReservedPayload = RecordReservedPayload & {
  table: "cx_message";
  parent_refs: CxMessageReservedParentRefs;
  metadata: CxMessageReservedMetadata;
};

export type CxRequestReservedPayload = RecordReservedPayload & {
  table: "cx_request";
  parent_refs: CxRequestReservedParentRefs;
  metadata: CxRequestReservedMetadata;
};

export type CxToolCallReservedPayload = RecordReservedPayload & {
  table: "cx_tool_call";
  parent_refs: CxToolCallReservedParentRefs;
  metadata: CxToolCallReservedMetadata;
};

/** Discriminated union on `table` — narrows metadata/parent_refs for known tables. */
export type TypedRecordReservedPayload =
  | CxMessageReservedPayload
  | CxRequestReservedPayload
  | CxToolCallReservedPayload;

/** True when the reservation is for a known table with typed metadata. */
export function isTypedRecordReservedPayload(p: RecordReservedPayload): p is RecordReservedPayload & TypedRecordReservedPayload {
  return p.table === "cx_message" || p.table === "cx_request" || p.table === "cx_tool_call";
}

/** Narrows to CxMessageReservedPayload — `metadata.role` and `metadata.position` are guaranteed. */
export function isCxMessageReservation(p: RecordReservedPayload): p is CxMessageReservedPayload {
  return p.table === "cx_message";
}

/** Narrows to CxRequestReservedPayload — `metadata.iteration` is guaranteed. */
export function isCxRequestReservation(p: RecordReservedPayload): p is CxRequestReservedPayload {
  return p.table === "cx_request";
}

/** Narrows to CxToolCallReservedPayload — `metadata.tool_name`, `metadata.call_id`, and `metadata.iteration` are guaranteed. */
export function isCxToolCallReservation(p: RecordReservedPayload): p is CxToolCallReservedPayload {
  return p.table === "cx_tool_call";
}

// --- Typed Data Payloads ---

export interface DataPayload {
  type: string;
}

export interface AudioOutputData {
  type?: "audio_output";
  url: string;
  mime_type: string;
  file_id?: string | null;
  cdn_url?: string | null;
  signed_url?: string | null;
  download_url?: string | null;
}

export interface AudioStreamChunkData {
  type?: "audio_stream_chunk";
  stream_id: string;
  seq: number;
  audio_base64: string;
  mime_type?: string;
  encoding?: "pcm_s16le";
  sample_rate?: number;
  bits_per_sample?: number;
  channels?: number;
}

export interface AudioStreamEndData {
  type?: "audio_stream_end";
  stream_id: string;
  total_chunks: number;
  url?: string;
  mime_type?: string;
  file_id?: string | null;
  cdn_url?: string | null;
  signed_url?: string | null;
  download_url?: string | null;
  duration_ms?: number | null;
  sample_rate?: number;
  bits_per_sample?: number;
  channels?: number;
}

export interface CategorizationResultData {
  type?: "categorization_result";
  prompt_id: string;
  category: string;
  tags?: string[];
  description?: string;
  dry_run?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ContextChangedData {
  type?: "context_changed";
  key: string;
  command: string;
  object_type?: string;
  mutable?: boolean;
  persist?: string;
  source_kind?: string;
  source_id?: string | null;
}

export interface ContextPersistFailedData {
  type?: "context_persist_failed";
  key: string;
  command: string;
  source_kind?: string;
  source_id?: string | null;
  error?: string;
  traceback?: string;
}

export interface ContextPersistedData {
  type?: "context_persisted";
  key: string;
  command: string;
  source_kind?: string;
  source_id?: string | null;
}

export interface ConversationIdData {
  type?: "conversation_id";
  conversation_id: string;
}

export interface ConversationLabeledData {
  type?: "conversation_labeled";
  conversation_id: string;
  title: string;
  description?: string;
  keywords?: string[];
}

export interface QuestionnaireQuestion {
  id: string;
  prompt: string;
  component_type: "dropdown" | "checkboxes" | "radio" | "toggle" | "slider" | "input" | "textarea";
  options?: string[];
  min?: number | null;
  max?: number | null;
  step?: number | null;
  default?: unknown;
  required?: boolean;
}

export interface QuestionnaireDisplayData {
  type?: "display_questionnaire";
  introduction: string;
  questions?: QuestionnaireQuestion[];
}

export interface FetchResultItem {
  url?: string;
  title?: string;
  content?: string;
  status?: string;
}

export interface FetchResultsData {
  type?: "fetch_results";
  metadata?: Record<string, unknown>;
  results?: FetchResultItem[];
}

export interface FunctionResultData {
  type?: "function_result";
  function_name: string;
  success: boolean;
  result?: unknown;
  error?: string | null;
  duration_ms?: number | null;
}

export interface ImageOutputData {
  type?: "image_output";
  url: string;
  mime_type: string;
  file_id?: string | null;
  cdn_url?: string | null;
  signed_url?: string | null;
  download_url?: string | null;
}

export interface AudioBlock {
  origin: "matrx" | "external";
  file_id?: string | null;
  file_uri?: string | null;
  visibility?: "public" | "private" | "shared" | null;
  cdn_url?: string | null;
  signed_url?: string | null;
  download_url?: string | null;
  signed_url_expires_at?: number | null;
  parent_file_id?: string | null;
  derivation_kind?: string | null;
  external_url?: string | null;
  source_label?: string | null;
  base64?: string | null;
  mime_type?: string | null;
  file_name?: string | null;
  size_bytes?: number | null;
  status?: "complete" | "streaming" | "error";
  progress?: number | null;
  error_message?: string | null;
  metadata?: Record<string, JsonValue>;
  kind?: "audio";
  duration_ms?: number | null;
  transcript?: string | null;
}

export interface DocumentBlock {
  origin: "matrx" | "external";
  file_id?: string | null;
  file_uri?: string | null;
  visibility?: "public" | "private" | "shared" | null;
  cdn_url?: string | null;
  signed_url?: string | null;
  download_url?: string | null;
  signed_url_expires_at?: number | null;
  parent_file_id?: string | null;
  derivation_kind?: string | null;
  external_url?: string | null;
  source_label?: string | null;
  base64?: string | null;
  mime_type?: string | null;
  file_name?: string | null;
  size_bytes?: number | null;
  status?: "complete" | "streaming" | "error";
  progress?: number | null;
  error_message?: string | null;
  metadata?: Record<string, JsonValue>;
  kind?: "document";
  page_count?: number | null;
  page1_url?: string | null;
}

export interface ImageBlock {
  origin: "matrx" | "external";
  file_id?: string | null;
  file_uri?: string | null;
  visibility?: "public" | "private" | "shared" | null;
  cdn_url?: string | null;
  signed_url?: string | null;
  download_url?: string | null;
  signed_url_expires_at?: number | null;
  parent_file_id?: string | null;
  derivation_kind?: string | null;
  external_url?: string | null;
  source_label?: string | null;
  base64?: string | null;
  mime_type?: string | null;
  file_name?: string | null;
  size_bytes?: number | null;
  status?: "complete" | "streaming" | "error";
  progress?: number | null;
  error_message?: string | null;
  metadata?: Record<string, JsonValue>;
  kind?: "image";
  width?: number | null;
  height?: number | null;
  vision_class?: string | null;
}

export interface JsonValue {
}

export interface VideoBlock {
  origin: "matrx" | "external";
  file_id?: string | null;
  file_uri?: string | null;
  visibility?: "public" | "private" | "shared" | null;
  cdn_url?: string | null;
  signed_url?: string | null;
  download_url?: string | null;
  signed_url_expires_at?: number | null;
  parent_file_id?: string | null;
  derivation_kind?: string | null;
  external_url?: string | null;
  source_label?: string | null;
  base64?: string | null;
  mime_type?: string | null;
  file_name?: string | null;
  size_bytes?: number | null;
  status?: "complete" | "streaming" | "error";
  progress?: number | null;
  error_message?: string | null;
  metadata?: Record<string, JsonValue>;
  kind?: "video";
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  poster_url?: string | null;
}

export interface YouTubeBlock {
  origin?: "external";
  file_id?: string | null;
  file_uri?: string | null;
  visibility?: "public" | "private" | "shared" | null;
  cdn_url?: string | null;
  signed_url?: string | null;
  download_url?: string | null;
  signed_url_expires_at?: number | null;
  parent_file_id?: string | null;
  derivation_kind?: string | null;
  external_url?: string | null;
  source_label?: string | null;
  base64?: string | null;
  mime_type?: string | null;
  file_name?: string | null;
  size_bytes?: number | null;
  status?: "complete" | "streaming" | "error";
  progress?: number | null;
  error_message?: string | null;
  metadata?: Record<string, JsonValue>;
  kind?: "youtube";
  video_id?: string | null;
}

export interface MediaBlockData {
  type?: "media_block";
  block: ImageBlock | VideoBlock | AudioBlock | DocumentBlock | YouTubeBlock;
}

export interface MediaNoticeData {
  type?: "media_notice";
  media_kind: string;
  action: "dropped" | "extracted" | "transcribed" | "converted";
  user_message: string;
  system_message?: string;
  provider?: string | null;
  model?: string | null;
  metadata?: Record<string, unknown>;
}

export interface MemoryBufferSpawnedData {
  type?: "memory_buffer_spawned";
  conversation_id: string;
  kind?: "observer" | "reflector";
}

export interface MemoryContextInjectedData {
  type?: "memory_context_injected";
  conversation_id: string;
  observation_chars?: number;
}

export interface MemoryErrorData {
  type?: "memory_error";
  conversation_id: string;
  phase?: string;
  error?: string;
  model?: string | null;
}

export interface MemoryObserverCompletedData {
  type?: "memory_observer_completed";
  conversation_id: string;
  model?: string | null;
  input_tokens?: number;
  output_tokens?: number;
  cost?: number;
  duration_ms?: number | null;
}

export interface MemoryReflectorCompletedData {
  type?: "memory_reflector_completed";
  conversation_id: string;
  model?: string | null;
  input_tokens?: number;
  output_tokens?: number;
  cost?: number;
  duration_ms?: number | null;
}

export interface PartialImageData {
  type?: "partial_image";
  b64_json: string;
  partial_index: number;
  progress?: number;
  mime_type?: string;
}

export interface PodcastCompleteData {
  type?: "podcast_complete";
  show_id: string;
  success: boolean;
  episode_count?: number;
  error?: string | null;
}

export interface PodcastStageData {
  type?: "podcast_stage";
  stage: string;
  success: boolean;
  error?: string | null;
  result_keys?: string[];
}

export interface ScrapeBatchCompleteData {
  type?: "scrape_batch_complete";
  total_scraped: number;
}

export interface SearchErrorData {
  type?: "search_error";
  metadata?: Record<string, unknown>;
  error: string;
}

export interface SearchResultItem {
  url?: string;
  title?: string;
  snippet?: string;
  published?: string | null;
  source?: string | null;
}

export interface SearchResultsData {
  type?: "search_results";
  metadata?: Record<string, unknown>;
  results?: SearchResultItem[];
}

export interface StructuredInputFailure {
  url?: string;
  ref?: string;
  reason?: string;
}

export interface StructuredInputWarningData {
  type?: "structured_input_warning";
  block_type: string;
  failures?: StructuredInputFailure[];
}

export interface VideoOutputData {
  type?: "video_output";
  url: string;
  mime_type: string;
  file_id?: string | null;
  cdn_url?: string | null;
  signed_url?: string | null;
  download_url?: string | null;
}

export interface WorkflowStepData {
  type?: "workflow_step";
  step_name: string;
  status: string;
  data?: Record<string, unknown>;
}

export type TypedDataPayload =
  | AudioOutputData
  | AudioStreamChunkData
  | AudioStreamEndData
  | CategorizationResultData
  | ContextChangedData
  | ContextPersistFailedData
  | ContextPersistedData
  | ConversationIdData
  | ConversationLabeledData
  | FetchResultsData
  | FunctionResultData
  | ImageOutputData
  | MediaBlockData
  | MediaNoticeData
  | MemoryBufferSpawnedData
  | MemoryContextInjectedData
  | MemoryErrorData
  | MemoryObserverCompletedData
  | MemoryReflectorCompletedData
  | PartialImageData
  | PodcastCompleteData
  | PodcastStageData
  | QuestionnaireDisplayData
  | ScrapeBatchCompleteData
  | SearchErrorData
  | SearchResultsData
  | StructuredInputWarningData
  | VideoOutputData
  | WorkflowStepData;

/** Fallback for data events whose `type` isn't in TypedDataPayload. */
export interface UntypedDataPayload {
  [key: string]: unknown;
  type: string;
}

// --- Completion Result Models ---

export interface LlmRequestResult {
  tokens_in?: number;
  tokens_out?: number;
  duration_ms?: number;
  finish_reason?: string;
  model?: string;
}

export interface ToolExecutionResult {
  success?: boolean;
  duration_ms?: number;
  error?: string | null;
}

export interface AggregatedUsageResult {
  by_model?: Record<string, ModelUsageSummary>;
  total?: UsageTotals;
}

export interface ModelUsageSummary {
  input_tokens?: number;
  output_tokens?: number;
  cached_input_tokens?: number;
  total_tokens?: number;
  api?: string;
  request_count?: number;
  cost?: number | null;
}

export interface TimingStatsResult {
  total_duration?: number | null;
  sum_duration?: number | null;
  api_duration?: number | null;
  tool_duration?: number | null;
  processing_duration?: number | null;
  iterations?: number | null;
  avg_iteration_duration?: number | null;
}

export interface ToolCallByTool {
  count?: number;
  success?: number;
  error?: number;
}

export interface ToolCallStatsResult {
  total_tool_calls?: number;
  iterations_with_tools?: number;
  by_tool?: Record<string, ToolCallByTool>;
}

export interface UsageTotals {
  input_tokens?: number;
  output_tokens?: number;
  cached_input_tokens?: number;
  total_tokens?: number;
  total_requests?: number;
  unique_models?: number;
  total_cost?: number | null;
}

export interface UserRequestResult {
  status?: string;
  output?: unknown;
  iterations?: number | null;
  total_usage?: AggregatedUsageResult | null;
  timing_stats?: TimingStatsResult | null;
  tool_call_stats?: ToolCallStatsResult | null;
  finish_reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface SubAgentResult {
  agent_name?: string;
  success?: boolean;
  error?: string | null;
}

export interface PersistenceResult {
  records_written?: number;
  duration_ms?: number;
}

// --- Typed Completion Event Interfaces (discriminated on `operation`) ---

// Each interface narrows CompletionPayload.result to its concrete type.
// Use TypedCompletionEvent instead of CompletionPayload when you need typed result.

export interface LlmRequestResult {
  tokens_in?: number;
  tokens_out?: number;
  duration_ms?: number;
  finish_reason?: string;
  model?: string;
}

export interface LlmRequestCompletionEvent {
  operation: "llm_request";
  operation_id: string;
  status: "success" | "failed" | "cancelled";
  result: LlmRequestResult;
}

export interface ToolExecutionResult {
  success?: boolean;
  duration_ms?: number;
  error?: string | null;
}

export interface ToolExecutionCompletionEvent {
  operation: "tool_execution";
  operation_id: string;
  status: "success" | "failed" | "cancelled";
  result: ToolExecutionResult;
}

export interface UserRequestResult {
  status?: string;
  output?: unknown;
  iterations?: number | null;
  total_usage?: AggregatedUsageResult | null;
  timing_stats?: TimingStatsResult | null;
  tool_call_stats?: ToolCallStatsResult | null;
  finish_reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UserRequestCompletionEvent {
  operation: "user_request";
  operation_id: string;
  status: "success" | "failed" | "cancelled";
  result: UserRequestResult;
}

export interface SubAgentResult {
  agent_name?: string;
  success?: boolean;
  error?: string | null;
}

export interface SubAgentCompletionEvent {
  operation: "sub_agent";
  operation_id: string;
  status: "success" | "failed" | "cancelled";
  result: SubAgentResult;
}

export interface PersistenceResult {
  records_written?: number;
  duration_ms?: number;
}

export interface PersistenceCompletionEvent {
  operation: "persistence";
  operation_id: string;
  status: "success" | "failed" | "cancelled";
  result: PersistenceResult;
}

export type TypedCompletionEvent =
  | LlmRequestCompletionEvent
  | ToolExecutionCompletionEvent
  | UserRequestCompletionEvent
  | SubAgentCompletionEvent
  | PersistenceCompletionEvent;

const TYPED_COMPLETION_EVENT_OPERATIONS = new Set<Operation>([
  "llm_request", "tool_execution", "user_request", "sub_agent", "persistence",
]);

export function isTypedCompletionEvent(e: CompletionPayload): e is CompletionPayload & TypedCompletionEvent {
  return TYPED_COMPLETION_EVENT_OPERATIONS.has(e.operation as Operation) && e.result !== undefined;
}

// --- Tool Event Data Models ---

export interface ToolStartedData {
  arguments?: Record<string, unknown>;
}

export interface ToolProgressData {
  percent?: number | null;
  metadata?: Record<string, unknown>;
}

export interface ToolStepData {
  step: string;
  metadata?: Record<string, unknown>;
}

export interface ToolResultPreviewData {
  preview: string;
}

export interface ToolCompletedData {
  result?: string | Record<string, unknown> | null;
}

export interface ToolErrorData {
  error_type: string;
  detail?: string | null;
}

export interface ToolDelegatedData {
  arguments?: Record<string, unknown>;
}

export type TypedToolEventData =
  | ToolStartedData
  | ToolProgressData
  | ToolStepData
  | ToolResultPreviewData
  | ToolCompletedData
  | ToolErrorData
  | ToolDelegatedData;

// --- Typed Tool Event Interfaces (discriminated on `event`) ---

// Each interface narrows ToolEventPayload.data to its concrete type.
// Use TypedToolEvent instead of the base ToolEventPayload when you need typed data.

export interface ToolStartedData {
  arguments?: Record<string, unknown>;
}

export interface ToolStartedToolEvent {
  event: "tool_started";
  call_id: string;
  tool_name: string;
  timestamp?: number;
  message?: string | null;
  show_spinner?: boolean;
  data: ToolStartedData;
}

export interface ToolProgressData {
  percent?: number | null;
  metadata?: Record<string, unknown>;
}

export interface ToolProgressToolEvent {
  event: "tool_progress";
  call_id: string;
  tool_name: string;
  timestamp?: number;
  message?: string | null;
  show_spinner?: boolean;
  data: ToolProgressData;
}

export interface ToolStepData {
  step: string;
  metadata?: Record<string, unknown>;
}

export interface ToolStepToolEvent {
  event: "tool_step";
  call_id: string;
  tool_name: string;
  timestamp?: number;
  message?: string | null;
  show_spinner?: boolean;
  data: ToolStepData;
}

export interface ToolResultPreviewData {
  preview: string;
}

export interface ToolResultPreviewToolEvent {
  event: "tool_result_preview";
  call_id: string;
  tool_name: string;
  timestamp?: number;
  message?: string | null;
  show_spinner?: boolean;
  data: ToolResultPreviewData;
}

export interface ToolCompletedData {
  result?: string | Record<string, unknown> | null;
}

export interface ToolCompletedToolEvent {
  event: "tool_completed";
  call_id: string;
  tool_name: string;
  timestamp?: number;
  message?: string | null;
  show_spinner?: boolean;
  data: ToolCompletedData;
}

export interface ToolErrorData {
  error_type: string;
  detail?: string | null;
}

export interface ToolErrorToolEvent {
  event: "tool_error";
  call_id: string;
  tool_name: string;
  timestamp?: number;
  message?: string | null;
  show_spinner?: boolean;
  data: ToolErrorData;
}

export interface ToolDelegatedData {
  arguments?: Record<string, unknown>;
}

export interface ToolDelegatedToolEvent {
  event: "tool_delegated";
  call_id: string;
  tool_name: string;
  timestamp?: number;
  message?: string | null;
  show_spinner?: boolean;
  data: ToolDelegatedData;
}

export type TypedToolEvent =
  | ToolStartedToolEvent
  | ToolProgressToolEvent
  | ToolStepToolEvent
  | ToolResultPreviewToolEvent
  | ToolCompletedToolEvent
  | ToolErrorToolEvent
  | ToolDelegatedToolEvent;

const TYPED_TOOL_EVENT_TYPES = new Set<ToolEventType>([
  "tool_started", "tool_progress", "tool_step", "tool_result_preview", "tool_completed", "tool_error", "tool_delegated",
]);

export function isTypedToolEvent(e: ToolEventPayload): e is ToolEventPayload & TypedToolEvent {
  return TYPED_TOOL_EVENT_TYPES.has(e.event as ToolEventType) && e.data !== undefined;
}

// --- Render Block Data Models (RenderBlockPayload.data per type) ---

export interface FlashcardItem {
  front: string;
  back?: string | null;
}

export interface TranscriptSegment {
  id: string;
  timecode: string;
  seconds: number;
  text: string;
  speaker?: string | null;
}

export interface TaskItem {
  id: string;
  title: string;
  type: "section" | "task" | "subtask";
  bold?: boolean;
  checked?: boolean;
  children?: TaskItem[];
}

export interface TaskItem {
}

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface Slide {
  type?: string;
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  bullets?: string[];
  notes?: string | null;
  imageUrl?: string | null;
  quote?: string | null;
  author?: string | null;
  layout?: string | null;
  extra?: Record<string, unknown>;
}

export interface SlideTheme {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  variant?: string;
  font?: string | null;
}

export interface Ingredient {
  amount?: string;
  item: string;
}

export interface RecipeStep {
  action: string;
  description: string;
  time?: string | null;
}

export interface TimelineEvent {
  id: string;
  title: string;
  date?: string;
  description?: string;
  status?: "completed" | "in-progress" | "pending" | null;
  category?: string | null;
}

export interface TimelineEvent {
  id: string;
  title: string;
  date?: string;
  description?: string;
  status?: "completed" | "in-progress" | "pending" | null;
  category?: string | null;
}

export interface TimelinePeriod {
  period: string;
  events?: TimelineEvent[];
}

export interface Position {
  x: number;
  y: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface DiagramNode {
  id: string;
  label: string;
  type?: string | null;
  nodeType?: string;
  description?: string | null;
  details?: string | null;
  position?: Position | null;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string | null;
  type?: string;
  color?: string | null;
  dashed?: boolean;
  strokeWidth?: number;
}

export interface DiagramLayout {
  direction?: "TB" | "LR" | "BT" | "RL";
  spacing?: number;
}

export interface ResourceItem {
  id: string;
  title: string;
  url?: string;
  description?: string;
  type?: string;
  duration?: string | null;
  difficulty?: "beginner" | "intermediate" | "advanced" | null;
  rating?: number | null;
  tags?: string[];
}

export interface ResourceItem {
  id: string;
  title: string;
  url?: string;
  description?: string;
  type?: string;
  duration?: string | null;
  difficulty?: "beginner" | "intermediate" | "advanced" | null;
  rating?: number | null;
  tags?: string[];
}

export interface ResourceCategory {
  name: string;
  items?: ResourceItem[];
}

export interface ProgressItem {
  id: string;
  text: string;
  completed?: boolean;
  priority?: "high" | "medium" | "low" | null;
  estimatedHours?: number | null;
  optional?: boolean;
  category?: string | null;
}

export interface ProgressItem {
  id: string;
  text: string;
  completed?: boolean;
  priority?: "high" | "medium" | "low" | null;
  estimatedHours?: number | null;
  optional?: boolean;
  category?: string | null;
}

export interface ProgressCategory {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  completionPercentage?: number;
  items?: ProgressItem[];
}

export interface ComparisonCriterion {
  name: string;
  values: unknown[];
  type?: "cost" | "rating" | "text" | "boolean";
  weight?: number | null;
  higherIsBetter?: boolean | null;
}

export interface TroubleshootingLink {
  title: string;
  url: string;
}

export interface TroubleshootingStep {
  id: string;
  title: string;
  description: string;
  commands?: string[];
  difficulty?: "easy" | "medium" | "hard" | null;
  estimatedTime?: string | null;
  links?: TroubleshootingLink[];
}

export interface TroubleshootingStep {
  id: string;
  title: string;
  description: string;
  commands?: string[];
  difficulty?: "easy" | "medium" | "hard" | null;
  estimatedTime?: string | null;
  links?: TroubleshootingLink[];
}

export interface TroubleshootingSolution {
  id: string;
  title: string;
  description?: string | null;
  priority?: "high" | "medium" | "low" | null;
  successRate?: number | null;
  tags?: string[];
  steps?: TroubleshootingStep[];
}

export interface TroubleshootingSolution {
  id: string;
  title: string;
  description?: string | null;
  priority?: "high" | "medium" | "low" | null;
  successRate?: number | null;
  tags?: string[];
  steps?: TroubleshootingStep[];
}

export interface TroubleshootingIssue {
  id: string;
  symptom: string;
  description?: string | null;
  severity?: "low" | "medium" | "high" | "critical" | null;
  causes?: string[];
  relatedIssues?: string[];
  solutions?: TroubleshootingSolution[];
}

export interface DecisionNode {
  id: string;
  question?: string | null;
  action?: string | null;
  type?: string;
  yes?: DecisionNode | null;
  no?: DecisionNode | null;
  priority?: string | null;
  category?: string | null;
  estimatedTime?: string | null;
}

export interface DecisionNode {
}

export interface QuestionnaireSection {
  title?: string;
  content?: string;
  items?: Record<string, unknown>[];
  tables?: Record<string, unknown>[];
  codeBlocks?: Record<string, unknown>[];
  jsonBlocks?: Record<string, unknown>[];
}

export interface TextBlockData {
}

export interface CodeBlockData {
  language?: string;
  code?: string;
  is_diff?: boolean;
}

export interface DiffBlockData {
  language?: string;
  style?: string;
  code?: string;
}

export interface ThinkingBlockData {
}

export interface ReasoningBlockData {
}

export interface ConsolidatedReasoningBlockData {
  reasoning_texts: string[];
}

export interface ImageBlockData {
  src: string;
  alt?: string;
}

export interface VideoBlockData {
  src: string;
  alt?: string;
}

export interface FlashcardItem {
  front: string;
  back?: string | null;
}

export interface FlashcardsBlockData {
  cards: FlashcardItem[];
  isComplete?: boolean;
}

export interface TranscriptSegment {
  id: string;
  timecode: string;
  seconds: number;
  text: string;
  speaker?: string | null;
}

export interface TranscriptBlockData {
  segments: TranscriptSegment[];
}

export interface TasksBlockData {
  items: TaskItem[];
}

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface QuizBlockData {
  quizTitle: string;
  category?: string | null;
  multipleChoice: QuizQuestion[];
}

export interface Slide {
  type?: string;
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  bullets?: string[];
  notes?: string | null;
  imageUrl?: string | null;
  quote?: string | null;
  author?: string | null;
  layout?: string | null;
  extra?: Record<string, unknown>;
}

export interface SlideTheme {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  variant?: string;
  font?: string | null;
}

export interface PresentationBlockData {
  title?: string | null;
  slides?: Slide[];
  theme?: SlideTheme;
}

export interface Ingredient {
  amount?: string;
  item: string;
}

export interface RecipeStep {
  action: string;
  description: string;
  time?: string | null;
}

export interface RecipeBlockData {
  title?: string;
  yields?: string;
  totalTime?: string;
  prepTime?: string;
  cookTime?: string;
  ingredients?: Ingredient[];
  instructions?: RecipeStep[];
  notes?: string | null;
}

export interface TimelinePeriod {
  period: string;
  events?: TimelineEvent[];
}

export interface TimelineBlockData {
  title?: string;
  description?: string | null;
  periods?: TimelinePeriod[];
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string | null;
  type?: string;
  color?: string | null;
  dashed?: boolean;
  strokeWidth?: number;
}

export interface DiagramLayout {
  direction?: "TB" | "LR" | "BT" | "RL";
  spacing?: number;
}

export interface DiagramNode {
  id: string;
  label: string;
  type?: string | null;
  nodeType?: string;
  description?: string | null;
  details?: string | null;
  position?: Position | null;
}

export interface DiagramBlockData {
  title: string;
  description?: string | null;
  type?: "flowchart" | "mindmap" | "orgchart" | "network" | "system" | "process";
  nodes?: DiagramNode[];
  edges?: DiagramEdge[];
  layout?: DiagramLayout;
}

export interface MermaidBlockData {
  title?: string | null;
  diagramType?: string;
  source: string;
  isValid?: boolean | null;
  diagnostics?: string[];
}

export interface TableBlockData {
  headers: string[];
  rows: string[][];
  isComplete?: boolean;
  rawMarkdown?: string;
}

export interface ResearchFinding {
  id: string;
  title: string;
  primarySource?: string;
  additionalSources?: string[];
  urls?: string[];
  keyDetails?: string;
  significance?: string;
  futureImplications?: string;
  confidenceLevel?: "HIGH" | "MEDIUM" | "LOW";
}

export interface ResearchSection {
  id: string;
  title: string;
  subtitle?: string | null;
  findings?: ResearchFinding[];
}

export interface ConvergentTheme {
  theme: string;
  description: string;
}

export interface ResearchChallenge {
  id: string;
  title: string;
  description: string;
  currentSolutions?: string | null;
  researchGaps?: string | null;
  category?: "technical" | "ethical" | "regulatory" | "other";
}

export interface ResearchMetadata {
  researchDate?: string | null;
  lastUpdated?: string | null;
  confidenceRating?: string | null;
  biasAssessment?: string | null;
}

export interface ResearchRecommendation {
  id: string;
  recommendation: string;
  target?: "researchers" | "industry" | "policymakers" | "general";
}

export interface ResearchSection {
  id: string;
  title: string;
  subtitle?: string | null;
  findings?: ResearchFinding[];
}

export interface ResearchBlockData {
  title: string;
  overview?: string;
  introduction?: string;
  conclusion?: string;
  executiveSummary?: string | null;
  researchScope?: string | null;
  keyFocusAreas?: string | null;
  analysisPeriod?: string | null;
  researchQuestions?: string[];
  sections?: ResearchSection[];
  convergentThemes?: ConvergentTheme[];
  shortTermOutlook?: string[];
  mediumTermOutlook?: string[];
  longTermVision?: string[];
  challenges?: ResearchChallenge[];
  recommendations?: ResearchRecommendation[];
  keyTakeaways?: string[];
  limitations?: string[];
  metadata?: ResearchMetadata;
}

export interface ResourceCategory {
  name: string;
  items?: ResourceItem[];
}

export interface ResourcesBlockData {
  title: string;
  description?: string | null;
  categories?: ResourceCategory[];
}

export interface ProgressCategory {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  completionPercentage?: number;
  items?: ProgressItem[];
}

export interface ProgressTrackerBlockData {
  title: string;
  description?: string | null;
  overallProgress?: number;
  totalItems?: number;
  completedItems?: number;
  categories?: ProgressCategory[];
}

export interface ComparisonCriterion {
  name: string;
  values: unknown[];
  type?: "cost" | "rating" | "text" | "boolean";
  weight?: number | null;
  higherIsBetter?: boolean | null;
}

export interface ComparisonBlockData {
  title: string;
  description?: string | null;
  items: string[];
  criteria?: ComparisonCriterion[];
}

export interface TroubleshootingIssue {
  id: string;
  symptom: string;
  description?: string | null;
  severity?: "low" | "medium" | "high" | "critical" | null;
  causes?: string[];
  relatedIssues?: string[];
  solutions?: TroubleshootingSolution[];
}

export interface TroubleshootingBlockData {
  title: string;
  description?: string | null;
  issues?: TroubleshootingIssue[];
}

export interface DecisionTreeBlockData {
  title: string;
  description?: string | null;
  root: DecisionNode;
}

export interface MathProblemInner {
  title?: string;
  courseName?: string;
  topicName?: string;
  moduleName?: string;
  description?: string | null;
  introText?: string | null;
  finalStatement?: string | null;
  problemStatement?: MathProblemStatement;
  solutions?: MathSolution[];
}

export interface MathProblemStatement {
  text?: string;
  equation?: string;
  instruction?: string;
}

export interface MathSolution {
  task?: string;
  transitionText?: string | null;
  solutionAnswer?: string;
  steps?: MathSolutionStep[];
}

export interface MathSolutionStep {
  title?: string;
  equation?: string;
  explanation?: string | null;
  simplified?: string | null;
}

export interface MathProblemBlockData {
  math_problem: MathProblemInner;
}

export interface QuestionnaireSection {
  title?: string;
  content?: string;
  items?: Record<string, unknown>[];
  tables?: Record<string, unknown>[];
  codeBlocks?: Record<string, unknown>[];
  jsonBlocks?: Record<string, unknown>[];
}

export interface QuestionnaireBlockData {
  sections?: QuestionnaireSection[];
  rawContent?: string;
}

export interface MatrxBrokerBlockData {
  matrxRecordId?: string | null;
  id?: string | null;
  name?: string | null;
  defaultValue?: string | null;
  color?: string | null;
  status?: string | null;
  defaultComponent?: string | null;
  dataType?: string | null;
  rawContent?: string;
}

// --- Typed Render Block Interfaces (discriminated on `type`) ---

// Each interface narrows RenderBlockPayload.data to its concrete type.
// Use TypedRenderBlock instead of RenderBlockPayload when you need typed data.

export interface TextRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "text";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: TextBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface CodeRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "code";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: CodeBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface TableRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "table";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: TableBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface ThinkingRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "thinking";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: ThinkingBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface ReasoningRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "reasoning";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: ReasoningBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface ConsolidatedReasoningRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "consolidated_reasoning";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: ConsolidatedReasoningBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface ImageRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "image";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: ImageBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface VideoRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "video";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: VideoBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface TasksRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "tasks";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: TasksBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface TranscriptRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "transcript";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: TranscriptBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface StructuredInfoRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "structured_info";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface MatrxBrokerRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "matrxBroker";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: MatrxBrokerBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface QuestionnaireRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "questionnaire";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: QuestionnaireBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface FlashcardsRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "flashcards";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: FlashcardsBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface QuizRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "quiz";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: QuizBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface PresentationRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "presentation";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: PresentationBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface CookingRecipeRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "cooking_recipe";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: RecipeBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface TimelineRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "timeline";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: TimelineBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface ProgressTrackerRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "progress_tracker";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: ProgressTrackerBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface ComparisonTableRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "comparison_table";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: ComparisonBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface TroubleshootingRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "troubleshooting";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: TroubleshootingBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface ResourcesRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "resources";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: ResourcesBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface DecisionTreeRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "decision_tree";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: DecisionTreeBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface DecisionRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "decision";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface ResearchRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "research";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: ResearchBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface DiagramRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "diagram";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: DiagramBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface MermaidRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "mermaid";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: MermaidBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface MathProblemRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "math_problem";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: MathProblemBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface ArtifactRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "artifact";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface InfoRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "info";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: TextBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface TaskRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "task";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: TextBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface DatabaseRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "database";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: TextBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface PrivateRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "private";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: TextBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface PlanRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "plan";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: TextBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface EventRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "event";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: TextBlockData | null;
  metadata?: Record<string, unknown>;
}

export interface ToolRenderBlock {
  blockId: string;
  blockIndex: number;
  type: "tool";
  status: "streaming" | "complete" | "error";
  content?: string | null;
  data?: TextBlockData | null;
  metadata?: Record<string, unknown>;
}

export type TypedRenderBlock =
  | TextRenderBlock
  | CodeRenderBlock
  | TableRenderBlock
  | ThinkingRenderBlock
  | ReasoningRenderBlock
  | ConsolidatedReasoningRenderBlock
  | ImageRenderBlock
  | VideoRenderBlock
  | TasksRenderBlock
  | TranscriptRenderBlock
  | StructuredInfoRenderBlock
  | MatrxBrokerRenderBlock
  | QuestionnaireRenderBlock
  | FlashcardsRenderBlock
  | QuizRenderBlock
  | PresentationRenderBlock
  | CookingRecipeRenderBlock
  | TimelineRenderBlock
  | ProgressTrackerRenderBlock
  | ComparisonTableRenderBlock
  | TroubleshootingRenderBlock
  | ResourcesRenderBlock
  | DecisionTreeRenderBlock
  | DecisionRenderBlock
  | ResearchRenderBlock
  | DiagramRenderBlock
  | MermaidRenderBlock
  | MathProblemRenderBlock
  | ArtifactRenderBlock
  | InfoRenderBlock
  | TaskRenderBlock
  | DatabaseRenderBlock
  | PrivateRenderBlock
  | PlanRenderBlock
  | EventRenderBlock
  | ToolRenderBlock;

const TYPED_RENDER_BLOCK_TYPES = new Set<string>([
  "text", "code", "table", "thinking", "reasoning", "consolidated_reasoning", "image", "video", "tasks", "transcript", "structured_info", "matrxBroker", "questionnaire", "flashcards", "quiz", "presentation", "cooking_recipe", "timeline", "progress_tracker", "comparison_table", "troubleshooting", "resources", "decision_tree", "decision", "research", "diagram", "mermaid", "math_problem", "artifact", "info", "task", "database", "private", "plan", "event", "tool",
]);

export function isTypedRenderBlock(e: RenderBlockPayload): e is RenderBlockPayload & TypedRenderBlock {
  return TYPED_RENDER_BLOCK_TYPES.has(e.type);
}

// --- Message Part Models (cx_message.content[] items) ---

export interface TextPart {
  metadata?: Record<string, unknown>;
  type?: "text";
  text?: string;
  id?: string;
  citations?: unknown[];
}

export interface ThinkingPart {
  metadata?: Record<string, unknown>;
  type?: "thinking";
  text?: string;
  id?: string;
  provider?: "openai" | "anthropic" | "google" | "cerebras" | null;
  signature?: string | null;
  signature_encoding?: "base64" | null;
  summary?: unknown[];
}

export interface ToolCallPart {
  metadata?: Record<string, unknown>;
  type?: "tool_call";
  call_id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
}

export interface ToolResultPart {
  metadata?: Record<string, unknown>;
  type?: "tool_result";
  call_id?: string;
  tool_use_id?: string;
  name?: string;
  is_error?: boolean;
  output_chars?: number;
  output_preview?: Record<string, unknown> | null;
}

export interface ImageMediaPart {
  metadata?: Record<string, unknown>;
  origin?: "matrx" | "external" | null;
  file_id?: string | null;
  url?: string | null;
  file_uri?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  type?: "media";
  kind?: "image";
  width?: number | null;
  height?: number | null;
}

export interface AudioMediaPart {
  metadata?: Record<string, unknown>;
  origin?: "matrx" | "external" | null;
  file_id?: string | null;
  url?: string | null;
  file_uri?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  type?: "media";
  kind?: "audio";
  duration_ms?: number | null;
  transcription_result?: string | null;
}

export interface VideoMediaPart {
  metadata?: Record<string, unknown>;
  origin?: "matrx" | "external" | null;
  file_id?: string | null;
  url?: string | null;
  file_uri?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  type?: "media";
  kind?: "video";
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
}

export interface DocumentMediaPart {
  metadata?: Record<string, unknown>;
  origin?: "matrx" | "external" | null;
  file_id?: string | null;
  url?: string | null;
  file_uri?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  type?: "media";
  kind?: "document";
  width?: number | null;
  height?: number | null;
  page_count?: number | null;
}

export interface YouTubeMediaPart {
  metadata?: Record<string, unknown>;
  origin?: "external";
  file_id?: string | null;
  url: string;
  file_uri?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  type?: "media";
  kind?: "youtube";
  external_url?: string | null;
}

export interface CodeExecPart {
  metadata?: Record<string, unknown>;
  type?: "code_exec";
  language?: string;
  code?: string;
}

export interface CodeResultPart {
  metadata?: Record<string, unknown>;
  type?: "code_result";
  output?: string;
  outcome?: string;
}

export interface WebSearchPart {
  metadata?: Record<string, unknown>;
  type?: "web_search";
  id?: string;
  status?: string;
}

export interface PreFetchedUrl {
  url: string;
  textContent: string;
  title?: string | null;
  scrapedAt?: string | null;
  charCount?: number | null;
}

export interface WebpageInputPart {
  metadata?: Record<string, unknown>;
  type?: "input_webpage";
  urls?: (string | PreFetchedUrl)[];
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
}

export interface ResourceRefInput {
  id?: string | null;
  mode?: "reference" | "snapshot";
}

export interface NotesInputPart {
  metadata?: Record<string, unknown>;
  type?: "input_notes";
  note_ids?: (string | ResourceRefInput)[];
  template?: string;
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
}

export interface TaskInputPart {
  metadata?: Record<string, unknown>;
  type?: "input_task";
  task_ids?: (string | ResourceRefInput)[];
  template?: string;
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
}

export interface FullTableBookmark {
  type?: "full_table";
  table_id: string;
  table_name?: string | null;
}

export interface TableCellBookmark {
  type?: "table_cell";
  table_id: string;
  row_id: string;
  column_name: string;
  table_name?: string | null;
}

export interface TableColumnBookmark {
  type?: "table_column";
  table_id: string;
  column_name: string;
  table_name?: string | null;
}

export interface TableRowBookmark {
  type?: "table_row";
  table_id: string;
  row_id: string;
  table_name?: string | null;
}

export interface TableSchemaBookmark {
  type?: "table_schema";
  table_id: string;
  table_name?: string | null;
}

export interface TableInputPart {
  metadata?: Record<string, unknown>;
  type?: "input_table";
  bookmarks?: (FullTableBookmark | TableColumnBookmark | TableRowBookmark | TableCellBookmark | TableSchemaBookmark)[];
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
}

export interface FullListBookmark {
  type?: "full_list";
  list_id: string;
  list_name?: string | null;
}

export interface ListGroupBookmark {
  type?: "list_group";
  list_id: string;
  group_name: string;
  list_name?: string | null;
}

export interface ListItemBookmark {
  type?: "list_item";
  list_id: string;
  item_id: string;
  list_name?: string | null;
}

export interface ListInputPart {
  metadata?: Record<string, unknown>;
  type?: "input_list";
  bookmarks?: (FullListBookmark | ListGroupBookmark | ListItemBookmark)[];
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
}

export interface DataInputPart {
  metadata?: Record<string, unknown>;
  type?: "input_data";
  refs?: Record<string, unknown>[];
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
}

export interface ContextInputPart {
  metadata?: Record<string, unknown>;
  type?: "input_context";
  context_id?: string;
  context_name?: string;
  context_data?: Record<string, unknown>;
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
}

export type MessagePart =
  | TextPart
  | ThinkingPart
  | ToolCallPart
  | ToolResultPart
  | ImageMediaPart
  | AudioMediaPart
  | VideoMediaPart
  | DocumentMediaPart
  | YouTubeMediaPart
  | CodeExecPart
  | CodeResultPart
  | WebSearchPart
  | WebpageInputPart
  | NotesInputPart
  | TaskInputPart
  | TableInputPart
  | ListInputPart
  | DataInputPart
  | ContextInputPart;

/** Parse the content array from a cx_message DB row. */
export function parseMessageContent(content: unknown[]): MessagePart[] {
  return content as MessagePart[];
}

export interface ChunkEvent {
  event: "chunk";
  data: ChunkPayload;
}

export interface ReasoningChunkEvent {
  event: "reasoning_chunk";
  data: ReasoningChunkPayload;
}

export interface PhaseEvent {
  event: "phase";
  data: PhasePayload;
}

export interface WarningEvent {
  event: "warning";
  data: WarningPayload;
}

export interface InfoEvent {
  event: "info";
  data: InfoPayload;
}

export interface TypedDataEvent {
  event: "data";
  data: TypedDataPayload | UntypedDataPayload;
}

export interface InitEvent {
  event: "init";
  data: InitPayload;
}

export interface CompletionEvent {
  event: "completion";
  data: CompletionPayload;
}

export interface ErrorEvent {
  event: "error";
  data: ErrorPayload;
}

export interface ToolEventEvent {
  event: "tool_event";
  data: ToolEventPayload;
}

export interface BrokerEvent {
  event: "broker";
  data: BrokerPayload;
}

export interface HeartbeatEvent {
  event: "heartbeat";
  data: HeartbeatPayload;
}

export interface EndEvent {
  event: "end";
  data: EndPayload;
}

export interface RenderBlockEvent {
  event: "render_block";
  data: RenderBlockPayload;
}

export interface RecordReservedEvent {
  event: "record_reserved";
  data: RecordReservedPayload;
}

export interface RecordUpdateEvent {
  event: "record_update";
  data: RecordUpdatePayload;
}

export interface ResourceChangedEvent {
  event: "resource_changed";
  data: ResourceChangedPayload;
}

export interface ContextAnalysisEvent {
  event: "context_analysis";
  data: ContextAnalysisPayload;
}

export interface StructuredOutputEvent {
  event: "structured_output";
  data: StructuredOutputPayload;
}

export interface ContextStateEvent {
  event: "context_state";
  data: ContextStatePayload;
}

export interface ContextTrimmedEvent {
  event: "context_trimmed";
  data: ContextTrimmedPayload;
}

export interface InjectionConsumedEvent {
  event: "injection_consumed";
  data: InjectionConsumedPayload;
}

/** Discriminated union — `event.event === "chunk"` narrows `data` automatically. */
export type TypedStreamEvent =
  | ChunkEvent
  | ReasoningChunkEvent
  | PhaseEvent
  | WarningEvent
  | InfoEvent
  | TypedDataEvent
  | InitEvent
  | CompletionEvent
  | ErrorEvent
  | ToolEventEvent
  | BrokerEvent
  | HeartbeatEvent
  | EndEvent
  | RenderBlockEvent
  | RecordReservedEvent
  | RecordUpdateEvent
  | ResourceChangedEvent
  | ContextAnalysisEvent
  | StructuredOutputEvent
  | ContextStateEvent
  | ContextTrimmedEvent
  | InjectionConsumedEvent;

/**
 * @deprecated Use `TypedStreamEvent` instead — it provides automatic type narrowing
 * via the discriminated union so `event.event === "chunk"` narrows `data` to `ChunkPayload`.
 */
export type StreamEvent = TypedStreamEvent;

// Compact wire format for high-frequency events (90%+ of stream traffic).
// e = event type ("c" = chunk, "r" = reasoning_chunk), t = text content.
export interface CompactChunkEvent {
  e: "c";
  t: string;
}

export interface CompactReasoningChunkEvent {
  e: "r";
  t: string;
}

export type CompactStreamEvent = CompactChunkEvent | CompactReasoningChunkEvent;

/** A line from the NDJSON stream — either compact or standard format. */
export type RawStreamLine = CompactStreamEvent | TypedStreamEvent;

export function isCompactEvent(line: unknown): line is CompactStreamEvent {
  return typeof line === "object" && line !== null && "e" in line && "t" in line;
}

/** Normalize a compact event into the standard TypedStreamEvent shape. */
export function expandCompactEvent(compact: CompactStreamEvent): TypedStreamEvent {
  if (compact.e === "c") return { event: "chunk", data: { text: compact.t } };
  return { event: "reasoning_chunk", data: { text: compact.t } };
}

// Type guards (work on both TypedStreamEvent and the deprecated StreamEvent alias)
export function isChunkEvent(e: TypedStreamEvent): e is { event: "chunk"; data: ChunkPayload } {
  return e.event === "chunk";
}

export function isReasoningChunkEvent(e: TypedStreamEvent): e is { event: "reasoning_chunk"; data: ReasoningChunkPayload } {
  return e.event === "reasoning_chunk";
}

export function isPhaseEvent(e: TypedStreamEvent): e is { event: "phase"; data: PhasePayload } {
  return e.event === "phase";
}

export function isWarningEvent(e: TypedStreamEvent): e is { event: "warning"; data: WarningPayload } {
  return e.event === "warning";
}

export function isInfoEvent(e: TypedStreamEvent): e is { event: "info"; data: InfoPayload } {
  return e.event === "info";
}

export function isTypedDataEvent(e: TypedStreamEvent): e is { event: "data"; data: TypedDataPayload | UntypedDataPayload } {
  return e.event === "data";
}

export function isInitEvent(e: TypedStreamEvent): e is { event: "init"; data: InitPayload } {
  return e.event === "init";
}

export function isCompletionEvent(e: TypedStreamEvent): e is { event: "completion"; data: CompletionPayload } {
  return e.event === "completion";
}

export function isErrorEvent(e: TypedStreamEvent): e is { event: "error"; data: ErrorPayload } {
  return e.event === "error";
}

export function isToolEventEvent(e: TypedStreamEvent): e is { event: "tool_event"; data: ToolEventPayload } {
  return e.event === "tool_event";
}

export function isBrokerEvent(e: TypedStreamEvent): e is { event: "broker"; data: BrokerPayload } {
  return e.event === "broker";
}

export function isHeartbeatEvent(e: TypedStreamEvent): e is { event: "heartbeat"; data: HeartbeatPayload } {
  return e.event === "heartbeat";
}

export function isEndEvent(e: TypedStreamEvent): e is { event: "end"; data: EndPayload } {
  return e.event === "end";
}

export function isRenderBlockEvent(e: TypedStreamEvent): e is { event: "render_block"; data: RenderBlockPayload } {
  return e.event === "render_block";
}

export function isRecordReservedEvent(e: TypedStreamEvent): e is { event: "record_reserved"; data: RecordReservedPayload } {
  return e.event === "record_reserved";
}

export function isRecordUpdateEvent(e: TypedStreamEvent): e is { event: "record_update"; data: RecordUpdatePayload } {
  return e.event === "record_update";
}

export function isResourceChangedEvent(e: TypedStreamEvent): e is { event: "resource_changed"; data: ResourceChangedPayload } {
  return e.event === "resource_changed";
}

export function isContextAnalysisEvent(e: TypedStreamEvent): e is { event: "context_analysis"; data: ContextAnalysisPayload } {
  return e.event === "context_analysis";
}

export function isStructuredOutputEvent(e: TypedStreamEvent): e is { event: "structured_output"; data: StructuredOutputPayload } {
  return e.event === "structured_output";
}

export function isContextStateEvent(e: TypedStreamEvent): e is { event: "context_state"; data: ContextStatePayload } {
  return e.event === "context_state";
}

export function isContextTrimmedEvent(e: TypedStreamEvent): e is { event: "context_trimmed"; data: ContextTrimmedPayload } {
  return e.event === "context_trimmed";
}

export function isInjectionConsumedEvent(e: TypedStreamEvent): e is { event: "injection_consumed"; data: InjectionConsumedPayload } {
  return e.event === "injection_consumed";
}

export function isCompactChunkEvent(e: unknown): e is CompactChunkEvent {
  return typeof e === "object" && e !== null && (e as CompactChunkEvent).e === "c" && typeof (e as CompactChunkEvent).t === "string";
}

export function isCompactReasoningChunkEvent(e: unknown): e is CompactReasoningChunkEvent {
  return typeof e === "object" && e !== null && (e as CompactReasoningChunkEvent).e === "r" && typeof (e as CompactReasoningChunkEvent).t === "string";
}

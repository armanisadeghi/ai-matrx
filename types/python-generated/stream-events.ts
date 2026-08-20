// AUTO-GENERATED — do not edit manually.
// Sources:
//   matrx_connect.context.*  — stream event types
//   matrx_ai.db.message_parts — cx_message.content[] types
// Run: uv run python scripts/generate_types.py stream

export const EventType = {
  CHUNK: "chunk",
  REASONING_CHUNK: "reasoning_chunk",
  REASONING: "reasoning",
  PHASE: "phase",
  WARNING: "warning",
  INFO: "info",
  DATA: "data",
  INIT: "init",
  COMPLETION: "completion",
  ERROR: "error",
  TOOL_EVENT: "tool_event",
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
  PROVIDER_RETRY: "provider_retry",
  CITATION: "citation",
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

export interface CitationPayload {
  block_index?: number | null;
  citation: Record<string, unknown>;
}

export interface ReasoningChunkPayload {
  text: string;
}

export interface ReasoningPayload {
  state: "started" | "stopped";
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

export interface ProviderRetryPayload {
  state: "scheduled" | "retrying_now" | "cancelled" | "suspended" | "recovered";
  provider: string;
  error_type: string;
  message: string;
  user_message: string;
  status_code?: number | null;
  model?: string | null;
  request_id?: string | null;
  conversation_id?: string | null;
  iteration: number;
  failed_attempt: number;
  next_attempt?: number | null;
  max_retries: number;
  retry_delay?: number | null;
  retry_at?: number | null;
  discard_partial_output?: boolean;
  schedule?: number[];
  can_cancel?: boolean;
  can_retry_now?: boolean;
  actions?: Record<string, string>;
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
  kind?: string | null;
  kind_version?: number | null;
  kind_checked?: boolean;
  kind_errors?: string[];
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
// Server guarantees these shapes for message, request, tool_call.

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
  table: "message";
  parent_refs: CxMessageReservedParentRefs;
  metadata: CxMessageReservedMetadata;
};

export type CxRequestReservedPayload = RecordReservedPayload & {
  table: "request";
  parent_refs: CxRequestReservedParentRefs;
  metadata: CxRequestReservedMetadata;
};

export type CxToolCallReservedPayload = RecordReservedPayload & {
  table: "tool_call";
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
  return p.table === "message" || p.table === "request" || p.table === "tool_call";
}

/** Narrows to CxMessageReservedPayload — `metadata.role` and `metadata.position` are guaranteed. */
export function isCxMessageReservation(p: RecordReservedPayload): p is CxMessageReservedPayload {
  return p.table === "message";
}

/** Narrows to CxRequestReservedPayload — `metadata.iteration` is guaranteed. */
export function isCxRequestReservation(p: RecordReservedPayload): p is CxRequestReservedPayload {
  return p.table === "request";
}

/** Narrows to CxToolCallReservedPayload — `metadata.tool_name`, `metadata.call_id`, and `metadata.iteration` are guaranteed. */
export function isCxToolCallReservation(p: RecordReservedPayload): p is CxToolCallReservedPayload {
  return p.table === "tool_call";
}

// --- Typed Data Payloads ---

export interface DataPayload {
  type: string;
}

export interface AssignmentProgressData {
  type?: "assignment_progress";
  session_id: string;
  completed: number;
  total: number;
  status: "pending" | "running" | "completed" | "partially_failed" | "failed" | "cancelled";
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
  encoding?: "pcm_s16le" | "mp3";
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

export interface JsonValue {
}

export interface ClaudeManagedSdkMessageData {
  type?: "claude_managed_sdk_message";
  runtime_id: string;
  session_id: string;
  sdk_message_type: string;
  message: Record<string, JsonValue>;
}

export interface ClaudeManagedWarningData {
  type?: "claude_managed_warning";
  code: string;
  runtime_id: string;
  session_id: string;
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

export interface ContextConflictData {
  type?: "context_conflict";
  key: string;
  command: string;
  source_kind?: string;
  source_id?: string | null;
  base_version?: number | null;
}

export interface ContextDeltaData {
  type?: "context_delta";
  key: string;
  command: string;
  object_type?: string;
  source_kind?: string;
  source_id?: string | null;
  seq?: number;
  delta_kind?: "splice" | "full";
  start?: number | null;
  end?: number | null;
  text?: string | null;
  base_len?: number | null;
  new_len?: number;
  content?: string | null;
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
  materialized?: boolean;
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

export interface DictionaryPublishCompleteData {
  type?: "dictionary_publish_complete";
  status: string;
  level: string;
  owner_id?: string | null;
  external_id?: string | null;
  version_id?: string | null;
  rule_count?: number;
  rules_hash?: string | null;
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

export interface ExtractionIndexCompleteData {
  type?: "extraction_index_complete";
  run_id: string;
  job_id: string;
  derivative_id: string;
  derivative_outcome: string;
  results_total: number;
  chunks_written: number;
  chunks_skipped: number;
  priority_applied: number;
  agent_id?: string | null;
  embedding_model: string;
}

export interface ExtractionIndexProgressData {
  type?: "extraction_index_progress";
  run_id: string;
  stage: string;
  message?: string;
  results_total?: number;
  chunks_built?: number;
  chunks_skipped?: number;
  embedded?: number;
  total_to_embed?: number;
}

export interface FetchResultItem {
  [key: string]: unknown;
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

export interface FileAnalysisCompleteData {
  type?: "file_analysis_complete";
  file_id: string;
  status: string;
  results_count?: number;
  failures?: string[];
  elapsed_ms?: number;
  head?: Record<string, unknown>;
  results?: Record<string, unknown>[];
}

export interface FileAnalysisStartedData {
  type?: "file_analysis_started";
  file_id: string;
  mime_type?: string | null;
  total_detectors: number;
}

export interface FileDetectorCompletedData {
  type?: "file_detector_completed";
  file_id: string;
  detector_kind: string;
  tier: string;
  status: string;
  elapsed_ms?: number;
  error?: string | null;
  complete: number;
  total: number;
}

export interface FileSearchBboxItem {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FileSearchHitItem {
  page_number: number;
  page_id?: string | null;
  bbox: FileSearchBboxItem;
  snippet: string;
  matched_text: string;
  char_start?: number | null;
  char_end?: number | null;
}

export interface FileSearchCompleteData {
  type?: "file_search_complete";
  file_id: string;
  query: string;
  regex?: boolean;
  case_sensitive?: boolean;
  hits?: FileSearchHitItem[];
  truncated?: boolean;
  pages_scanned?: number;
  total_pages?: number;
}

export interface FileSearchPageData {
  type?: "file_search_page";
  page_number: number;
  total_pages: number;
  hits?: FileSearchHitItem[];
  total_hits?: number;
}

export interface FileSearchStartedData {
  type?: "file_search_started";
  file_id: string;
  query: string;
  regex?: boolean;
  case_sensitive?: boolean;
  total_pages: number;
}

export interface FunctionResultData {
  type?: "function_result";
  function_name: string;
  success: boolean;
  result?: unknown;
  error?: string | null;
  duration_ms?: number | null;
}

export interface ImageDocumentDetectedData {
  type?: "image_document_detected";
  found: boolean;
  top_left?: unknown[] | null;
  top_right?: unknown[] | null;
  bottom_right?: unknown[] | null;
  bottom_left?: unknown[] | null;
  confidence?: number;
  image_width?: number;
  image_height?: number;
}

export interface ImageEditCompleteData {
  type?: "image_edit_complete";
  op: string;
  file_id?: string | null;
  asset?: Record<string, unknown>;
}

export interface GeneratedImageFileItem {
  cloud_file_id: string;
  public_url?: string | null;
  mime?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface ImageGenerateCompleteData {
  type?: "image_generate_complete";
  prompt?: string;
  model?: string | null;
  files?: GeneratedImageFileItem[];
}

export interface ImageOpStageData {
  type?: "image_op_stage";
  op: string;
  stage: string;
  detail?: string | null;
  source_id?: string | null;
  mask_id?: string | null;
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

export interface ImageStudioCommitCompleteData {
  type?: "image_studio_commit_complete";
  job_id: string;
  folder_path: string;
  saved_count?: number;
  failed_count?: number;
  result?: Record<string, unknown>;
}

export interface ImageStudioCommitItemData {
  type?: "image_studio_commit_item";
  job_id: string;
  preset_id: string;
  status: string;
  file_id?: string | null;
  filename?: string | null;
  file_path?: string | null;
  size?: number | null;
  public_url?: string | null;
  error?: string | null;
  completed?: number;
  total?: number;
}

export interface ImageStudioProcessCompleteData {
  type?: "image_studio_process_complete";
  job_id: string;
  result?: Record<string, unknown>;
}

export interface ImageStudioVariantData {
  type?: "image_studio_variant";
  job_id: string;
  preset_id: string;
  filename?: string | null;
  format?: string | null;
  width?: number | null;
  height?: number | null;
  quality?: number | null;
  size?: number | null;
  signed_url?: string | null;
  expires_in?: number | null;
  compression_ratio?: number | null;
  notes?: string[];
  error?: string | null;
  completed?: number;
  total?: number;
}

export interface LegalSyncEventData {
  type?: "legal_sync_event";
  phase: string;
  run_id?: string | null;
  resource?: string | null;
  resources?: string[] | null;
  court_id?: string | null;
  court_ids?: string[] | null;
  cluster_id?: number | null;
  cluster_count?: number | null;
  rows?: number | null;
  court_rows?: number | null;
  total_rows?: number | null;
  rows_pumped?: number | null;
  rows_inserted?: number | null;
  bytes_received?: number | null;
  s3_key?: string | null;
  size_bytes?: number | null;
  dump_date?: string | null;
  bucket?: string | null;
  table?: string | null;
  target?: string | null;
  batch_size?: number | null;
  last_id?: number | null;
  reason?: string | null;
  per_court_counts?: Record<string, number> | null;
  per_court_errors?: Record<string, string> | null;
  per_cluster_errors?: Record<string, string> | null;
  per_resource_rows?: Record<string, number> | null;
  per_resource_errors?: Record<string, string> | null;
  error?: string | null;
}

export interface MasterworkAuditionProgressData {
  type?: "masterwork_audition_progress";
  step: string;
  message: string;
}

export interface AuditionRuleFinding {
  rule_id: string;
  winner: string;
  note?: string;
}

export interface MasterworkAuditionVerdictData {
  type?: "masterwork_audition_verdict";
  rulebook_id: string;
  verdict: string;
  summary: string;
  findings?: AuditionRuleFinding[];
  gaps?: string[];
  gaps_captured?: number;
  rulebook_version?: number | null;
  quality_score?: number | null;
  judge_confidence?: number | null;
  vanilla_compared?: boolean;
  vanilla_score?: number | null;
  vanilla_verdict?: string | null;
  vanilla_findings?: AuditionRuleFinding[];
  vanilla_text?: string | null;
  vanilla_model?: string | null;
  vanilla_error?: string | null;
  beat_vanilla_rules?: number | null;
  lost_to_vanilla_rules?: number | null;
  vanilla_rules_compared?: number | null;
  verdict_sentence?: string | null;
}

export interface MasterworkBuildCompleteData {
  type?: "masterwork_build_complete";
  workflow_id: string;
  name: string;
  masterwork_kind: string;
  rulebook_id: string;
  rulebook_slug: string;
  rulebook_version: number;
  agent_ids?: string[];
}

export interface MasterworkBuildProgressData {
  type?: "masterwork_build_progress";
  step: string;
  message: string;
  agent_id?: string | null;
  agent_name?: string | null;
}

export interface CheckupFinding {
  id: string;
  kind: string;
  target_rule_id?: string | null;
  proposed?: Record<string, unknown> | null;
  alternatives?: Record<string, unknown>[];
  reason?: string;
  evidence?: string;
  evidence_ref?: Record<string, unknown>;
  confidence?: number;
  source?: string;
  content_ir?: Record<string, unknown> | null;
}

export interface MasterworkCheckupCompleteData {
  type?: "masterwork_checkup_complete";
  rulebook_id: string;
  rulebook_version: number;
  findings?: CheckupFinding[];
  producers_run?: string[];
  producers_failed?: string[];
  evidence_rejected?: number;
  already_dismissed?: number;
  corpus_segments?: number;
  corpus_chars?: number;
  corpus_cleaned?: boolean;
  notes?: string[];
}

export interface MasterworkCheckupFindingData {
  type?: "masterwork_checkup_finding";
  rulebook_id: string;
  finding: CheckupFinding;
  content_ir?: Record<string, unknown> | null;
}

export interface MasterworkCheckupProgressData {
  type?: "masterwork_checkup_progress";
  step: string;
  message: string;
  producer?: string | null;
  findings_found?: number | null;
  findings_dropped?: number | null;
}

export interface MasterworkCorpusCleanedData {
  type?: "masterwork_corpus_cleaned";
  rulebook_id: string;
  rulebook_version: number;
  segments?: number;
  cleaned?: number;
  reused?: number;
  failed?: number;
  total_chars?: number;
  text?: string;
}

export interface MasterworkCorpusProgressData {
  type?: "masterwork_corpus_progress";
  step: string;
  message: string;
  segment_label?: string | null;
  segment_index?: number | null;
  total_segments?: number | null;
}

export interface MasterworkDumpResourceOutcome {
  kind: string;
  token?: string | null;
  id?: string | null;
  url?: string | null;
  title?: string | null;
  status: string;
  rules_added?: number;
  duplicates?: number;
  error?: string | null;
}

export interface MasterworkDumpCompleteData {
  type?: "masterwork_dump_complete";
  rulebook_id: string;
  rulebook_version: number;
  added?: number;
  duplicates_skipped?: number;
  quotes_verified?: number;
  quotes_unverified?: number;
  resources?: MasterworkDumpResourceOutcome[];
}

export interface MasterworkDumpProgressData {
  type?: "masterwork_dump_progress";
  step: string;
  message: string;
  resource_index: number;
  resource_count: number;
  kind?: string | null;
  token?: string | null;
  id?: string | null;
  url?: string | null;
  title?: string | null;
  rules_added?: number | null;
  rules_added_total?: number;
}

export interface MasterworkIngestCompleteData {
  type?: "masterwork_ingest_complete";
  rulebook_id: string;
  rulebook_version: number;
  added?: number;
  duplicates_skipped?: number;
  quotes_verified?: number;
  quotes_unverified?: number;
  followup_seed?: string | null;
}

export interface MasterworkIngestProgressData {
  type?: "masterwork_ingest_progress";
  step: string;
  message: string;
  chunk_index?: number | null;
  total_chunks?: number | null;
  rules_found?: number | null;
}

export interface MasterworkRunData {
  type?: "masterwork_run";
  run_id: string;
  rulebook_id: string;
  operation: string;
  label?: string | null;
}

export interface MasterworkRunFailedData {
  type?: "masterwork_run_failed";
  run_id: string;
  error?: Record<string, unknown> | null;
}

export interface MasterworkRunSnapshotData {
  type?: "masterwork_run_snapshot";
  run_id: string;
  rulebook_id: string;
  operation: string;
  label?: string | null;
  status: string;
  live?: boolean;
  error?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  completed_at?: string | null;
}

export interface MasterworkShortlistItem {
  key: string;
  reason?: string;
}

export interface MasterworkShortlistData {
  type?: "masterwork_shortlist";
  selected?: MasterworkShortlistItem[];
  considered?: number;
}

export interface AudioBlock {
  origin: "matrx" | "external";
  file_id?: string | null;
  visibility?: "personal" | "internal" | "link" | "public" | null;
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
  visibility?: "personal" | "internal" | "link" | "public" | null;
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
  visibility?: "personal" | "internal" | "link" | "public" | null;
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

export interface VideoBlock {
  origin: "matrx" | "external";
  file_id?: string | null;
  visibility?: "personal" | "internal" | "link" | "public" | null;
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
  visibility?: "personal" | "internal" | "link" | "public" | null;
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

export interface PdfPageClassificationItem {
  page_number: number;
  page_class: string;
  confidence: number;
  indicators?: string[];
}

export interface PdfClassifyCompleteData {
  type?: "pdf_classify_complete";
  page_count: number;
  pages?: PdfPageClassificationItem[];
  classifier_version?: string;
}

export interface PdfCleanStartedData {
  type?: "pdf_clean_started";
  mode?: "per_page" | "aggregate";
  doc_id: string;
  total_pages?: number;
}

export interface PdfExtractCompleteData {
  type?: "pdf_extract_complete";
  filename?: string | null;
  page_count: number;
  ocr_pages: number;
  total_chars: number;
  text_content: string;
  file_id?: string | null;
}

export interface PdfExtractStartedData {
  type?: "pdf_extract_started";
  filename?: string | null;
  total_pages: number;
}

export interface PdfPageClassifiedData {
  type?: "pdf_page_classified";
  page_number: number;
  total_pages: number;
  page_class: string;
  confidence: number;
  indicators?: string[];
}

export interface PdfPageExtractedData {
  type?: "pdf_page_extracted";
  page_number: number;
  total_pages: number;
  extraction_method: string;
  char_count: number;
  preview?: string;
}

export interface PdfPipelineResultData {
  type?: "pdf_pipeline_result";
  raw_text?: string | null;
  page_count?: number;
  chunks?: string[] | null;
  ai_processed?: Record<string, unknown>[] | null;
  cloud_uri?: string | null;
  file_id?: string | null;
}

export interface PdfReadingOrderBlockItem {
  block_index: number;
  column_index: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  text: string;
}

export interface PdfReadingOrderPageItem {
  page_number: number;
  column_count: number;
  blocks_in_order?: PdfReadingOrderBlockItem[];
}

export interface PdfReadingOrderCompleteData {
  type?: "pdf_reading_order_complete";
  page_count: number;
  pages?: PdfReadingOrderPageItem[];
}

export interface PdfReadingOrderPageData {
  type?: "pdf_reading_order_page";
  page_number: number;
  total_pages: number;
  column_count: number;
  block_count: number;
  preview?: string;
}

export interface PdfRepeatedRegionBboxItem {
  page_number: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  raw_text?: string;
}

export interface PdfRepeatedRegionItem {
  region_id: string;
  kind: string;
  text_template: string;
  pages?: number[];
  bbox_per_page?: PdfRepeatedRegionBboxItem[];
  confidence: number;
}

export interface PdfRepeatedRegionsCompleteData {
  type?: "pdf_repeated_regions_complete";
  page_count: number;
  regions?: PdfRepeatedRegionItem[];
  detector_version?: string;
}

export interface PdfRepeatedRegionsProgressData {
  type?: "pdf_repeated_regions_progress";
  stage: "detect" | "extract_text" | "strip";
  page_number: number;
  total_pages: number;
}

export interface PdfRepeatedRegionsStripCompleteData {
  type?: "pdf_repeated_regions_strip_complete";
  page_count: number;
  pages_text?: string[];
  regions?: PdfRepeatedRegionItem[];
  detector_version?: string;
  stripped_region_ids?: string[];
}

export interface PdfTableExtractedData {
  type?: "pdf_table_extracted";
  page_number: number;
  total_pages: number;
  table_index: number;
  row_count: number;
  column_count: number;
  markdown_preview?: string;
}

export interface PdfExtractedTableItem {
  page_number: number;
  table_index: number;
  bbox: PdfTableBboxItem;
  row_count: number;
  column_count: number;
  header?: (string | null)[];
  rows?: (string | null)[][];
  markdown?: string;
}

export interface PdfTableBboxItem {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PdfTablesCompleteData {
  type?: "pdf_tables_complete";
  page_count: number;
  table_count: number;
  tables?: PdfExtractedTableItem[];
  detector?: string;
  detector_version?: string;
}

export interface PdfTablesPageData {
  type?: "pdf_tables_page";
  page_number: number;
  total_pages: number;
  tables_found: number;
}

export interface PdfTablesStartedData {
  type?: "pdf_tables_started";
  filename?: string | null;
  total_pages: number;
}

export interface PlanBriefDraftData {
  type?: "plan_brief_draft";
  node_id: string;
  route?: string;
  brief?: string[];
  angle?: string;
  must_not_cover?: string[];
  concerns?: string[];
  suggested_word_count?: number | null;
  accepted?: boolean;
}

export interface PlanCmsFillPreviewData {
  type?: "plan_cms_fill_preview";
  node_id: string;
  page_id: string;
  route?: string;
  title?: string;
  html?: string;
  css?: string;
  meta_title?: string;
  meta_description?: string;
  model?: string;
  wrote?: boolean;
  is_published?: boolean;
  write_target?: "live" | "draft";
  global_css?: string;
  header_html?: string;
  footer_html?: string;
}

export interface PlanDeepenResultData {
  type?: "plan_deepen_result";
  node_id: string;
  route?: string;
  brief_lines?: number;
  sources_attached?: number;
}

export interface PlanGenAppliedData {
  type?: "plan_gen_applied";
  site_id: string;
  created: number;
  existing: number;
  failed: number;
  errors?: string[];
  dry_run?: boolean;
}

export interface PlanGenCandidateData {
  type?: "plan_gen_candidate";
  angle: string;
  node_count: number;
  rationale?: string;
}

export interface PlanGenMergedData {
  type?: "plan_gen_merged";
  node_count: number;
  summary?: string;
  candidates_used?: number;
}

export interface PlanGenStartedData {
  type?: "plan_gen_started";
  site_id: string;
  domain: string;
  angles?: string[];
  keyword_count?: number;
}

export interface PlanPageStepResultData {
  type?: "plan_page_step_result";
  node_id: string;
  step: string;
  route?: string;
  artifact_id?: string;
  run_id?: string;
  summary?: string;
}

export interface PlanSetupAgentResultData {
  type?: "plan_setup_agent_result";
  site_id: string;
  kind: string;
  run_id: string;
  item_count?: number;
  summary?: string;
  model_id?: string | null;
}

export interface PodcastAssetEvent {
  type?: "podcast_asset";
  asset_kind: "image" | "video";
  index: number;
  url?: string;
  prompt?: string;
  success?: boolean;
  error?: string | null;
  note?: string | null;
}

export interface PodcastAssetGenStartedEvent {
  type?: "podcast_asset_gen_started";
  run_id: string;
  asset_kind: "image" | "video";
  slot: number;
  prompt?: string;
  model_alias?: string | null;
  is_manual?: boolean;
}

export interface PodcastAssetResultEvent {
  type?: "podcast_asset_result";
  run_id: string;
  asset_id?: string | null;
  asset_kind: "image" | "video";
  slot: number;
  status: string;
  url?: string | null;
  file_id?: string | null;
  prompt?: string | null;
  model_alias?: string | null;
  is_manual?: boolean;
  error?: string | null;
}

export interface PodcastCompleteEvent {
  type?: "podcast_complete";
  show_id: string;
  success: boolean;
  episode_id?: string | null;
  episode_slug?: string | null;
  script?: string;
  audio_url?: string;
  title?: string;
  description?: string;
  image_urls?: string[];
  video_urls?: string[];
  audio_file_id?: string;
  image_file_ids?: string[];
  video_file_ids?: string[];
  official_video_file_id?: string;
  official_video_url?: string;
  official_video_error?: string;
  run_mode?: string;
  host_count?: number;
  speakers?: Record<string, unknown>[];
  error?: string | null;
}

export interface PodcastMetadataEvent {
  type?: "podcast_metadata";
  title?: string;
  description?: string;
  image_descriptions?: string[];
  video_descriptions?: string[];
}

export interface PodcastOfficialVideoEvent {
  type?: "podcast_official_video";
  url?: string;
  success?: boolean;
  error?: string | null;
}

export interface PodcastRunEvent {
  type?: "podcast_run";
  run_id?: string;
  total?: number;
}

export interface PodcastStageEvent {
  type?: "podcast_stage";
  stage: string;
  label?: string;
  success: boolean;
  output?: string;
  error?: string | null;
  step?: number;
  total?: number;
}

export interface PodcastStageStartedEvent {
  type?: "podcast_stage_started";
  stage: string;
  label?: string;
  step?: number;
  total?: number;
}

export interface PodcastTickEvent {
  type?: "podcast_tick";
  stage: string;
  label?: string;
  elapsed_seconds?: number;
  step?: number;
  total?: number;
}

export interface RagVerifyClaimsData {
  type?: "rag_verify_claims";
  claims?: string[];
  count: number;
  judge_model: string;
}

export interface RagVerifyClaimItem {
  claim: string;
  verdict: string;
  confidence: number;
  supporting_chunk_ids?: string[];
  reasoning?: string;
}

export interface RagVerifyResultData {
  type?: "rag_verify_result";
  claims?: RagVerifyClaimItem[];
  overall_faithfulness: number;
  judge_model: string;
  latency_ms: number;
}

export interface RagVerifyVerdictData {
  type?: "rag_verify_verdict";
  index: number;
  claim: string;
  verdict: string;
  confidence: number;
  supporting_chunk_ids?: string[];
  reasoning?: string;
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
  [key: string]: unknown;
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

export interface WorkflowNodeTestResultData {
  type?: "workflow_node_test_result";
  success: boolean;
  duration_ms: number;
  node_id: string;
  spec_type: string;
  output?: Record<string, unknown> | null;
  error_type?: string | null;
  error_message?: string | null;
}

export interface WorkflowStepData {
  type?: "workflow_step";
  step_name: string;
  status: string;
  data?: Record<string, unknown>;
}

export type TypedDataPayload =
  | AssignmentProgressData
  | AudioOutputData
  | AudioStreamChunkData
  | AudioStreamEndData
  | CategorizationResultData
  | ClaudeManagedSdkMessageData
  | ClaudeManagedWarningData
  | ContextChangedData
  | ContextConflictData
  | ContextDeltaData
  | ContextPersistFailedData
  | ContextPersistedData
  | ConversationIdData
  | ConversationLabeledData
  | DictionaryPublishCompleteData
  | ExtractionIndexCompleteData
  | ExtractionIndexProgressData
  | FetchResultsData
  | FileAnalysisCompleteData
  | FileAnalysisStartedData
  | FileDetectorCompletedData
  | FileSearchCompleteData
  | FileSearchPageData
  | FileSearchStartedData
  | FunctionResultData
  | ImageDocumentDetectedData
  | ImageEditCompleteData
  | ImageGenerateCompleteData
  | ImageOpStageData
  | ImageOutputData
  | ImageStudioCommitCompleteData
  | ImageStudioCommitItemData
  | ImageStudioProcessCompleteData
  | ImageStudioVariantData
  | LegalSyncEventData
  | MasterworkAuditionProgressData
  | MasterworkAuditionVerdictData
  | MasterworkBuildCompleteData
  | MasterworkBuildProgressData
  | MasterworkCheckupCompleteData
  | MasterworkCheckupFindingData
  | MasterworkCheckupProgressData
  | MasterworkCorpusCleanedData
  | MasterworkCorpusProgressData
  | MasterworkDumpCompleteData
  | MasterworkDumpProgressData
  | MasterworkIngestCompleteData
  | MasterworkIngestProgressData
  | MasterworkRunData
  | MasterworkRunFailedData
  | MasterworkRunSnapshotData
  | MasterworkShortlistData
  | MediaBlockData
  | MediaNoticeData
  | MemoryBufferSpawnedData
  | MemoryContextInjectedData
  | MemoryErrorData
  | MemoryObserverCompletedData
  | MemoryReflectorCompletedData
  | PartialImageData
  | PdfClassifyCompleteData
  | PdfCleanStartedData
  | PdfExtractCompleteData
  | PdfExtractStartedData
  | PdfPageClassifiedData
  | PdfPageExtractedData
  | PdfPipelineResultData
  | PdfReadingOrderCompleteData
  | PdfReadingOrderPageData
  | PdfRepeatedRegionsCompleteData
  | PdfRepeatedRegionsProgressData
  | PdfRepeatedRegionsStripCompleteData
  | PdfTableExtractedData
  | PdfTablesCompleteData
  | PdfTablesPageData
  | PdfTablesStartedData
  | PlanBriefDraftData
  | PlanCmsFillPreviewData
  | PlanDeepenResultData
  | PlanGenAppliedData
  | PlanGenCandidateData
  | PlanGenMergedData
  | PlanGenStartedData
  | PlanPageStepResultData
  | PlanSetupAgentResultData
  | PodcastAssetEvent
  | PodcastAssetGenStartedEvent
  | PodcastAssetResultEvent
  | PodcastCompleteEvent
  | PodcastMetadataEvent
  | PodcastOfficialVideoEvent
  | PodcastRunEvent
  | PodcastStageEvent
  | PodcastStageStartedEvent
  | PodcastTickEvent
  | QuestionnaireDisplayData
  | RagVerifyClaimsData
  | RagVerifyResultData
  | RagVerifyVerdictData
  | ScrapeBatchCompleteData
  | SearchErrorData
  | SearchResultsData
  | StructuredInputWarningData
  | VideoOutputData
  | WorkflowNodeTestResultData
  | WorkflowStepData;

/** Fallback for data events whose `type` isn't in TypedDataPayload. */
export interface UntypedDataPayload {
  [key: string]: unknown;
  type: string;
}

// --- Conversation Value Store Events (kind-discriminated data events) ---

export interface ValueDescriptor {
  key: string;
  description: string;
  kind: string;
  chars: number;
  truncated?: boolean;
  preview?: string;
  json_keys?: string[] | null;
  fence: string;
}

export interface ValueStoredEvent {
  kind?: "value_store.stored";
  conversation_id: string;
  descriptor: ValueDescriptor;
  source_agent_id?: string | null;
  source_call_id?: string | null;
}

export interface ContextGroomedEvent {
  kind?: "value_store.groomed";
  conversation_id: string;
  stubbed_keys?: string[];
  retained_keys?: string[];
  source: string;
}

export type ValueStoreDataEvent = ValueStoredEvent | ContextGroomedEvent;

/** Narrows a `data` event payload to ValueStoredEvent (a sub-agent result landed in the store). */
export function isValueStoredEvent(value: unknown): value is ValueStoredEvent {
  return typeof value === "object" && value !== null
    && (value as { kind?: unknown }).kind === "value_store.stored";
}

/** Narrows a `data` event payload to ContextGroomedEvent (model-view groom stamps applied). */
export function isContextGroomedEvent(value: unknown): value is ContextGroomedEvent {
  return typeof value === "object" && value !== null
    && (value as { kind?: unknown }).kind === "value_store.groomed";
}

// --- SEO Streamed Result Models (kind-discriminated data events) ---

export interface KeywordClassifyResult {
  result_kind?: "keywords.classify";
  eligible?: number;
  batches?: number;
  updated?: number;
  skipped_error?: number;
  missing_keyword_ids?: string[];
}

export interface KeywordResearchArtifact {
  primary_keyword: string;
  keyword_lists?: KeywordResearchList[];
}

export interface KeywordResearchIngestSummary {
  primary_keyword_ids?: string[];
  keywords_created?: number;
  keywords_already_existed?: number;
  edges_written?: number;
  edges_skipped_rejected?: number;
  edges_skipped_self?: number;
}

export interface KeywordResearchList {
  label: string;
  keywords?: string[];
}

export interface KeywordVolumeBatchFailure {
  batch_index: number;
  keyword_count: number;
  error: string;
}

export interface KeywordVolumeBatchReceipt {
  run_id: string;
  keyword_count: number;
  created_observations?: number;
  existing_observations?: number;
  from_cache?: boolean;
}

export interface KeywordVolumeRefreshResult {
  result_kind?: "keywords.volume_refresh";
  requested_phrases?: number;
  skipped_fresh?: number;
  fetched_phrases?: number;
  rejected_phrases?: KeywordVolumeRejectedPhrase[];
  batches?: KeywordVolumeBatchReceipt[];
  failed_batches?: KeywordVolumeBatchFailure[];
}

export interface KeywordVolumeRejectedPhrase {
  phrase: string;
  reason: string;
}

export interface KeywordResearchResult {
  result_kind?: "keywords.relationship_research";
  primary_keyword: string;
  research_doc_id: string;
  artifact: KeywordResearchArtifact;
  ingest: KeywordResearchIngestSummary;
  volume?: KeywordVolumeRefreshResult | null;
  classification?: KeywordClassifyResult | null;
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
  known_cost_subtotal?: number;
  provider_reported_requests?: number;
  catalog_priced_requests?: number;
  unknown_cost_requests?: number;
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
  result?: JsonValue;
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
  result?: JsonValue;
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
  requested_type?: string | null;
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
  "text", "code", "table", "thinking", "reasoning", "consolidated_reasoning", "image", "video", "tasks", "transcript", "structured_info", "questionnaire", "flashcards", "quiz", "presentation", "cooking_recipe", "timeline", "progress_tracker", "comparison_table", "troubleshooting", "resources", "decision_tree", "decision", "research", "diagram", "mermaid", "math_problem", "artifact", "info", "task", "database", "private", "plan", "event", "tool",
]);

export function isTypedRenderBlock(e: RenderBlockPayload): e is RenderBlockPayload & TypedRenderBlock {
  return TYPED_RENDER_BLOCK_TYPES.has(e.type);
}

// --- Server Data-Event Render Blocks (FE-synthesized wrappers) ---

// NOT render_block wire events — the frontend synthesizes these block wrappers
// when it converts a `data` stream event (or FE parse state) into a renderable
// block. Generated from matrx_connect.context.data_render_blocks; classified per
// the content-vocab crosswalk. Protocol/lifecycle events live in their own union
// (ServerProtocolRenderBlock) and are never mixed into Shape blocks.

export interface SearchReplaceRenderData {
  search: string;
  replace: string;
  searchComplete: boolean;
  replaceComplete: boolean;
  isComplete: boolean;
  language?: string | null;
}

export interface UnknownDataEventData {
  [key: string]: unknown;
  _dataType: string;
}

/** Audio output from the AI (TTS or file). */
export interface AudioOutputRenderBlock {
  type: "audio_output";
  content: string;
  data: AudioOutputData;
  metadata?: Record<string, unknown>;
}

/** Image output from the AI. Display priority: cdn_url → file handler (via file_id) → signed_url → url. */
export interface ImageOutputRenderBlock {
  type: "image_output";
  content: string;
  data: ImageOutputData;
  metadata?: Record<string, unknown>;
}

/** Video output from the AI. */
export interface VideoOutputRenderBlock {
  type: "video_output";
  content: string;
  data: VideoOutputData;
  metadata?: Record<string, unknown>;
}

/** Web search results block — registered kind `search_results` (inactive; data-event arrival unchanged). */
export interface SearchResultsRenderBlock {
  type: "search_results";
  content: string;
  data: SearchResultsData;
  metadata?: Record<string, unknown>;
}

/** URL fetch results block — registered kind `fetch_results` (inactive; data-event arrival unchanged). */
export interface FetchResultsRenderBlock {
  type: "fetch_results";
  content: string;
  data: FetchResultsData;
  metadata?: Record<string, unknown>;
}

/** Prompt categorization result — registered kind `categorization_result` (inactive; data-event arrival unchanged). */
export interface CategorizationResultRenderBlock {
  type: "categorization_result";
  content: string;
  data: CategorizationResultData;
  metadata?: Record<string, unknown>;
}

/** Questionnaire to display — alias of the registered `questionnaire` kind. */
export interface DisplayQuestionnaireRenderBlock {
  type: "display_questionnaire";
  content: string;
  data: QuestionnaireDisplayData;
  metadata?: Record<string, unknown>;
}

/** Generic tool-result envelope — payload typing is owned by tool_io contracts. */
export interface FunctionResultRenderBlock {
  type: "function_result";
  content: string;
  data: FunctionResultData;
  metadata?: Record<string, unknown>;
}

/** Workflow progress event. */
export interface WorkflowStepRenderBlock {
  type: "workflow_step";
  content: string;
  data: WorkflowStepData;
  metadata?: Record<string, unknown>;
}

/** Web search failure event. */
export interface SearchErrorRenderBlock {
  type: "search_error";
  content: string;
  data: SearchErrorData;
  metadata?: Record<string, unknown>;
}

/** Warning about malformed structured input blocks. */
export interface StructuredInputWarningRenderBlock {
  type: "structured_input_warning";
  content: string;
  data: StructuredInputWarningData;
  metadata?: Record<string, unknown>;
}

/** Podcast pipeline lifecycle event (stage finished). */
export interface PodcastStageRenderBlock {
  type: "podcast_stage";
  content: string;
  data: PodcastStageEvent;
  metadata?: Record<string, unknown>;
}

/** Podcast pipeline lifecycle event (generation complete). */
export interface PodcastCompleteRenderBlock {
  type: "podcast_complete";
  content: string;
  data: PodcastCompleteEvent;
  metadata?: Record<string, unknown>;
}

/** Scrape pipeline lifecycle event. */
export interface ScrapeBatchCompleteRenderBlock {
  type: "scrape_batch_complete";
  content: string;
  data: ScrapeBatchCompleteData;
  metadata?: Record<string, unknown>;
}

/** Conversation Value Store 'result ready' card — FE-synthesized from the kind-discriminated value_store.stored data event. Never persisted to cx_message.content. */
export interface ValueStoreStoredRenderBlock {
  type: "value_store_stored";
  /** Always null — a non-null content would leak into committed message parts. The payload lives on `data`. */
  content: null;
  data: ValueStoredEvent;
  metadata?: Record<string, unknown>;
}

/** Context-groom receipt line — FE-synthesized from the value_store.groomed data event. Subtle indicator only; never persisted. */
export interface ContextGroomedRenderBlock {
  type: "context_groomed";
  /** Always null — a non-null content would leak into committed message parts. The payload lives on `data`. */
  content: null;
  data: ContextGroomedEvent;
  metadata?: Record<string, unknown>;
}

/** Search-and-replace block for code editing (FE parse state). */
export interface SearchReplaceRenderBlock {
  type: "search_replace";
  content: string;
  data?: SearchReplaceRenderData;
  metadata?: Record<string, unknown>;
}

/** Fallback for data events whose type is not recognized; _dataType preserves the original type string. */
export interface UnknownDataEventRenderBlock {
  type: "unknown_data_event";
  content: string;
  data: UnknownDataEventData;
  metadata?: Record<string, unknown>;
}

/** Protocol/lifecycle/ack events — control plumbing, never Shapes. */
export type ServerProtocolRenderBlock =
  | FunctionResultRenderBlock
  | WorkflowStepRenderBlock
  | SearchErrorRenderBlock
  | StructuredInputWarningRenderBlock
  | PodcastStageRenderBlock
  | PodcastCompleteRenderBlock
  | ScrapeBatchCompleteRenderBlock
  | ValueStoreStoredRenderBlock
  | ContextGroomedRenderBlock
  | SearchReplaceRenderBlock;

export const SERVER_PROTOCOL_RENDER_BLOCK_TYPES = new Set<string>([
  "function_result", "workflow_step", "search_error", "structured_input_warning", "podcast_stage", "podcast_complete", "scrape_batch_complete", "value_store_stored", "context_groomed", "search_replace",
]);

/** Generated-media delivery blocks — generic media primitives. */
export type ServerScalarGenericRenderBlock =
  | AudioOutputRenderBlock
  | ImageOutputRenderBlock
  | VideoOutputRenderBlock;

export const SERVER_SCALAR_GENERIC_RENDER_BLOCK_TYPES = new Set<string>([
  "audio_output", "image_output", "video_output",
]);

/** Typed server result displays — registered-kind aliases or shape candidates. */
export type ServerShapeRenderBlock =
  | SearchResultsRenderBlock
  | FetchResultsRenderBlock
  | CategorizationResultRenderBlock
  | DisplayQuestionnaireRenderBlock;

export const SERVER_SHAPE_RENDER_BLOCK_TYPES = new Set<string>([
  "search_results", "fetch_results", "categorization_result", "display_questionnaire",
]);

/** Deliberately untyped catch-alls. */
export type ServerOpaqueRenderBlock =
  | UnknownDataEventRenderBlock;

export const SERVER_INTENTIONALLY_OPAQUE_RENDER_BLOCK_TYPES = new Set<string>([
  "unknown_data_event",
]);

/** Every FE-synthesized data-event render block — the generated successor of
 * the hand-maintained ServerOnlyRenderBlock union in missing-types.ts. */
export type ServerOnlyRenderBlock =
  | ServerProtocolRenderBlock
  | ServerScalarGenericRenderBlock
  | ServerShapeRenderBlock
  | ServerOpaqueRenderBlock;

export type ServerOnlyBlockType = ServerOnlyRenderBlock["type"];

// --- Message Part Models (cx_message.content[] items) ---

export interface NormalizedCitation {
  kind: "document_char" | "document_page" | "document_block" | "search_result" | "web" | "grounding";
  provider: "anthropic" | "openai" | "google" | "xai";
  cited_text?: string | null;
  title?: string | null;
  url?: string | null;
  source_index?: number;
  file_id?: string | null;
  page?: number | null;
  end_page?: number | null;
  source_start?: number | null;
  source_end?: number | null;
  answer_start?: number | null;
  answer_end?: number | null;
  raw?: Record<string, unknown>;
}

export interface TextPart {
  metadata?: Record<string, unknown>;
  type: "text";
  text?: string;
  id?: string;
  citations?: NormalizedCitation[];
}

export interface ThinkingPart {
  metadata?: Record<string, unknown>;
  type: "thinking";
  text?: string;
  id?: string;
  provider?: "openai" | "anthropic" | "google" | "cerebras" | "moonshot" | "together" | "groq" | "xai" | "generic_openai" | null;
  signature?: string | null;
  signature_encoding?: "base64" | null;
  summary?: unknown[];
}

export interface ToolCallPart {
  metadata?: Record<string, unknown>;
  type: "tool_call";
  call_id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
}

export interface ToolResultPart {
  metadata?: Record<string, unknown>;
  type: "tool_result";
  call_id?: string;
  tool_use_id?: string;
  name?: string;
  is_error?: boolean;
  output_chars?: number;
  output_preview?: Record<string, unknown> | null;
}

export type ImageMediaPart = {
  metadata?: Record<string, unknown>;
  origin?: "matrx" | "external" | null;
  file_id?: string | null;
  url?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  type: "media";
  kind: "image";
  width?: number | null;
  height?: number | null;
} & ({
  url: string;
} | {
  file_id: string;
});

export type AudioMediaPart = {
  metadata?: Record<string, unknown>;
  origin?: "matrx" | "external" | null;
  file_id?: string | null;
  url?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  type: "media";
  kind: "audio";
  duration_ms?: number | null;
  transcription_result?: string | null;
} & ({
  url: string;
} | {
  file_id: string;
});

export type VideoMediaPart = {
  metadata?: Record<string, unknown>;
  origin?: "matrx" | "external" | null;
  file_id?: string | null;
  url?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  type: "media";
  kind: "video";
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
} & ({
  url: string;
} | {
  file_id: string;
});

export type DocumentMediaPart = {
  metadata?: Record<string, unknown>;
  origin?: "matrx" | "external" | null;
  file_id?: string | null;
  url?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  type: "media";
  kind: "document";
  width?: number | null;
  height?: number | null;
  page_count?: number | null;
} & ({
  url: string;
} | {
  file_id: string;
});

export interface YouTubeMediaPart {
  metadata?: Record<string, unknown>;
  type: "media";
  kind: "youtube";
  url: string;
  external_url?: string | null;
  origin?: "external";
  file_id?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
}

export interface CodeExecPart {
  metadata?: Record<string, unknown>;
  type: "code_exec";
  language?: string;
  code?: string;
}

export interface CodeResultPart {
  metadata?: Record<string, unknown>;
  type: "code_result";
  output?: string;
  outcome?: string;
}

export interface WebSearchPart {
  metadata?: Record<string, unknown>;
  type: "web_search";
  id?: string;
  status?: string;
}

export interface PreFetchedUrl {
  [key: string]: unknown;
  url: string;
  textContent: string;
  title?: string | null;
  scrapedAt?: string | null;
  charCount?: number | null;
}

export interface WebpageInputPart {
  metadata?: Record<string, unknown>;
  type: "input_webpage";
  urls: (string | PreFetchedUrl)[];
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
}

export interface LiveResourceRefInput {
  [key: string]: unknown;
  id: string;
  mode?: "reference";
}

export type ResourceRefInput = LiveResourceRefInput | SnapshotContentResourceRefInput | SnapshotTextResourceRefInput | SnapshotBodyResourceRefInput | SnapshotDescriptionResourceRefInput | SnapshotValueResourceRefInput;

export interface SnapshotBodyResourceRefInput {
  [key: string]: unknown;
  mode: "snapshot";
  body: string;
}

export interface SnapshotContentResourceRefInput {
  [key: string]: unknown;
  mode: "snapshot";
  content: string;
}

export interface SnapshotDescriptionResourceRefInput {
  [key: string]: unknown;
  mode: "snapshot";
  description: string;
}

export interface SnapshotTextResourceRefInput {
  [key: string]: unknown;
  mode: "snapshot";
  text: string;
}

export interface SnapshotValueResourceRefInput {
  [key: string]: unknown;
  mode: "snapshot";
  value: string;
}

export interface NotesInputPart {
  metadata?: Record<string, unknown>;
  type: "input_notes";
  note_ids: (string | ResourceRefInput)[];
  template?: string;
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
}

export interface TaskInputPart {
  metadata?: Record<string, unknown>;
  type: "input_task";
  task_ids: (string | ResourceRefInput)[];
  template?: string;
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
}

export interface AgentInputPart {
  metadata?: Record<string, unknown>;
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
  template?: "full" | "compact" | "minimal" | null;
  type: "input_agent";
  agent_ids: string[];
}

export interface ProjectInputPart {
  metadata?: Record<string, unknown>;
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
  template?: "full" | "compact" | "minimal" | null;
  type: "input_project";
  project_ids: string[];
}

export interface AgentAppInputPart {
  metadata?: Record<string, unknown>;
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
  template?: "full" | "compact" | "minimal" | null;
  type: "input_agent_app";
  agent_app_ids: string[];
}

export interface TranscriptInputPart {
  metadata?: Record<string, unknown>;
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
  template?: "full" | "compact" | "minimal" | null;
  type: "input_transcript";
  transcript_ids: string[];
}

export interface TranscriptSessionInputPart {
  metadata?: Record<string, unknown>;
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
  template?: "full" | "compact" | "minimal" | null;
  type: "input_transcript_session";
  transcript_session_ids: string[];
}

export interface WorkbookInputPart {
  metadata?: Record<string, unknown>;
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
  template?: "full" | "compact" | "minimal" | null;
  type: "input_workbook";
  workbook_ids: (string | LiveResourceRefInput)[];
}

export interface DocumentInputPart {
  metadata?: Record<string, unknown>;
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
  template?: "full" | "compact" | "minimal" | null;
  type: "input_document";
  document_ids: (string | LiveResourceRefInput)[];
}

export interface FullTableBookmark {
  [key: string]: unknown;
  type: "full_table";
  table_id: string;
  table_name?: string | null;
}

export interface TableCellBookmark {
  [key: string]: unknown;
  type: "table_cell";
  table_id: string;
  row_id: string;
  column_name: string;
  table_name?: string | null;
}

export interface TableColumnBookmark {
  [key: string]: unknown;
  type: "table_column";
  table_id: string;
  column_name: string;
  table_name?: string | null;
}

export interface TableRowBookmark {
  [key: string]: unknown;
  type: "table_row";
  table_id: string;
  row_id: string;
  table_name?: string | null;
}

export interface TableSchemaBookmark {
  [key: string]: unknown;
  type: "table_schema";
  table_id: string;
  table_name?: string | null;
}

export interface TableInputPart {
  metadata?: Record<string, unknown>;
  type: "input_table";
  bookmarks: (FullTableBookmark | TableColumnBookmark | TableRowBookmark | TableCellBookmark | TableSchemaBookmark)[];
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
}

export interface FullListBookmark {
  [key: string]: unknown;
  type: "full_list";
  list_id: string;
  list_name?: string | null;
}

export interface ListGroupBookmark {
  [key: string]: unknown;
  type: "list_group";
  list_id: string;
  group_name: string;
  list_name?: string | null;
}

export interface ListItemBookmark {
  [key: string]: unknown;
  type: "list_item";
  list_id: string;
  item_id: string;
  list_name?: string | null;
}

export interface ListInputPart {
  metadata?: Record<string, unknown>;
  type: "input_list";
  bookmarks: (FullListBookmark | ListGroupBookmark | ListItemBookmark)[];
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
}

export interface DataRefSort {
  field: string;
  direction?: "asc" | "desc";
}

export interface DbFieldRef {
  table: "notes" | "tasks" | "projects" | "organizations";
  label?: string;
  optional_context?: boolean;
  ref_type: "db_field";
  id: string;
  field_name: string;
}

export interface DbQueryRef {
  table: "notes" | "tasks" | "projects" | "organizations";
  label?: string;
  optional_context?: boolean;
  ref_type: "db_query";
  filter?: Record<string, unknown>;
  fields?: string[] | null;
  sort?: DataRefSort | null;
  limit?: number;
}

export interface DbRecordRef {
  table: "notes" | "tasks" | "projects" | "organizations";
  label?: string;
  optional_context?: boolean;
  ref_type: "db_record";
  id: string;
  fields?: string[] | null;
}

export interface DataInputPart {
  metadata?: Record<string, unknown>;
  type: "input_data";
  refs: (DbRecordRef | DbQueryRef | DbFieldRef)[];
  convert_to_text?: boolean;
  optional_context?: boolean;
  keep_fresh?: boolean;
  editable?: boolean | null;
}

export interface ContextInputPart {
  metadata?: Record<string, unknown>;
  type: "input_context";
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
  | AgentInputPart
  | ProjectInputPart
  | AgentAppInputPart
  | TranscriptInputPart
  | TranscriptSessionInputPart
  | WorkbookInputPart
  | DocumentInputPart
  | TableInputPart
  | ListInputPart
  | DataInputPart
  | ContextInputPart;

interface MessagePartJsonSchema {
  [key: string]: unknown;
  $ref?: string;
  anyOf?: MessagePartJsonSchema[];
  oneOf?: MessagePartJsonSchema[];
  allOf?: MessagePartJsonSchema[];
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  const?: unknown;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, MessagePartJsonSchema>;
  items?: MessagePartJsonSchema;
  minItems?: number;
  minLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  additionalProperties?: boolean | MessagePartJsonSchema;
  $defs?: Record<string, MessagePartJsonSchema>;
}

const MESSAGE_PART_SCHEMA: MessagePartJsonSchema = {
  "$defs": {
    "AgentAppInputPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "convert_to_text": {
          "default": true,
          "title": "Convert To Text",
          "type": "boolean"
        },
        "optional_context": {
          "default": false,
          "title": "Optional Context",
          "type": "boolean"
        },
        "keep_fresh": {
          "default": false,
          "title": "Keep Fresh",
          "type": "boolean"
        },
        "editable": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Editable"
        },
        "template": {
          "anyOf": [
            {
              "enum": [
                "full",
                "compact",
                "minimal"
              ],
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Template"
        },
        "type": {
          "const": "input_agent_app",
          "default": "input_agent_app",
          "title": "Type",
          "type": "string"
        },
        "agent_app_ids": {
          "items": {
            "minLength": 1,
            "type": "string"
          },
          "minItems": 1,
          "title": "Agent App Ids",
          "type": "array"
        }
      },
      "required": [
        "agent_app_ids",
        "type"
      ],
      "title": "AgentAppInputPart",
      "type": "object"
    },
    "AgentInputPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "convert_to_text": {
          "default": true,
          "title": "Convert To Text",
          "type": "boolean"
        },
        "optional_context": {
          "default": false,
          "title": "Optional Context",
          "type": "boolean"
        },
        "keep_fresh": {
          "default": false,
          "title": "Keep Fresh",
          "type": "boolean"
        },
        "editable": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Editable"
        },
        "template": {
          "anyOf": [
            {
              "enum": [
                "full",
                "compact",
                "minimal"
              ],
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Template"
        },
        "type": {
          "const": "input_agent",
          "default": "input_agent",
          "title": "Type",
          "type": "string"
        },
        "agent_ids": {
          "items": {
            "minLength": 1,
            "type": "string"
          },
          "minItems": 1,
          "title": "Agent Ids",
          "type": "array"
        }
      },
      "required": [
        "agent_ids",
        "type"
      ],
      "title": "AgentInputPart",
      "type": "object"
    },
    "AudioMediaPart": {
      "additionalProperties": false,
      "allOf": [
        {
          "anyOf": [
            {
              "properties": {
                "url": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "url"
              ]
            },
            {
              "properties": {
                "file_id": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "file_id"
              ]
            }
          ]
        }
      ],
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "origin": {
          "anyOf": [
            {
              "enum": [
                "matrx",
                "external"
              ],
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Origin"
        },
        "file_id": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "File Id"
        },
        "url": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Url"
        },
        "mime_type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Mime Type"
        },
        "size_bytes": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Size Bytes"
        },
        "type": {
          "const": "media",
          "default": "media",
          "title": "Type",
          "type": "string"
        },
        "kind": {
          "const": "audio",
          "default": "audio",
          "title": "Kind",
          "type": "string"
        },
        "duration_ms": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Duration Ms"
        },
        "transcription_result": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Transcription Result"
        }
      },
      "required": [
        "type",
        "kind"
      ],
      "title": "AudioMediaPart",
      "type": "object"
    },
    "CodeExecPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "type": {
          "const": "code_exec",
          "default": "code_exec",
          "title": "Type",
          "type": "string"
        },
        "language": {
          "default": "python",
          "title": "Language",
          "type": "string"
        },
        "code": {
          "default": "",
          "title": "Code",
          "type": "string"
        }
      },
      "required": [
        "type"
      ],
      "title": "CodeExecPart",
      "type": "object"
    },
    "CodeResultPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "type": {
          "const": "code_result",
          "default": "code_result",
          "title": "Type",
          "type": "string"
        },
        "output": {
          "default": "",
          "title": "Output",
          "type": "string"
        },
        "outcome": {
          "default": "success",
          "title": "Outcome",
          "type": "string"
        }
      },
      "required": [
        "type"
      ],
      "title": "CodeResultPart",
      "type": "object"
    },
    "ContextInputPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "type": {
          "const": "input_context",
          "default": "input_context",
          "title": "Type",
          "type": "string"
        },
        "context_id": {
          "default": "",
          "title": "Context Id",
          "type": "string"
        },
        "context_name": {
          "default": "",
          "title": "Context Name",
          "type": "string"
        },
        "context_data": {
          "additionalProperties": true,
          "title": "Context Data",
          "type": "object"
        },
        "convert_to_text": {
          "default": true,
          "title": "Convert To Text",
          "type": "boolean"
        },
        "optional_context": {
          "default": false,
          "title": "Optional Context",
          "type": "boolean"
        },
        "keep_fresh": {
          "default": false,
          "title": "Keep Fresh",
          "type": "boolean"
        },
        "editable": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Editable"
        }
      },
      "required": [
        "type"
      ],
      "title": "ContextInputPart",
      "type": "object"
    },
    "DataInputPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "type": {
          "const": "input_data",
          "default": "input_data",
          "title": "Type",
          "type": "string"
        },
        "refs": {
          "items": {
            "discriminator": {
              "mapping": {
                "db_field": "#/$defs/DbFieldRef",
                "db_query": "#/$defs/DbQueryRef",
                "db_record": "#/$defs/DbRecordRef"
              },
              "propertyName": "ref_type"
            },
            "oneOf": [
              {
                "$ref": "#/$defs/DbRecordRef"
              },
              {
                "$ref": "#/$defs/DbQueryRef"
              },
              {
                "$ref": "#/$defs/DbFieldRef"
              }
            ]
          },
          "minItems": 1,
          "title": "Refs",
          "type": "array"
        },
        "convert_to_text": {
          "default": true,
          "title": "Convert To Text",
          "type": "boolean"
        },
        "optional_context": {
          "default": false,
          "title": "Optional Context",
          "type": "boolean"
        },
        "keep_fresh": {
          "default": false,
          "title": "Keep Fresh",
          "type": "boolean"
        },
        "editable": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Editable"
        }
      },
      "required": [
        "refs",
        "type"
      ],
      "title": "DataInputPart",
      "type": "object"
    },
    "DataRefSort": {
      "additionalProperties": false,
      "properties": {
        "field": {
          "minLength": 1,
          "title": "Field",
          "type": "string"
        },
        "direction": {
          "default": "asc",
          "enum": [
            "asc",
            "desc"
          ],
          "title": "Direction",
          "type": "string"
        }
      },
      "required": [
        "field"
      ],
      "title": "DataRefSort",
      "type": "object"
    },
    "DbFieldRef": {
      "additionalProperties": false,
      "description": "Fetch a single field value from one row of a system table.",
      "properties": {
        "table": {
          "enum": [
            "notes",
            "tasks",
            "projects",
            "organizations"
          ],
          "title": "Table",
          "type": "string"
        },
        "label": {
          "default": "",
          "title": "Label",
          "type": "string"
        },
        "optional_context": {
          "default": false,
          "title": "Optional Context",
          "type": "boolean"
        },
        "ref_type": {
          "const": "db_field",
          "title": "Ref Type",
          "type": "string"
        },
        "id": {
          "minLength": 1,
          "title": "Id",
          "type": "string"
        },
        "field_name": {
          "minLength": 1,
          "title": "Field Name",
          "type": "string"
        }
      },
      "required": [
        "table",
        "ref_type",
        "id",
        "field_name"
      ],
      "title": "DbFieldRef",
      "type": "object"
    },
    "DbQueryRef": {
      "additionalProperties": false,
      "description": "Fetch multiple rows from a system table with optional filters.",
      "properties": {
        "table": {
          "enum": [
            "notes",
            "tasks",
            "projects",
            "organizations"
          ],
          "title": "Table",
          "type": "string"
        },
        "label": {
          "default": "",
          "title": "Label",
          "type": "string"
        },
        "optional_context": {
          "default": false,
          "title": "Optional Context",
          "type": "boolean"
        },
        "ref_type": {
          "const": "db_query",
          "title": "Ref Type",
          "type": "string"
        },
        "filter": {
          "additionalProperties": true,
          "title": "Filter",
          "type": "object"
        },
        "fields": {
          "anyOf": [
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Fields"
        },
        "sort": {
          "anyOf": [
            {
              "$ref": "#/$defs/DataRefSort"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "limit": {
          "default": 50,
          "maximum": 1000,
          "minimum": 1,
          "title": "Limit",
          "type": "integer"
        }
      },
      "required": [
        "table",
        "ref_type"
      ],
      "title": "DbQueryRef",
      "type": "object"
    },
    "DbRecordRef": {
      "additionalProperties": false,
      "description": "Fetch one full row from a system table by primary key.",
      "properties": {
        "table": {
          "enum": [
            "notes",
            "tasks",
            "projects",
            "organizations"
          ],
          "title": "Table",
          "type": "string"
        },
        "label": {
          "default": "",
          "title": "Label",
          "type": "string"
        },
        "optional_context": {
          "default": false,
          "title": "Optional Context",
          "type": "boolean"
        },
        "ref_type": {
          "const": "db_record",
          "title": "Ref Type",
          "type": "string"
        },
        "id": {
          "minLength": 1,
          "title": "Id",
          "type": "string"
        },
        "fields": {
          "anyOf": [
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Fields"
        }
      },
      "required": [
        "table",
        "ref_type",
        "id"
      ],
      "title": "DbRecordRef",
      "type": "object"
    },
    "DocumentInputPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "convert_to_text": {
          "default": true,
          "title": "Convert To Text",
          "type": "boolean"
        },
        "optional_context": {
          "default": false,
          "title": "Optional Context",
          "type": "boolean"
        },
        "keep_fresh": {
          "default": false,
          "title": "Keep Fresh",
          "type": "boolean"
        },
        "editable": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Editable"
        },
        "template": {
          "anyOf": [
            {
              "enum": [
                "full",
                "compact",
                "minimal"
              ],
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Template"
        },
        "type": {
          "const": "input_document",
          "default": "input_document",
          "title": "Type",
          "type": "string"
        },
        "document_ids": {
          "items": {
            "anyOf": [
              {
                "minLength": 1,
                "type": "string"
              },
              {
                "$ref": "#/$defs/LiveResourceRefInput"
              }
            ]
          },
          "minItems": 1,
          "title": "Document Ids",
          "type": "array"
        }
      },
      "required": [
        "document_ids",
        "type"
      ],
      "title": "DocumentInputPart",
      "type": "object"
    },
    "DocumentMediaPart": {
      "additionalProperties": false,
      "allOf": [
        {
          "anyOf": [
            {
              "properties": {
                "url": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "url"
              ]
            },
            {
              "properties": {
                "file_id": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "file_id"
              ]
            }
          ]
        }
      ],
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "origin": {
          "anyOf": [
            {
              "enum": [
                "matrx",
                "external"
              ],
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Origin"
        },
        "file_id": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "File Id"
        },
        "url": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Url"
        },
        "mime_type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Mime Type"
        },
        "size_bytes": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Size Bytes"
        },
        "type": {
          "const": "media",
          "default": "media",
          "title": "Type",
          "type": "string"
        },
        "kind": {
          "const": "document",
          "default": "document",
          "title": "Kind",
          "type": "string"
        },
        "width": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Width"
        },
        "height": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Height"
        },
        "page_count": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Page Count"
        }
      },
      "required": [
        "type",
        "kind"
      ],
      "title": "DocumentMediaPart",
      "type": "object"
    },
    "FullListBookmark": {
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "full_list",
          "default": "full_list",
          "title": "Type",
          "type": "string"
        },
        "list_id": {
          "minLength": 1,
          "title": "List Id",
          "type": "string"
        },
        "list_name": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "List Name"
        }
      },
      "required": [
        "list_id"
      ],
      "title": "FullListBookmark",
      "type": "object"
    },
    "FullTableBookmark": {
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "full_table",
          "default": "full_table",
          "title": "Type",
          "type": "string"
        },
        "table_id": {
          "minLength": 1,
          "title": "Table Id",
          "type": "string"
        },
        "table_name": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Table Name"
        }
      },
      "required": [
        "table_id"
      ],
      "title": "FullTableBookmark",
      "type": "object"
    },
    "ImageMediaPart": {
      "additionalProperties": false,
      "allOf": [
        {
          "anyOf": [
            {
              "properties": {
                "url": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "url"
              ]
            },
            {
              "properties": {
                "file_id": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "file_id"
              ]
            }
          ]
        }
      ],
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "origin": {
          "anyOf": [
            {
              "enum": [
                "matrx",
                "external"
              ],
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Origin"
        },
        "file_id": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "File Id"
        },
        "url": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Url"
        },
        "mime_type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Mime Type"
        },
        "size_bytes": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Size Bytes"
        },
        "type": {
          "const": "media",
          "default": "media",
          "title": "Type",
          "type": "string"
        },
        "kind": {
          "const": "image",
          "default": "image",
          "title": "Kind",
          "type": "string"
        },
        "width": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Width"
        },
        "height": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Height"
        }
      },
      "required": [
        "type",
        "kind"
      ],
      "title": "ImageMediaPart",
      "type": "object"
    },
    "ListGroupBookmark": {
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "list_group",
          "default": "list_group",
          "title": "Type",
          "type": "string"
        },
        "list_id": {
          "minLength": 1,
          "title": "List Id",
          "type": "string"
        },
        "group_name": {
          "minLength": 1,
          "title": "Group Name",
          "type": "string"
        },
        "list_name": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "List Name"
        }
      },
      "required": [
        "list_id",
        "group_name"
      ],
      "title": "ListGroupBookmark",
      "type": "object"
    },
    "ListInputPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "type": {
          "const": "input_list",
          "default": "input_list",
          "title": "Type",
          "type": "string"
        },
        "bookmarks": {
          "items": {
            "discriminator": {
              "mapping": {
                "full_list": "#/$defs/FullListBookmark",
                "list_group": "#/$defs/ListGroupBookmark",
                "list_item": "#/$defs/ListItemBookmark"
              },
              "propertyName": "type"
            },
            "oneOf": [
              {
                "$ref": "#/$defs/FullListBookmark"
              },
              {
                "$ref": "#/$defs/ListGroupBookmark"
              },
              {
                "$ref": "#/$defs/ListItemBookmark"
              }
            ]
          },
          "minItems": 1,
          "title": "Bookmarks",
          "type": "array"
        },
        "convert_to_text": {
          "default": true,
          "title": "Convert To Text",
          "type": "boolean"
        },
        "optional_context": {
          "default": false,
          "title": "Optional Context",
          "type": "boolean"
        },
        "keep_fresh": {
          "default": false,
          "title": "Keep Fresh",
          "type": "boolean"
        },
        "editable": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Editable"
        }
      },
      "required": [
        "bookmarks",
        "type"
      ],
      "title": "ListInputPart",
      "type": "object"
    },
    "ListItemBookmark": {
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "list_item",
          "default": "list_item",
          "title": "Type",
          "type": "string"
        },
        "list_id": {
          "minLength": 1,
          "title": "List Id",
          "type": "string"
        },
        "item_id": {
          "minLength": 1,
          "title": "Item Id",
          "type": "string"
        },
        "list_name": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "List Name"
        }
      },
      "required": [
        "list_id",
        "item_id"
      ],
      "title": "ListItemBookmark",
      "type": "object"
    },
    "LiveResourceRefInput": {
      "additionalProperties": true,
      "description": "A live id-backed reference; snapshots are not meaningful for opaque resources.",
      "properties": {
        "id": {
          "minLength": 1,
          "title": "Id",
          "type": "string"
        },
        "mode": {
          "const": "reference",
          "default": "reference",
          "title": "Mode",
          "type": "string"
        }
      },
      "required": [
        "id"
      ],
      "title": "LiveResourceRefInput",
      "type": "object"
    },
    "NormalizedCitation": {
      "additionalProperties": false,
      "description": "The canonical cross-provider citation shape — the FE contract.\n\nOffsets come in two flavours and are never conflated:\n  - ``source_start`` / ``source_end``: char/block offsets INTO THE SOURCE\n    document (Anthropic char/content_block locations).\n  - ``answer_start`` / ``answer_end``: char offsets INTO THE ANSWER TEXT\n    (OpenAI url_citation annotations, Gemini grounding segment offsets).\n``page`` / ``end_page`` are 1-based (Anthropic page_location).",
      "properties": {
        "kind": {
          "enum": [
            "document_char",
            "document_page",
            "document_block",
            "search_result",
            "web",
            "grounding"
          ],
          "title": "Kind",
          "type": "string"
        },
        "provider": {
          "enum": [
            "anthropic",
            "openai",
            "google",
            "xai"
          ],
          "title": "Provider",
          "type": "string"
        },
        "cited_text": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Cited Text"
        },
        "title": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Title"
        },
        "url": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Url"
        },
        "source_index": {
          "default": 0,
          "title": "Source Index",
          "type": "integer"
        },
        "file_id": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "File Id"
        },
        "page": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Page"
        },
        "end_page": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "End Page"
        },
        "source_start": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Source Start"
        },
        "source_end": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Source End"
        },
        "answer_start": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Answer Start"
        },
        "answer_end": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Answer End"
        },
        "raw": {
          "additionalProperties": true,
          "title": "Raw",
          "type": "object"
        }
      },
      "required": [
        "kind",
        "provider"
      ],
      "title": "NormalizedCitation",
      "type": "object"
    },
    "NotesInputPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "type": {
          "const": "input_notes",
          "default": "input_notes",
          "title": "Type",
          "type": "string"
        },
        "note_ids": {
          "items": {
            "anyOf": [
              {
                "minLength": 1,
                "type": "string"
              },
              {
                "$ref": "#/$defs/ResourceRefInput"
              }
            ]
          },
          "minItems": 1,
          "title": "Note Ids",
          "type": "array"
        },
        "template": {
          "default": "full",
          "title": "Template",
          "type": "string"
        },
        "convert_to_text": {
          "default": true,
          "title": "Convert To Text",
          "type": "boolean"
        },
        "optional_context": {
          "default": false,
          "title": "Optional Context",
          "type": "boolean"
        },
        "keep_fresh": {
          "default": false,
          "title": "Keep Fresh",
          "type": "boolean"
        },
        "editable": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Editable"
        }
      },
      "required": [
        "note_ids",
        "type"
      ],
      "title": "NotesInputPart",
      "type": "object"
    },
    "PreFetchedUrl": {
      "additionalProperties": true,
      "description": "A webpage entry that has already been scraped by the client.\n\nWhen the frontend has already fetched a page (e.g. via /scraper/quick-scrape)\nit can embed the content here instead of a plain URL string. The server will\nuse this content directly and skip re-scraping.",
      "properties": {
        "url": {
          "minLength": 1,
          "title": "Url",
          "type": "string"
        },
        "textContent": {
          "title": "Textcontent",
          "type": "string"
        },
        "title": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Title"
        },
        "scrapedAt": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Scrapedat"
        },
        "charCount": {
          "anyOf": [
            {
              "minimum": 0,
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Charcount"
        }
      },
      "required": [
        "url",
        "textContent"
      ],
      "title": "PreFetchedUrl",
      "type": "object"
    },
    "ProjectInputPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "convert_to_text": {
          "default": true,
          "title": "Convert To Text",
          "type": "boolean"
        },
        "optional_context": {
          "default": false,
          "title": "Optional Context",
          "type": "boolean"
        },
        "keep_fresh": {
          "default": false,
          "title": "Keep Fresh",
          "type": "boolean"
        },
        "editable": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Editable"
        },
        "template": {
          "anyOf": [
            {
              "enum": [
                "full",
                "compact",
                "minimal"
              ],
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Template"
        },
        "type": {
          "const": "input_project",
          "default": "input_project",
          "title": "Type",
          "type": "string"
        },
        "project_ids": {
          "items": {
            "minLength": 1,
            "type": "string"
          },
          "minItems": 1,
          "title": "Project Ids",
          "type": "array"
        }
      },
      "required": [
        "project_ids",
        "type"
      ],
      "title": "ProjectInputPart",
      "type": "object"
    },
    "ResourceRefInput": {
      "anyOf": [
        {
          "$ref": "#/$defs/LiveResourceRefInput"
        },
        {
          "$ref": "#/$defs/SnapshotContentResourceRefInput"
        },
        {
          "$ref": "#/$defs/SnapshotTextResourceRefInput"
        },
        {
          "$ref": "#/$defs/SnapshotBodyResourceRefInput"
        },
        {
          "$ref": "#/$defs/SnapshotDescriptionResourceRefInput"
        },
        {
          "$ref": "#/$defs/SnapshotValueResourceRefInput"
        }
      ]
    },
    "SnapshotBodyResourceRefInput": {
      "additionalProperties": true,
      "properties": {
        "mode": {
          "const": "snapshot",
          "title": "Mode",
          "type": "string"
        },
        "body": {
          "minLength": 1,
          "title": "Body",
          "type": "string"
        }
      },
      "required": [
        "mode",
        "body"
      ],
      "title": "SnapshotBodyResourceRefInput",
      "type": "object"
    },
    "SnapshotContentResourceRefInput": {
      "additionalProperties": true,
      "properties": {
        "mode": {
          "const": "snapshot",
          "title": "Mode",
          "type": "string"
        },
        "content": {
          "minLength": 1,
          "title": "Content",
          "type": "string"
        }
      },
      "required": [
        "mode",
        "content"
      ],
      "title": "SnapshotContentResourceRefInput",
      "type": "object"
    },
    "SnapshotDescriptionResourceRefInput": {
      "additionalProperties": true,
      "properties": {
        "mode": {
          "const": "snapshot",
          "title": "Mode",
          "type": "string"
        },
        "description": {
          "minLength": 1,
          "title": "Description",
          "type": "string"
        }
      },
      "required": [
        "mode",
        "description"
      ],
      "title": "SnapshotDescriptionResourceRefInput",
      "type": "object"
    },
    "SnapshotTextResourceRefInput": {
      "additionalProperties": true,
      "properties": {
        "mode": {
          "const": "snapshot",
          "title": "Mode",
          "type": "string"
        },
        "text": {
          "minLength": 1,
          "title": "Text",
          "type": "string"
        }
      },
      "required": [
        "mode",
        "text"
      ],
      "title": "SnapshotTextResourceRefInput",
      "type": "object"
    },
    "SnapshotValueResourceRefInput": {
      "additionalProperties": true,
      "properties": {
        "mode": {
          "const": "snapshot",
          "title": "Mode",
          "type": "string"
        },
        "value": {
          "minLength": 1,
          "title": "Value",
          "type": "string"
        }
      },
      "required": [
        "mode",
        "value"
      ],
      "title": "SnapshotValueResourceRefInput",
      "type": "object"
    },
    "TableCellBookmark": {
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "table_cell",
          "default": "table_cell",
          "title": "Type",
          "type": "string"
        },
        "table_id": {
          "minLength": 1,
          "title": "Table Id",
          "type": "string"
        },
        "row_id": {
          "minLength": 1,
          "title": "Row Id",
          "type": "string"
        },
        "column_name": {
          "minLength": 1,
          "title": "Column Name",
          "type": "string"
        },
        "table_name": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Table Name"
        }
      },
      "required": [
        "table_id",
        "row_id",
        "column_name"
      ],
      "title": "TableCellBookmark",
      "type": "object"
    },
    "TableColumnBookmark": {
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "table_column",
          "default": "table_column",
          "title": "Type",
          "type": "string"
        },
        "table_id": {
          "minLength": 1,
          "title": "Table Id",
          "type": "string"
        },
        "column_name": {
          "minLength": 1,
          "title": "Column Name",
          "type": "string"
        },
        "table_name": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Table Name"
        }
      },
      "required": [
        "table_id",
        "column_name"
      ],
      "title": "TableColumnBookmark",
      "type": "object"
    },
    "TableInputPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "type": {
          "const": "input_table",
          "default": "input_table",
          "title": "Type",
          "type": "string"
        },
        "bookmarks": {
          "items": {
            "discriminator": {
              "mapping": {
                "full_table": "#/$defs/FullTableBookmark",
                "table_cell": "#/$defs/TableCellBookmark",
                "table_column": "#/$defs/TableColumnBookmark",
                "table_row": "#/$defs/TableRowBookmark",
                "table_schema": "#/$defs/TableSchemaBookmark"
              },
              "propertyName": "type"
            },
            "oneOf": [
              {
                "$ref": "#/$defs/FullTableBookmark"
              },
              {
                "$ref": "#/$defs/TableColumnBookmark"
              },
              {
                "$ref": "#/$defs/TableRowBookmark"
              },
              {
                "$ref": "#/$defs/TableCellBookmark"
              },
              {
                "$ref": "#/$defs/TableSchemaBookmark"
              }
            ]
          },
          "minItems": 1,
          "title": "Bookmarks",
          "type": "array"
        },
        "convert_to_text": {
          "default": true,
          "title": "Convert To Text",
          "type": "boolean"
        },
        "optional_context": {
          "default": false,
          "title": "Optional Context",
          "type": "boolean"
        },
        "keep_fresh": {
          "default": false,
          "title": "Keep Fresh",
          "type": "boolean"
        },
        "editable": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Editable"
        }
      },
      "required": [
        "bookmarks",
        "type"
      ],
      "title": "TableInputPart",
      "type": "object"
    },
    "TableRowBookmark": {
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "table_row",
          "default": "table_row",
          "title": "Type",
          "type": "string"
        },
        "table_id": {
          "minLength": 1,
          "title": "Table Id",
          "type": "string"
        },
        "row_id": {
          "minLength": 1,
          "title": "Row Id",
          "type": "string"
        },
        "table_name": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Table Name"
        }
      },
      "required": [
        "table_id",
        "row_id"
      ],
      "title": "TableRowBookmark",
      "type": "object"
    },
    "TableSchemaBookmark": {
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "table_schema",
          "default": "table_schema",
          "title": "Type",
          "type": "string"
        },
        "table_id": {
          "minLength": 1,
          "title": "Table Id",
          "type": "string"
        },
        "table_name": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Table Name"
        }
      },
      "required": [
        "table_id"
      ],
      "title": "TableSchemaBookmark",
      "type": "object"
    },
    "TaskInputPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "type": {
          "const": "input_task",
          "default": "input_task",
          "title": "Type",
          "type": "string"
        },
        "task_ids": {
          "items": {
            "anyOf": [
              {
                "minLength": 1,
                "type": "string"
              },
              {
                "$ref": "#/$defs/ResourceRefInput"
              }
            ]
          },
          "minItems": 1,
          "title": "Task Ids",
          "type": "array"
        },
        "template": {
          "default": "full",
          "title": "Template",
          "type": "string"
        },
        "convert_to_text": {
          "default": true,
          "title": "Convert To Text",
          "type": "boolean"
        },
        "optional_context": {
          "default": false,
          "title": "Optional Context",
          "type": "boolean"
        },
        "keep_fresh": {
          "default": false,
          "title": "Keep Fresh",
          "type": "boolean"
        },
        "editable": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Editable"
        }
      },
      "required": [
        "task_ids",
        "type"
      ],
      "title": "TaskInputPart",
      "type": "object"
    },
    "TextPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "type": {
          "const": "text",
          "default": "text",
          "title": "Type",
          "type": "string"
        },
        "text": {
          "default": "",
          "title": "Text",
          "type": "string"
        },
        "id": {
          "default": "",
          "title": "Id",
          "type": "string"
        },
        "citations": {
          "items": {
            "$ref": "#/$defs/NormalizedCitation"
          },
          "title": "Citations",
          "type": "array"
        }
      },
      "required": [
        "type"
      ],
      "title": "TextPart",
      "type": "object"
    },
    "ThinkingPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "type": {
          "const": "thinking",
          "default": "thinking",
          "title": "Type",
          "type": "string"
        },
        "text": {
          "default": "",
          "title": "Text",
          "type": "string"
        },
        "id": {
          "default": "",
          "title": "Id",
          "type": "string"
        },
        "provider": {
          "anyOf": [
            {
              "enum": [
                "openai",
                "anthropic",
                "google",
                "cerebras",
                "moonshot",
                "together",
                "groq",
                "xai",
                "generic_openai"
              ],
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Provider"
        },
        "signature": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Signature"
        },
        "signature_encoding": {
          "anyOf": [
            {
              "const": "base64",
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Signature Encoding"
        },
        "summary": {
          "items": {},
          "title": "Summary",
          "type": "array"
        }
      },
      "required": [
        "type"
      ],
      "title": "ThinkingPart",
      "type": "object"
    },
    "ToolCallPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "type": {
          "const": "tool_call",
          "default": "tool_call",
          "title": "Type",
          "type": "string"
        },
        "call_id": {
          "default": "",
          "title": "Call Id",
          "type": "string"
        },
        "name": {
          "default": "",
          "title": "Name",
          "type": "string"
        },
        "arguments": {
          "additionalProperties": true,
          "title": "Arguments",
          "type": "object"
        }
      },
      "required": [
        "type"
      ],
      "title": "ToolCallPart",
      "type": "object"
    },
    "ToolResultPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "type": {
          "const": "tool_result",
          "default": "tool_result",
          "title": "Type",
          "type": "string"
        },
        "call_id": {
          "default": "",
          "title": "Call Id",
          "type": "string"
        },
        "tool_use_id": {
          "default": "",
          "title": "Tool Use Id",
          "type": "string"
        },
        "name": {
          "default": "",
          "title": "Name",
          "type": "string"
        },
        "is_error": {
          "default": false,
          "title": "Is Error",
          "type": "boolean"
        },
        "output_chars": {
          "default": 0,
          "title": "Output Chars",
          "type": "integer"
        },
        "output_preview": {
          "anyOf": [
            {
              "additionalProperties": true,
              "type": "object"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Output Preview"
        }
      },
      "required": [
        "type"
      ],
      "title": "ToolResultPart",
      "type": "object"
    },
    "TranscriptInputPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "convert_to_text": {
          "default": true,
          "title": "Convert To Text",
          "type": "boolean"
        },
        "optional_context": {
          "default": false,
          "title": "Optional Context",
          "type": "boolean"
        },
        "keep_fresh": {
          "default": false,
          "title": "Keep Fresh",
          "type": "boolean"
        },
        "editable": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Editable"
        },
        "template": {
          "anyOf": [
            {
              "enum": [
                "full",
                "compact",
                "minimal"
              ],
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Template"
        },
        "type": {
          "const": "input_transcript",
          "default": "input_transcript",
          "title": "Type",
          "type": "string"
        },
        "transcript_ids": {
          "items": {
            "minLength": 1,
            "type": "string"
          },
          "minItems": 1,
          "title": "Transcript Ids",
          "type": "array"
        }
      },
      "required": [
        "transcript_ids",
        "type"
      ],
      "title": "TranscriptInputPart",
      "type": "object"
    },
    "TranscriptSessionInputPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "convert_to_text": {
          "default": true,
          "title": "Convert To Text",
          "type": "boolean"
        },
        "optional_context": {
          "default": false,
          "title": "Optional Context",
          "type": "boolean"
        },
        "keep_fresh": {
          "default": false,
          "title": "Keep Fresh",
          "type": "boolean"
        },
        "editable": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Editable"
        },
        "template": {
          "anyOf": [
            {
              "enum": [
                "full",
                "compact",
                "minimal"
              ],
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Template"
        },
        "type": {
          "const": "input_transcript_session",
          "default": "input_transcript_session",
          "title": "Type",
          "type": "string"
        },
        "transcript_session_ids": {
          "items": {
            "minLength": 1,
            "type": "string"
          },
          "minItems": 1,
          "title": "Transcript Session Ids",
          "type": "array"
        }
      },
      "required": [
        "transcript_session_ids",
        "type"
      ],
      "title": "TranscriptSessionInputPart",
      "type": "object"
    },
    "VideoMediaPart": {
      "additionalProperties": false,
      "allOf": [
        {
          "anyOf": [
            {
              "properties": {
                "url": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "url"
              ]
            },
            {
              "properties": {
                "file_id": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "file_id"
              ]
            }
          ]
        }
      ],
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "origin": {
          "anyOf": [
            {
              "enum": [
                "matrx",
                "external"
              ],
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Origin"
        },
        "file_id": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "File Id"
        },
        "url": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Url"
        },
        "mime_type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Mime Type"
        },
        "size_bytes": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Size Bytes"
        },
        "type": {
          "const": "media",
          "default": "media",
          "title": "Type",
          "type": "string"
        },
        "kind": {
          "const": "video",
          "default": "video",
          "title": "Kind",
          "type": "string"
        },
        "width": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Width"
        },
        "height": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Height"
        },
        "duration_ms": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Duration Ms"
        }
      },
      "required": [
        "type",
        "kind"
      ],
      "title": "VideoMediaPart",
      "type": "object"
    },
    "WebSearchPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "type": {
          "const": "web_search",
          "default": "web_search",
          "title": "Type",
          "type": "string"
        },
        "id": {
          "default": "",
          "title": "Id",
          "type": "string"
        },
        "status": {
          "default": "",
          "title": "Status",
          "type": "string"
        }
      },
      "required": [
        "type"
      ],
      "title": "WebSearchPart",
      "type": "object"
    },
    "WebpageInputPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "type": {
          "const": "input_webpage",
          "default": "input_webpage",
          "title": "Type",
          "type": "string"
        },
        "urls": {
          "items": {
            "anyOf": [
              {
                "minLength": 1,
                "type": "string"
              },
              {
                "$ref": "#/$defs/PreFetchedUrl"
              }
            ]
          },
          "minItems": 1,
          "title": "Urls",
          "type": "array"
        },
        "convert_to_text": {
          "default": true,
          "title": "Convert To Text",
          "type": "boolean"
        },
        "optional_context": {
          "default": false,
          "title": "Optional Context",
          "type": "boolean"
        },
        "keep_fresh": {
          "default": false,
          "title": "Keep Fresh",
          "type": "boolean"
        },
        "editable": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Editable"
        }
      },
      "required": [
        "urls",
        "type"
      ],
      "title": "WebpageInputPart",
      "type": "object"
    },
    "WorkbookInputPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "convert_to_text": {
          "default": true,
          "title": "Convert To Text",
          "type": "boolean"
        },
        "optional_context": {
          "default": false,
          "title": "Optional Context",
          "type": "boolean"
        },
        "keep_fresh": {
          "default": false,
          "title": "Keep Fresh",
          "type": "boolean"
        },
        "editable": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Editable"
        },
        "template": {
          "anyOf": [
            {
              "enum": [
                "full",
                "compact",
                "minimal"
              ],
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Template"
        },
        "type": {
          "const": "input_workbook",
          "default": "input_workbook",
          "title": "Type",
          "type": "string"
        },
        "workbook_ids": {
          "items": {
            "anyOf": [
              {
                "minLength": 1,
                "type": "string"
              },
              {
                "$ref": "#/$defs/LiveResourceRefInput"
              }
            ]
          },
          "minItems": 1,
          "title": "Workbook Ids",
          "type": "array"
        }
      },
      "required": [
        "workbook_ids",
        "type"
      ],
      "title": "WorkbookInputPart",
      "type": "object"
    },
    "YouTubeMediaPart": {
      "additionalProperties": false,
      "properties": {
        "metadata": {
          "additionalProperties": true,
          "title": "Metadata",
          "type": "object"
        },
        "type": {
          "const": "media",
          "default": "media",
          "title": "Type",
          "type": "string"
        },
        "kind": {
          "const": "youtube",
          "default": "youtube",
          "title": "Kind",
          "type": "string"
        },
        "url": {
          "minLength": 1,
          "title": "Url",
          "type": "string"
        },
        "external_url": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "External Url"
        },
        "origin": {
          "const": "external",
          "default": "external",
          "title": "Origin",
          "type": "string"
        },
        "file_id": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "File Id"
        },
        "mime_type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Mime Type"
        },
        "size_bytes": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Size Bytes"
        }
      },
      "required": [
        "url",
        "type",
        "kind"
      ],
      "title": "YouTubeMediaPart",
      "type": "object"
    }
  },
  "anyOf": [
    {
      "$ref": "#/$defs/TextPart"
    },
    {
      "$ref": "#/$defs/ThinkingPart"
    },
    {
      "$ref": "#/$defs/ToolCallPart"
    },
    {
      "$ref": "#/$defs/ToolResultPart"
    },
    {
      "discriminator": {
        "mapping": {
          "audio": "#/$defs/AudioMediaPart",
          "document": "#/$defs/DocumentMediaPart",
          "image": "#/$defs/ImageMediaPart",
          "video": "#/$defs/VideoMediaPart",
          "youtube": "#/$defs/YouTubeMediaPart"
        },
        "propertyName": "kind"
      },
      "oneOf": [
        {
          "$ref": "#/$defs/ImageMediaPart"
        },
        {
          "$ref": "#/$defs/AudioMediaPart"
        },
        {
          "$ref": "#/$defs/VideoMediaPart"
        },
        {
          "$ref": "#/$defs/DocumentMediaPart"
        },
        {
          "$ref": "#/$defs/YouTubeMediaPart"
        }
      ]
    },
    {
      "$ref": "#/$defs/CodeExecPart"
    },
    {
      "$ref": "#/$defs/CodeResultPart"
    },
    {
      "$ref": "#/$defs/WebSearchPart"
    },
    {
      "$ref": "#/$defs/WebpageInputPart"
    },
    {
      "$ref": "#/$defs/NotesInputPart"
    },
    {
      "$ref": "#/$defs/TaskInputPart"
    },
    {
      "$ref": "#/$defs/AgentInputPart"
    },
    {
      "$ref": "#/$defs/ProjectInputPart"
    },
    {
      "$ref": "#/$defs/AgentAppInputPart"
    },
    {
      "$ref": "#/$defs/TranscriptInputPart"
    },
    {
      "$ref": "#/$defs/TranscriptSessionInputPart"
    },
    {
      "$ref": "#/$defs/WorkbookInputPart"
    },
    {
      "$ref": "#/$defs/DocumentInputPart"
    },
    {
      "$ref": "#/$defs/TableInputPart"
    },
    {
      "$ref": "#/$defs/ListInputPart"
    },
    {
      "$ref": "#/$defs/DataInputPart"
    },
    {
      "$ref": "#/$defs/ContextInputPart"
    }
  ]
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaTypeMatches(type: MessagePartJsonSchema["type"], value: unknown): boolean {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isRecord(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  return typeof value === type;
}

function resolveMessagePartSchemaRef(
  ref: string,
  root: MessagePartJsonSchema,
): MessagePartJsonSchema | undefined {
  const prefix = "#/$defs/";
  if (!ref.startsWith(prefix)) return undefined;
  return root.$defs?.[ref.slice(prefix.length)];
}

function matchesMessagePartSchema(
  value: unknown,
  schema: MessagePartJsonSchema,
  root: MessagePartJsonSchema,
): boolean {
  if (schema.$ref) {
    const resolved = resolveMessagePartSchemaRef(schema.$ref, root);
    return resolved !== undefined && matchesMessagePartSchema(value, resolved, root);
  }
  if (schema.anyOf && !schema.anyOf.some((item) => matchesMessagePartSchema(value, item, root))) {
    return false;
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((item) => matchesMessagePartSchema(value, item, root));
    if (matches.length !== 1) return false;
  }
  if (schema.allOf && !schema.allOf.every((item) => matchesMessagePartSchema(value, item, root))) {
    return false;
  }
  if ("const" in schema && !Object.is(value, schema.const)) return false;
  if (schema.enum && !schema.enum.some((item) => Object.is(value, item))) return false;
  if (schema.type && !schemaTypeMatches(schema.type, value)) return false;
  if (schema.type === "string" && typeof value === "string" &&
      schema.minLength !== undefined && value.length < schema.minLength) return false;
  if (schema.type === "array" && Array.isArray(value) &&
      schema.minItems !== undefined && value.length < schema.minItems) return false;
  if ((schema.type === "number" || schema.type === "integer") && typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) return false;
    if (schema.maximum !== undefined && value > schema.maximum) return false;
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) return false;
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) return false;
  }
  if (schema.type === "array" && schema.items && Array.isArray(value)) {
    return value.every((item) => matchesMessagePartSchema(item, schema.items!, root));
  }
  const hasObjectKeywords =
    schema.type === "object" ||
    schema.required !== undefined ||
    schema.properties !== undefined ||
    schema.additionalProperties !== undefined;
  if (!hasObjectKeywords) return true;
  if (!isRecord(value)) return false;
  if (schema.required?.some((key) => !(key in value))) return false;
  const properties = schema.properties ?? {};
  for (const [key, propertySchema] of Object.entries(properties)) {
    if (key in value && !matchesMessagePartSchema(value[key], propertySchema, root)) {
      return false;
    }
  }
  const extraKeys = Object.keys(value).filter((key) => !(key in properties));
  if (schema.additionalProperties === false && extraKeys.length > 0) return false;
  const additionalSchema = schema.additionalProperties;
  if (isRecord(additionalSchema)) {
    return extraKeys.every((key) =>
      matchesMessagePartSchema(value[key], additionalSchema, root),
    );
  }
  return true;
}

/** Runtime guard for persisted chat.message.content entries. */
export function isMessagePart(value: unknown): value is MessagePart {
  return matchesMessagePartSchema(value, MESSAGE_PART_SCHEMA, MESSAGE_PART_SCHEMA);
}

/** Validate and parse the content array from a chat.message DB row. */
export function parseMessageContent(content: unknown[]): MessagePart[] {
  return content.map((part, index) => {
    if (!isMessagePart(part)) {
      throw new TypeError(
        `Invalid chat.message.content[${index}]: unknown or malformed message part`,
      );
    }
    return part;
  });
}

export interface ChunkEvent {
  event: "chunk";
  data: ChunkPayload;
}

export interface ReasoningChunkEvent {
  event: "reasoning_chunk";
  data: ReasoningChunkPayload;
}

export interface ReasoningEvent {
  event: "reasoning";
  data: ReasoningPayload;
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

export interface ProviderRetryEvent {
  event: "provider_retry";
  data: ProviderRetryPayload;
}

export interface CitationEvent {
  event: "citation";
  data: CitationPayload;
}

/** Discriminated union — `event.event === "chunk"` narrows `data` automatically. */
export type TypedStreamEvent =
  | ChunkEvent
  | ReasoningChunkEvent
  | ReasoningEvent
  | PhaseEvent
  | WarningEvent
  | InfoEvent
  | TypedDataEvent
  | InitEvent
  | CompletionEvent
  | ErrorEvent
  | ToolEventEvent
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
  | InjectionConsumedEvent
  | ProviderRetryEvent
  | CitationEvent;

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

export function isReasoningEvent(e: TypedStreamEvent): e is { event: "reasoning"; data: ReasoningPayload } {
  return e.event === "reasoning";
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

export function isProviderRetryEvent(e: TypedStreamEvent): e is { event: "provider_retry"; data: ProviderRetryPayload } {
  return e.event === "provider_retry";
}

export function isCitationEvent(e: TypedStreamEvent): e is { event: "citation"; data: CitationPayload } {
  return e.event === "citation";
}

export function isCompactChunkEvent(e: unknown): e is CompactChunkEvent {
  return typeof e === "object" && e !== null && (e as CompactChunkEvent).e === "c" && typeof (e as CompactChunkEvent).t === "string";
}

export function isCompactReasoningChunkEvent(e: unknown): e is CompactReasoningChunkEvent {
  return typeof e === "object" && e !== null && (e as CompactReasoningChunkEvent).e === "r" && typeof (e as CompactReasoningChunkEvent).t === "string";
}

// CX Dashboard Types — derived from cx_ database tables

export type {
  CxMessage,
  CxContentBlock as CxMessageContentBlock,
} from "@/features/cx-chat/types/cx-tables";

export type CxConversation = {
  id: string;
  user_id: string;
  title: string | null;
  system_instruction: string | null;
  config: Record<string, unknown>;
  status: string;
  message_count: number;
  forked_from_id: string | null;
  forked_at_position: number | null;
  parent_conversation_id: string | null;
  last_model_id: string | null;
  variables: Record<string, unknown>;
  overrides: Record<string, unknown>;
  description: string | null;
  keywords: string[] | null;
  organization_id: string | null;
  project_id: string | null;
  task_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Joined fields
  model_name?: string | null;
  provider?: string | null;
  actual_message_count?: number;
  child_conversation_count?: number;
  total_cost?: number;
  total_tokens?: number;
  user_request_count?: number;
};

export type CxUserRequest = {
  id: string;
  // Derived, not a column: `cx_user_request` no longer stores conversation_id.
  // Resolved through the cx_request m2m (null when no requests exist yet).
  conversation_id: string | null;
  user_id: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cached_tokens: number;
  total_tokens: number;
  total_cost: number | null;
  total_duration_ms: number | null;
  api_duration_ms: number | null;
  tool_duration_ms: number | null;
  iterations: number;
  total_tool_calls: number;
  status: string;
  finish_reason: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  deleted_at: string | null;
  metadata: Record<string, unknown>;
  // Joined fields
  conversation_title?: string | null;
  model_name?: string | null;
  provider?: string | null;
  computed_duration_ms?: number | null;
  request_count?: number;
  tool_call_count?: number;
};

export type CxRequest = {
  id: string;
  user_request_id: string;
  conversation_id: string;
  api_class: string | null;
  iteration: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_tokens: number | null;
  total_tokens: number | null;
  cost: number | null;
  api_duration_ms: number | null;
  tool_duration_ms: number | null;
  total_duration_ms: number | null;
  tool_calls_count: number | null;
  tool_calls_details: unknown | null;
  finish_reason: string | null;
  response_id: string | null;
  ai_model_id: string;
  created_at: string;
  deleted_at: string | null;
  metadata: Record<string, unknown>;
  // Joined fields
  model_name?: string | null;
  provider?: string | null;
};

export type CxToolCall = {
  id: string;
  conversation_id: string;
  message_id: string | null;
  user_id: string;
  user_request_id: string | null;
  tool_name: string;
  tool_type: string;
  call_id: string;
  status: string;
  arguments: Record<string, unknown>;
  success: boolean;
  output: string | null;
  output_type: string | null;
  is_error: boolean | null;
  error_type: string | null;
  error_message: string | null;
  duration_ms: number;
  started_at: string;
  completed_at: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
  iteration: number;
  retry_count: number | null;
  parent_call_id: string | null;
  execution_events: unknown[] | null;
  persist_key: string | null;
  file_path: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  deleted_at: string | null;
};

export type CxMedia = {
  id: string;
  conversation_id: string | null;
  user_id: string;
  kind: string;
  url: string;
  file_uri: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  created_at: string;
  deleted_at: string | null;
  metadata: Record<string, unknown>;
};

// Dashboard aggregate types
export type CxOverviewKpis = {
  total_conversations: number;
  total_user_requests: number;
  total_api_requests: number;
  total_tool_calls: number;
  total_messages: number;
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cached_tokens: number;
  total_tokens: number;
  avg_cost_per_request: number;
  avg_tokens_per_request: number;
  avg_duration_ms: number;
  error_count: number;
  error_rate: number;
  pending_count: number;
  max_tokens_count: number;
  models_used: {
    model_name: string;
    provider: string;
    count: number;
    total_cost: number;
  }[];
  tool_usage: {
    tool_name: string;
    count: number;
    error_count: number;
    avg_duration_ms: number;
    total_cost: number;
  }[];
  daily_stats: {
    date: string;
    requests: number;
    cost: number;
    tokens: number;
    errors: number;
  }[];
};

export type CxTimeframePreset = "day" | "week" | "month" | "quarter" | "all";

export type CxFilters = {
  timeframe: CxTimeframePreset | "custom";
  start_date?: string;
  end_date?: string;
  user_id?: string;
  model_id?: string;
  provider?: string;
  status?: string;
  search?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  page?: number;
  per_page?: number;
};

export type CxCostVerification = {
  user_request_total_cost: number;
  sum_of_request_costs: number;
  sum_of_tool_call_costs: number;
  combined_total: number;
  discrepancy: number;
  has_discrepancy: boolean;
};

export type CxPaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
};

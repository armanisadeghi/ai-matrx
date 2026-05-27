// ─── Tool Definition Types (from Supabase `tools` table) ────────────────────

export interface ParameterDefinition {
  type: "string" | "integer" | "number" | "boolean" | "array" | "object";
  description: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
  items?: ParameterDefinition;
  properties?: Record<string, ParameterDefinition>;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, ParameterDefinition>;
  output_schema: Record<string, unknown> | null;
  annotations: Record<string, unknown> | null;
  /** Provenance of the tool — one of native | mcp_discovered | admin_authored | agent_authored. */
  source_kind: string;
  /** When source_kind=mcp_discovered, the tool_mcp_server row that owns this tool. */
  managed_by_server_id: string | null;
  category: string | null;
  tags: string[] | null;
  icon: string | null;
  is_active: boolean;
  version: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// ─── Streaming Protocol Types ───────────────────────────────────────────────
// Re-export generated types for convenience, but also keep tool-testing
// specific types that aren't in the wire protocol.

import type {
  TypedStreamEvent,
  ToolEventPayload,
  CompletionPayload,
  ErrorPayload,
  EndPayload,
  PhasePayload,
} from "@/types/python-generated/stream-events";

export type {
  TypedStreamEvent,
  ToolEventPayload,
  CompletionPayload,
  ErrorPayload,
  EndPayload,
  PhasePayload,
};

// Tool-testing specific enriched types
export interface ToolStreamEvent {
  event: string;
  call_id: string;
  tool_name: string;
  timestamp: number;
  message: string | null;
  show_spinner: boolean;
  data: Record<string, unknown>;
}

export interface ModelFacingResult {
  tool_use_id: string;
  call_id: string;
  name: string;
  content: string;
  is_error: boolean;
}

export interface FullResult {
  success: boolean;
  output: unknown;
  error: {
    error_type: string;
    message: string;
    suggested_action: string | null;
    is_retryable: boolean;
  } | null;
  duration_ms: number;
  usage: Record<string, unknown> | null;
  child_usages: unknown[];
}

export interface CostEstimateModel {
  model: string;
  api: string;
  input_price_per_million: number | null;
  estimated_cost_usd: number | null;
}

export interface CostEstimate {
  char_count: number;
  estimated_tokens: number;
  chars_per_token: number;
  models: CostEstimateModel[];
}

// Wire format from the Python backend `completion` event:
// { status, output: { model_facing_result, full_result }, metadata: { call_id, conversation_id, cost_estimate, output_schema }, ... }
export interface FinalPayload {
  status: "complete";
  output: {
    model_facing_result: ModelFacingResult;
    full_result: FullResult;
  };
  metadata: {
    conversation_id?: string;
    call_id?: string;
    cost_estimate: CostEstimate | null;
    output_schema: Record<string, unknown> | null;
  };
  iterations?: unknown;
  total_usage?: unknown;
  timing_stats?: unknown;
  tool_call_stats?: unknown;
  finish_reason?: string | null;
}

// ─── Context Types ──────────────────────────────────────────────────────────

/**
 * Full context sent with every tool test execution.
 * All fields except conversation_id map to Python's ContextScope.
 * Must use real IDs from the database — never fake values.
 */
export interface TestContext {
  conversation_id: string;
  organization_id?: string;
  project_id?: string;
  task_id?: string;
}

// ─── Streaming Client Types ─────────────────────────────────────────────────

export interface StreamEventHandlers {
  onPhase?: (data: PhasePayload) => void;
  onToolEvent?: (event: ToolStreamEvent) => void;
  onFinalResult?: (payload: FinalPayload) => void;
  onCompletion?: (data: CompletionPayload) => void;
  onError?: (error: ErrorPayload) => void;
  onEnd?: (data: EndPayload) => void;
  onHeartbeat?: () => void;
  onRawEvent?: (event: TypedStreamEvent) => void;
}

// ─── Execution State ────────────────────────────────────────────────────────

export type ExecutionStatus =
  | "idle"
  | "connecting"
  | "running"
  | "complete"
  | "error"
  | "cancelled";

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

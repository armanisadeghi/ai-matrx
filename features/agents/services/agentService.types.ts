// Types for the AI Dream Agent Service REST surface (`/agent-service/*`).
// Mirrors the backend Pydantic models (aidream/services/agent_service/models.py).
// The server uniquely provides the meta-agent CREATE and the provider-aware
// SCHEMA GATE — things the client can't replicate against Supabase directly.

export type ResponseFormat = "text" | "json" | "json_schema";
export type FeedbackType = "bug" | "feature" | "suggestion" | "other";

export interface AgentVariableInput {
  name: string;
  description?: string;
}

export interface CreateAgentInput {
  name: string;
  goals: string;
  summary?: string;
  variables?: AgentVariableInput[];
  response_format?: ResponseFormat;
  output_schema?: Record<string, unknown> | null;
  sample_output?: Record<string, unknown> | null;
  sample_inputs?: string;
  model_guidance?: string;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  model_id?: string;
  category?: string;
  tags?: string[];
  is_public?: boolean;
  is_active?: boolean;
  is_archived?: boolean;
  output_schema?: Record<string, unknown> | null;
  settings?: Record<string, unknown>;
  tool_config?: Record<string, unknown>;
  skill_config?: Record<string, unknown>;
  context_slots?: Record<string, unknown>[];
  messages?: Record<string, unknown>[];
  variable_definitions?: Record<string, unknown>[];
}

export interface AgentSummary {
  id: string;
  name: string;
  description: string;
  category: string | null;
  tags: string[];
  agent_type: string;
  is_public: boolean;
  version: number;
}

export interface AgentVariableDetail {
  name: string;
  description: string;
  required: boolean;
  default_value: string;
}

export interface AgentDetail {
  id: string;
  name: string;
  description: string;
  agent_type: string;
  category: string | null;
  tags: string[];
  is_public: boolean;
  is_active: boolean;
  version: number;
  model_id: string | null;
  variables: AgentVariableDetail[];
  output_schema: Record<string, unknown> | null;
  settings: Record<string, unknown>;
  tool_config: Record<string, unknown>;
  skill_config: Record<string, unknown>;
}

export interface AgentVersionInfo {
  id: string;
  agent_id: string;
  version_number: number;
  name: string;
  change_note: string | null;
  changed_at: string | null;
}

export interface CatalogTree {
  total: number;
  categories: Record<string, number>;
  tags: Record<string, number>;
  agents: AgentSummary[];
}

export interface ModelInfo {
  id: string;
  name: string;
  common_name: string;
  provider: string;
  api_class: string;
  context_window: number | null;
  is_premium: boolean;
}

export interface ToolInfo {
  name: string;
  description: string;
  category: string | null;
  tags: string[];
  admin_only: boolean;
}

export interface SkillInfo {
  id: string;
  skill_id: string;
  label: string;
  description: string;
  skill_type: string;
  category_path: string[];
}

export interface SchemaFinding {
  provider: string;
  severity: "error" | "warning";
  path: string;
  message: string;
}

export interface SchemaGateReport {
  ok: boolean;
  findings: SchemaFinding[];
  portable_schema: Record<string, unknown> | null;
}

export interface ValidateSchemaRequest {
  output_schema: Record<string, unknown>;
  sample_output?: Record<string, unknown> | null;
}

export interface CatalogQuery {
  category?: string;
  tags?: string[];
  query?: string;
  limit?: number;
}

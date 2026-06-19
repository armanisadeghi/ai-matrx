import type { Database } from "@/types/database.types";

// =============================================================================
// Raw DB types — source of truth, never hand-edit
// =============================================================================

export type AiModelRow = Database["public"]["Tables"]["ai_model"]["Row"];
export type AiModelInsert = Database["public"]["Tables"]["ai_model"]["Insert"];
export type AiModelUpdate = Database["public"]["Tables"]["ai_model"]["Update"];

export type AiProviderRow = Database["public"]["Tables"]["ai_provider"]["Row"];
export type AiProviderInsert =
  Database["public"]["Tables"]["ai_provider"]["Insert"];
export type AiProviderUpdate =
  Database["public"]["Tables"]["ai_provider"]["Update"];

export type AiEndpointRow = Database["public"]["Tables"]["ai_endpoint"]["Row"];
export type AiEndpointInsert =
  Database["public"]["Tables"]["ai_endpoint"]["Insert"];
export type AiEndpointUpdate =
  Database["public"]["Tables"]["ai_endpoint"]["Update"];

// =============================================================================
// Json-field shape definitions — what we actually store in JSONB columns
// =============================================================================

export type PricingTier = {
  max_tokens: number | null;
  input_price: number;
  output_price: number;
  cached_input_price: number;
  // Billing unit the prices map to. null/absent = standard $/1M-token billing.
  // Values + meaning: features/ai-models/usageBasis.ts (mirrors the matrx-ai
  // server SSOT). Drives correct media/audio cost — never leave a media model
  // without a basis. Optional `note` is free-text documentation on the tier.
  usage_basis?: string | null;
  note?: string | null;
};

// -- Unconditional constraints: single-field checks that always apply --------

export type UnconditionalRule =
  | "required"
  | "fixed"
  | "min"
  | "max"
  | "one_of"
  | "forbidden";

export type UnconditionalConstraint = {
  id: string;
  rule: UnconditionalRule;
  field: string;
  value?: unknown;
  severity: "error" | "warning" | "info";
  message: string;
};

// -- Conditional constraints: require X when Y is true ----------------------

export type ConditionOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in"
  | "exists"
  | "not_exists";

export type FieldCondition = {
  field: string;
  op: ConditionOp;
  value?: unknown;
};

export type ConditionalConstraint = {
  id: string;
  when: FieldCondition;
  require: FieldCondition;
  severity: "error" | "warning" | "info";
  message: string;
};

// -- Union: discriminated by presence of "rule" vs "when"+"require" ----------

export type ModelConstraint = UnconditionalConstraint | ConditionalConstraint;

export function isConditionalConstraint(
  c: ModelConstraint,
): c is ConditionalConstraint {
  return "when" in c && "require" in c;
}

export type ControlParamType =
  | "boolean"
  | "number"
  | "integer"
  | "string"
  | "array"
  | "object";

export type ControlParam = {
  type?: ControlParamType;
  min?: number;
  max?: number;
  default?: unknown;
  allowed?: boolean;
  enum?: string[];
  items?: { type: string };
  maxItems?: number;
  required?: boolean;
};

export type ControlsSchema = Record<string, ControlParam>;

export type ProviderModelEntry = {
  id: string;
  display_name?: string;
  created_at?: string;
  type?: string;
  max_input_tokens?: number | null;
  max_tokens?: number | null;
  capabilities?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type ProviderModelsCache = {
  fetched_at: string;
  models: ProviderModelEntry[];
  raw?: unknown;
};

// =============================================================================
// Augmented types — DB Row with Json fields narrowed to real shapes
// These are what the codebase imports and uses everywhere.
// =============================================================================

export type AiModel = Omit<
  AiModelRow,
  "controls" | "constraints" | "pricing" | "endpoints" | "capabilities"
> & {
  controls: ControlsSchema | null;
  constraints: ModelConstraint[] | null;
  pricing: PricingTier[] | null;
  endpoints: string[] | null;
  capabilities: Record<string, unknown> | string[] | null;
  // Tier-fallback FKs (added in migration 0045 — guest_mode_and_model_tiers).
  // When set, the aidream backend substitutes this model for the current one
  // when the caller is at the matching tier:
  //   - `mid_fallback_id`: paying user past soft limit (e.g., Opus → Sonnet)
  //   - `guest_fallback_id`: anonymous guest user (e.g., Opus → Haiku)
  // NULL = no swap; the agent's declared model is used as-is.
  // Optional because database.types.ts hasn't been regenerated yet — these
  // become required-but-nullable once `pnpm db:generate` runs.
  mid_fallback_id?: string | null;
  guest_fallback_id?: string | null;
};

export type AiProvider = Omit<AiProviderRow, "provider_models_cache"> & {
  provider_models_cache: ProviderModelsCache | null;
};

// =============================================================================
// UI / form types
// =============================================================================

export type AiModelFormData = {
  name: string;
  common_name: string;
  model_class: string;
  provider: string;
  api_class: string;
  context_window: string;
  max_tokens: string;
  model_provider: string;
  is_deprecated: boolean;
  is_primary: boolean;
  is_premium: boolean;
  pricing: PricingTier[];
  // Empty string = no swap (NULL in DB); otherwise the ai_model.id of the
  // model to substitute when the caller is at that tier.
  mid_fallback_id: string;
  guest_fallback_id: string;
};

// =============================================================================
// Audit / usage types
// =============================================================================

export type ModelUsageItem = {
  id: string;
  name: string;
  table: "prompts" | "prompt_builtins" | "agx_agent" | "agx_agent_templates";
  source_prompt_id?: string | null;
};

export type ModelUsageResult = {
  prompts: ModelUsageItem[];
  promptBuiltins: ModelUsageItem[];
  agents: ModelUsageItem[];
  agentTemplates: ModelUsageItem[];
};

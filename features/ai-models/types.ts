import type { Database } from "@/types/database.types";

// =============================================================================
// Raw DB types — source of truth, never hand-edit
// =============================================================================

export type AiModelRow = Database["ai"]["Tables"]["model_definition"]["Row"];
export type AiModelInsert = Database["ai"]["Tables"]["model_definition"]["Insert"];
export type AiModelUpdate = Database["ai"]["Tables"]["model_definition"]["Update"];

export type AiProviderRow = Database["ai"]["Tables"]["provider"]["Row"];
export type AiProviderInsert = Database["ai"]["Tables"]["provider"]["Insert"];
export type AiProviderUpdate = Database["ai"]["Tables"]["provider"]["Update"];

export type AiEndpointRow = Database["ai"]["Tables"]["endpoint"]["Row"];
export type AiEndpointInsert = Database["ai"]["Tables"]["endpoint"]["Insert"];
export type AiEndpointUpdate = Database["ai"]["Tables"]["endpoint"]["Update"];

export type AiServiceRow = Database["ai"]["Tables"]["service"]["Row"];
export type AiServiceInsert = Database["ai"]["Tables"]["service"]["Insert"];
export type AiServiceUpdate = Database["ai"]["Tables"]["service"]["Update"];

export type AiOfferingRow = Database["ai"]["Tables"]["offering"]["Row"];
export type AiOfferingInsert = Database["ai"]["Tables"]["offering"]["Insert"];
export type AiOfferingUpdate = Database["ai"]["Tables"]["offering"]["Update"];

export type AiSettingRow = Database["ai"]["Tables"]["setting"]["Row"];
export type AiSettingInsert = Database["ai"]["Tables"]["setting"]["Insert"];
export type AiSettingUpdate = Database["ai"]["Tables"]["setting"]["Update"];

export type AiModelOfferingViewRow = Database["ai"]["Views"]["model_offering"]["Row"];

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
  | "controls"
  | "constraints"
  | "pricing"
  | "endpoints"
  | "capabilities"
  // `api_class` is being dropped from ai.model_definition. Nothing in the app
  // may read it — routing is decided by ai.service.wire_format on the server.
  | "api_class"
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

export type AiService = Omit<
  AiServiceRow,
  "auth_ref" | "controls" | "request_defaults" | "metadata"
> & {
  auth_ref: Record<string, unknown>;
  controls: ControlsSchema;
  request_defaults: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type AiOffering = Omit<
  AiOfferingRow,
  "pricing" | "capabilities_override" | "controls_override" | "metadata"
> & {
  pricing: PricingTier[];
  capabilities_override: Record<string, unknown>;
  controls_override: ControlsSchema;
  metadata: Record<string, unknown>;
};

export type AiSetting = Omit<
  AiSettingRow,
  "canonical_values" | "default_value" | "ui" | "metadata"
> & {
  canonical_values: unknown[] | null;
  default_value: unknown;
  ui: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

/** Row shape of the read-only `ai.model_offering` reporting view (offering ×
 *  service × model_definition joined, points-based pricing computed). */
export type AiModelOfferingView = AiModelOfferingViewRow;

// =============================================================================
// UI / form types
// =============================================================================

export type AiModelFormData = {
  name: string;
  common_name: string;
  model_class: string;
  provider: string;
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

export type AiOfferingFormData = {
  model_id: string;
  service_id: string;
  provider_model_id: string;
  priority: string;
  is_available: boolean;
  pricing: PricingTier[];
  usage_basis: string;
  capabilities_override: Record<string, unknown>;
  controls_override: Record<string, unknown>;
  notes: string;
  visibility: string;
};

/** Form-editable shape of an `ai.setting` row (canonical settings vocabulary).
 *  `canonical_min`/`canonical_max` are text inputs (empty string = NULL).
 *  `canonical_values` / `default_value` / `ui` are edited via
 *  EnhancedEditableJsonViewer — see SettingForm.tsx for the wrap/unwrap
 *  needed because that viewer only accepts a plain object at its root. */
export type AiSettingFormData = {
  key: string;
  value_type: string;
  canonical_min: string;
  canonical_max: string;
  canonical_values: unknown[];
  default_value: unknown;
  ui: Record<string, unknown>;
  description: string;
  visibility: AiSetting["visibility"];
};

// =============================================================================
// Audit / usage types
// =============================================================================

export type ModelUsageItem = {
  id: string;
  name: string;
  // "prompt_builtins" migrated to "agent.definition" (agent_type='builtin'); kept in union only for old serialized data
  table: "prompts" | "prompt_builtins" | "agent.definition" | "agent.template";
  source_prompt_id?: string | null;
};

export type ModelUsageResult = {
  prompts: ModelUsageItem[];
  promptBuiltins: ModelUsageItem[];
  agents: ModelUsageItem[];
  agentTemplates: ModelUsageItem[];
};

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

export type AiApiRow = Database["ai"]["Tables"]["api"]["Row"];
export type AiApiInsert = Database["ai"]["Tables"]["api"]["Insert"];
export type AiApiUpdate = Database["ai"]["Tables"]["api"]["Update"];

export type AiModelAliasRow = Database["ai"]["Tables"]["model_alias"]["Row"];
export type AiModelAliasInsert =
  Database["ai"]["Tables"]["model_alias"]["Insert"];
export type AiModelAliasUpdate =
  Database["ai"]["Tables"]["model_alias"]["Update"];

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

/** The enveloped rules shape stored in `ai.api.rules` and `ai.offering.override`:
 *  `{"params": {...ControlsSchema}, "constraints": [...ModelConstraint]}`.
 *  Never store a flat param map — the envelope is the canonical wire shape. */
export type RulesEnvelope = {
  params: ControlsSchema;
  constraints: ModelConstraint[];
};

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

// NOTE (2026-07-10, ai_034): the legacy `api_class`/`model_class`/`controls`/
// `constraints` columns are DROPPED from ai.model_definition. Routing facts
// live on ai.offering → ai.api; resolved controls/constraints come from the
// `ai.model_config` view (registry slice full records), never the model row.
export type AiModel = Omit<AiModelRow, "capabilities"> & {
  capabilities: Record<string, unknown> | string[] | null;
  /** Resolved brand/maker display name (`ai.provider.name` via the
   *  `provider_id` FK). NOT a stored column on the model row — the service /
   *  fetch layer attaches it. This replaced the dropped free-text `provider`
   *  column for all display, filtering, and grouping. */
  maker: string | null;
};

export type AiProvider = Omit<AiProviderRow, "provider_models_cache"> & {
  provider_models_cache: ProviderModelsCache | null;
};

/** `ai.endpoint` — ONE row per serving vendor (admin-only surface; users never
 *  see vendors). Json fields narrowed to their stored shapes. */
export type AiEndpoint = Omit<AiEndpointRow, "auth_ref" | "metadata"> & {
  auth_ref: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

/** `ai.api` — one row per wire contract (translator_key = the old wire_format
 *  vocabulary). `rules` is the canonical params/constraints envelope. */
export type AiApi = Omit<
  AiApiRow,
  "rules" | "request_defaults" | "metadata"
> & {
  rules: RulesEnvelope;
  request_defaults: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type AiOffering = Omit<
  AiOfferingRow,
  "pricing" | "capabilities_override" | "override" | "metadata"
> & {
  pricing: PricingTier[];
  capabilities_override: Record<string, unknown>;
  /** Per-offering override of the api's rules — same envelope shape. */
  override: RulesEnvelope;
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
 *  endpoint/api × model_definition joined, points-based pricing computed —
 *  serving vendor deliberately NOT exposed). */
export type AiModelOfferingView = AiModelOfferingViewRow;

// =============================================================================
// UI / form types
// =============================================================================

export type AiModelFormData = {
  name: string;
  common_name: string;
  context_window: string;
  max_tokens: string;
  // The model's maker/brand is set via this FK (ai.provider). The old free-text
  // `provider` column is dropped and derived — never edited here.
  provider_id: string;
  is_deprecated: boolean;
  is_primary: boolean;
  is_premium: boolean;
  // Empty string = no swap (NULL in DB); otherwise the ai_model.id of the
  // model to substitute when the caller is at that tier.
  mid_fallback_id: string;
  guest_fallback_id: string;
  // Curated ratings (1-6 smallints; 6 = the "5+" band). Empty string = NULL.
  cost_rating: string;
  speed_rating: string;
  // Retry fallback: model to substitute after retry_max_attempts failures.
  retry_fallback_id: string;
  retry_max_attempts: string;
};
// NOTE: model-level `pricing` editing was removed — pricing lives on
// `ai.offering` now (managed via OfferingForm/OfferingsContainer). Do not
// re-add a `pricing` field here.

export type AiOfferingFormData = {
  model_id: string;
  endpoint_id: string;
  api_id: string;
  provider_model_id: string;
  priority: string;
  is_available: boolean;
  pricing: PricingTier[];
  usage_basis: string;
  // `ai.offering.token_billed` — this offering's provider bills REAL tokens even
  // though the model emits media, so a NULL usage_basis is intentional (not a
  // pricing bug). See features/ai-models/usageBasis.ts.
  token_billed: boolean;
  capabilities_override: Record<string, unknown>;
  /** Full `override` envelope. The form UI edits `override.params` (the old
   *  flat controls map) and carries `override.constraints` through untouched. */
  override: {
    params: Record<string, unknown>;
    constraints: unknown[];
  };
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

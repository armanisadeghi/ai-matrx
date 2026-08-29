"use client";

import { supabase } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";
import { isJsonArray, isJsonObject, type JsonObject } from "@/types/json";
import type {
  AiModel,
  AiModelRow,
  AiModelAliasRow,
  AiModelAliasInsert,
  AiModelAliasUpdate,
  AiModelInsert,
  AiModelUpdate,
  AiModelOfferingView,
  AiOffering,
  AiOfferingRow,
  AiOfferingInsert,
  AiOfferingUpdate,
  AiProvider,
  AiProviderRow,
  AiProviderInsert,
  AiProviderUpdate,
  AiApi,
  AiApiRow,
  AiApiInsert,
  AiApiUpdate,
  AiEndpoint,
  AiEndpointRow,
  AiEndpointInsert,
  AiEndpointUpdate,
  AiSetting,
  AiSettingRow,
  AiSettingInsert,
  AiSettingUpdate,
  ModelUsageResult,
  ModelPriceSummary,
  ConditionOp,
  ControlRule,
  FieldCondition,
  ModelConstraint,
  PricingTier,
  ProviderModelEntry,
  ProviderModelsCache,
  RulesEnvelope,
  RulesParams,
  UnconditionalRule,
} from "./types";
import type { LLMParams } from "@/features/agents/types/agent-api-types";

type ReplaceModelReferencesResult = {
  agents: number;
  builtins: number;
  templates: number;
};

function boundaryError(path: string, expected: string): Error {
  return new Error(`Invalid AI model data at ${path}: expected ${expected}.`);
}

function requireJsonObject(value: unknown, path: string): JsonObject {
  if (!isJsonObject(value)) throw boundaryError(path, "a JSON object");
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") throw boundaryError(path, "a string");
  return value;
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw boundaryError(path, "a finite number");
  }
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw boundaryError(path, "a boolean");
  return value;
}

function parseReplaceModelReferencesResult(
  value: unknown,
): ReplaceModelReferencesResult {
  const record = requireJsonObject(value, "replace-references response");
  return {
    agents: requireFiniteNumber(
      record.agents,
      "replace-references response.agents",
    ),
    builtins: requireFiniteNumber(
      record.builtins,
      "replace-references response.builtins",
    ),
    templates: requireFiniteNumber(
      record.templates,
      "replace-references response.templates",
    ),
  };
}

async function replaceModelReferencesViaAdmin(
  oldId: string,
  newId: string,
  newSettings?: LLMParams,
): Promise<ReplaceModelReferencesResult> {
  const response = await fetch("/api/admin/ai-models/replace-references", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      oldModelId: oldId,
      newModelId: newId,
      newSettings,
    }),
  });

  const payload: unknown = await response.json();

  if (!response.ok) {
    const error = isJsonObject(payload) ? payload.error : undefined;
    throw new Error(
      typeof error === "string" ? error : "Failed to replace model references.",
    );
  }

  return parseReplaceModelReferencesResult(payload);
}

// Minimal row shapes for the agent.definition / agent.template usage queries.
// Pinned via `.returns<>()` because the large cross-schema FK graph (added in the
// 2026 reorg) pushes the inferred `.select().or()` result past TS's recursion
// depth (TS2589). The queries and data are unchanged; only inference is overridden.
type AgentUsageRow = {
  id: string;
  name: string | null;
  model_id: string | null;
};
type AgentBuiltinUsageRow = {
  id: string;
  name: string | null;
  source_agent_id: string | null;
  settings: Record<string, unknown> | null;
};
type AgentBuiltinSettingsRow = {
  id: string;
  model_id: string | null;
  settings: Record<string, unknown> | null;
};

const CONDITION_OPS: readonly ConditionOp[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "not_in",
  "exists",
  "not_exists",
];

const UNCONDITIONAL_RULES: readonly UnconditionalRule[] = [
  "required",
  "fixed",
  "min",
  "max",
  "one_of",
  "forbidden",
];

function isConditionOp(value: unknown): value is ConditionOp {
  return typeof value === "string" && CONDITION_OPS.some((op) => op === value);
}

function isUnconditionalRule(value: unknown): value is UnconditionalRule {
  return (
    typeof value === "string" &&
    UNCONDITIONAL_RULES.some((rule) => rule === value)
  );
}

function parseFieldCondition(value: unknown, path: string): FieldCondition {
  const record = requireJsonObject(value, path);
  if (!isConditionOp(record.op)) {
    throw boundaryError(`${path}.op`, "a supported condition operator");
  }
  const condition: FieldCondition = {
    field: requireString(record.field, `${path}.field`),
    op: record.op,
  };
  if (record.value !== undefined) condition.value = record.value;
  return condition;
}

function parseConstraint(value: unknown, path: string): ModelConstraint {
  const record = requireJsonObject(value, path);
  const severity = record.severity;
  if (severity !== "error" && severity !== "warning" && severity !== "info") {
    throw boundaryError(`${path}.severity`, "error, warning, or info");
  }
  const common: Pick<ModelConstraint, "id" | "severity" | "message"> = {
    id: requireString(record.id, `${path}.id`),
    severity,
    message: requireString(record.message, `${path}.message`),
  };

  if (record.rule !== undefined) {
    if (!isUnconditionalRule(record.rule)) {
      throw boundaryError(`${path}.rule`, "a supported unconditional rule");
    }
    return record.value === undefined
      ? {
          ...common,
          rule: record.rule,
          field: requireString(record.field, `${path}.field`),
        }
      : {
          ...common,
          rule: record.rule,
          field: requireString(record.field, `${path}.field`),
          value: record.value,
        };
  }

  return {
    ...common,
    when: parseFieldCondition(record.when, `${path}.when`),
    require: parseFieldCondition(record.require, `${path}.require`),
  };
}

function parseControlRule(value: unknown, path: string): ControlRule {
  const record = requireJsonObject(value, path);
  const rule: ControlRule = {};
  if (record.provider_key !== undefined) {
    rule.provider_key = requireString(
      record.provider_key,
      `${path}.provider_key`,
    );
  }
  if (record.value_map !== undefined) {
    rule.value_map = requireJsonObject(record.value_map, `${path}.value_map`);
  }
  if (record.on_unmapped !== undefined) {
    rule.on_unmapped = requireString(record.on_unmapped, `${path}.on_unmapped`);
  }
  if (record.clamp !== undefined) {
    const clampRecord = requireJsonObject(record.clamp, `${path}.clamp`);
    const clamp: { min?: number | null; max?: number | null } = {};
    if (clampRecord.min !== undefined) {
      clamp.min =
        clampRecord.min === null
          ? null
          : requireFiniteNumber(clampRecord.min, `${path}.clamp.min`);
    }
    if (clampRecord.max !== undefined) {
      clamp.max =
        clampRecord.max === null
          ? null
          : requireFiniteNumber(clampRecord.max, `${path}.clamp.max`);
    }
    rule.clamp = clamp;
  }
  if (record.supported !== undefined) {
    rule.supported = requireBoolean(record.supported, `${path}.supported`);
  }
  if (record.default !== undefined) rule.default = record.default;
  if (record.send_when_unset !== undefined) {
    rule.send_when_unset = requireBoolean(
      record.send_when_unset,
      `${path}.send_when_unset`,
    );
  }
  if (record.const !== undefined) rule.const = record.const;
  if (record.processor !== undefined) {
    rule.processor = requireString(record.processor, `${path}.processor`);
  }
  if (record.processor_config !== undefined) {
    rule.processor_config = requireJsonObject(
      record.processor_config,
      `${path}.processor_config`,
    );
  }
  if (record.ui_values !== undefined) {
    if (!isJsonArray(record.ui_values)) {
      throw boundaryError(`${path}.ui_values`, "a JSON array");
    }
    rule.ui_values = record.ui_values;
  }
  return rule;
}

function parseRulesEnvelope(value: unknown, path: string): RulesEnvelope {
  const record = requireJsonObject(value, path);
  const rawParams = requireJsonObject(record.params, `${path}.params`);
  const params: RulesParams = {};
  for (const [key, rule] of Object.entries(rawParams)) {
    params[key] = parseControlRule(rule, `${path}.params.${key}`);
  }
  if (!isJsonArray(record.constraints)) {
    throw boundaryError(`${path}.constraints`, "a JSON array");
  }
  return {
    params,
    constraints: record.constraints.map((constraint, index) =>
      parseConstraint(constraint, `${path}.constraints[${index}]`),
    ),
  };
}

function parsePricingTier(value: unknown, path: string): PricingTier {
  const record = requireJsonObject(value, path);
  const usageBasis = record.usage_basis;
  const note = record.note;
  if (
    usageBasis !== undefined &&
    usageBasis !== null &&
    typeof usageBasis !== "string"
  ) {
    throw boundaryError(`${path}.usage_basis`, "a string or null");
  }
  if (note !== undefined && note !== null && typeof note !== "string") {
    throw boundaryError(`${path}.note`, "a string or null");
  }
  const maxTokens = record.max_tokens;
  if (maxTokens !== null && typeof maxTokens !== "number") {
    throw boundaryError(`${path}.max_tokens`, "a number or null");
  }
  const tier: PricingTier = {
    max_tokens:
      maxTokens === null
        ? null
        : requireFiniteNumber(maxTokens, `${path}.max_tokens`),
    input_price: requireFiniteNumber(record.input_price, `${path}.input_price`),
    output_price: requireFiniteNumber(
      record.output_price,
      `${path}.output_price`,
    ),
    cached_input_price: requireFiniteNumber(
      record.cached_input_price,
      `${path}.cached_input_price`,
    ),
  };
  if (usageBasis !== undefined) tier.usage_basis = usageBasis;
  if (note !== undefined) tier.note = note;
  return tier;
}

function parsePricing(value: unknown, path: string): PricingTier[] {
  if (!isJsonArray(value)) throw boundaryError(path, "a JSON array");
  return value.map((tier, index) =>
    parsePricingTier(tier, `${path}[${index}]`),
  );
}

function parseProviderModelEntry(
  value: unknown,
  path: string,
): ProviderModelEntry {
  const record = requireJsonObject(value, path);
  const result: ProviderModelEntry = {
    id: requireString(record.id, `${path}.id`),
  };
  for (const [key, entryValue] of Object.entries(record)) {
    result[key] = entryValue;
  }
  result.id = requireString(record.id, `${path}.id`);
  if (
    record.display_name !== undefined &&
    typeof record.display_name !== "string"
  ) {
    throw boundaryError(`${path}.display_name`, "a string");
  }
  if (
    record.created_at !== undefined &&
    typeof record.created_at !== "string"
  ) {
    throw boundaryError(`${path}.created_at`, "a string");
  }
  if (record.type !== undefined && typeof record.type !== "string") {
    throw boundaryError(`${path}.type`, "a string");
  }
  if (
    record.max_input_tokens !== undefined &&
    record.max_input_tokens !== null &&
    (typeof record.max_input_tokens !== "number" ||
      !Number.isFinite(record.max_input_tokens))
  ) {
    throw boundaryError(`${path}.max_input_tokens`, "a finite number or null");
  }
  if (
    record.max_tokens !== undefined &&
    record.max_tokens !== null &&
    (typeof record.max_tokens !== "number" ||
      !Number.isFinite(record.max_tokens))
  ) {
    throw boundaryError(`${path}.max_tokens`, "a finite number or null");
  }
  if (
    record.capabilities !== undefined &&
    record.capabilities !== null &&
    !isJsonObject(record.capabilities)
  ) {
    throw boundaryError(`${path}.capabilities`, "a JSON object or null");
  }
  return result;
}

function parseProviderModelsCache(
  value: unknown,
  path: string,
): ProviderModelsCache | null {
  if (value === null) return null;
  const record = requireJsonObject(value, path);
  if (!isJsonArray(record.models)) {
    throw boundaryError(`${path}.models`, "a JSON array");
  }
  const cache: ProviderModelsCache = {
    fetched_at: requireString(record.fetched_at, `${path}.fetched_at`),
    models: record.models.map((model, index) =>
      parseProviderModelEntry(model, `${path}.models[${index}]`),
    ),
  };
  if (record.raw !== undefined) cache.raw = record.raw;
  return cache;
}

function parseAiModelCapabilities(
  value: unknown,
  path: string,
): AiModel["capabilities"] {
  if (value === null || isJsonObject(value)) return value;
  if (isJsonArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }
  throw boundaryError(path, "a JSON object, string array, or null");
}

function withValidatedCapabilities(row: AiModelRow): Omit<AiModel, "maker"> {
  return {
    ...row,
    capabilities: parseAiModelCapabilities(
      row.capabilities,
      `ai.model_definition.${row.id}.capabilities`,
    ),
  };
}

function parseProvider(row: AiProviderRow): AiProvider {
  return {
    ...row,
    provider_models_cache: parseProviderModelsCache(
      row.provider_models_cache,
      `ai.provider.${row.id}.provider_models_cache`,
    ),
  };
}

function parseEndpoint(row: AiEndpointRow): AiEndpoint {
  return {
    ...row,
    auth_ref: requireJsonObject(row.auth_ref, `ai.endpoint.${row.id}.auth_ref`),
    metadata: requireJsonObject(row.metadata, `ai.endpoint.${row.id}.metadata`),
  };
}

function parseApi(row: AiApiRow): AiApi {
  return {
    ...row,
    rules: parseRulesEnvelope(row.rules, `ai.api.${row.id}.rules`),
    request_defaults: requireJsonObject(
      row.request_defaults,
      `ai.api.${row.id}.request_defaults`,
    ),
    metadata: requireJsonObject(row.metadata, `ai.api.${row.id}.metadata`),
  };
}

function parseOffering(row: AiOfferingRow): AiOffering {
  return {
    ...row,
    pricing: parsePricing(row.pricing, `ai.offering.${row.id}.pricing`),
    capabilities_override: requireJsonObject(
      row.capabilities_override,
      `ai.offering.${row.id}.capabilities_override`,
    ),
    override: parseRulesEnvelope(
      row.override,
      `ai.offering.${row.id}.override`,
    ),
    metadata: requireJsonObject(row.metadata, `ai.offering.${row.id}.metadata`),
  };
}

function parseSetting(row: AiSettingRow): AiSetting {
  if (row.canonical_values !== null && !isJsonArray(row.canonical_values)) {
    throw boundaryError(
      `ai.setting.${row.id}.canonical_values`,
      "a JSON array or null",
    );
  }
  return {
    ...row,
    canonical_values: row.canonical_values,
    ui: requireJsonObject(row.ui, `ai.setting.${row.id}.ui`),
    metadata: requireJsonObject(row.metadata, `ai.setting.${row.id}.metadata`),
  };
}

function modelFieldUpdate(
  field: keyof AiModelUpdate | keyof Omit<AiModel, "id">,
  value: AiModel[keyof AiModel],
): AiModelUpdate {
  switch (field) {
    case "common_name":
      if (value !== null && typeof value !== "string") {
        throw boundaryError(
          "ai.model_definition.common_name",
          "a string or null",
        );
      }
      return { common_name: value };
    case "context_window":
      if (value !== null && typeof value !== "number") {
        throw boundaryError(
          "ai.model_definition.context_window",
          "a number or null",
        );
      }
      return { context_window: value };
    case "max_tokens":
      if (value !== null && typeof value !== "number") {
        throw boundaryError(
          "ai.model_definition.max_tokens",
          "a number or null",
        );
      }
      return { max_tokens: value };
    case "capabilities":
      return {
        capabilities: parseAiModelCapabilities(
          value,
          "ai.model_definition.capabilities",
        ),
      };
    default:
      throw new Error(
        `Unsupported inline AI model field update: ${String(field)}.`,
      );
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Normalize only the first (preferred) pricing band returned by the admin
 * catalog. The JSONB boundary stays validated instead of asserted. */
function preferredPrice(
  pricing: unknown,
  offeringUsageBasis: string | null,
): ModelPriceSummary | null {
  const band = Array.isArray(pricing) ? pricing[0] : pricing;
  if (typeof band !== "object" || band === null || Array.isArray(band)) {
    return null;
  }
  const record: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(band)) record[key] = value;
  return {
    input_price: numberOrNull(record.input_price),
    output_price: numberOrNull(record.output_price),
    cached_input_price: numberOrNull(record.cached_input_price),
    usage_basis:
      typeof record.usage_basis === "string"
        ? record.usage_basis
        : offeringUsageBasis,
  };
}

export const aiModelService = {
  async fetchAll(): Promise<AiModel[]> {
    // Resolve `maker` from the provider_id FK (ai.provider.name). The old
    // free-text `provider` column is dropping — never read it. Fetch providers
    // alongside models and map by id so every row carries a display brand.
    const [modelsRes, providers, adminCatalogRes] = await Promise.all([
      supabase
        .schema("ai")
        .from("model_definition")
        .select("*")
        .order("common_name", { ascending: true, nullsFirst: false }),
      this.fetchProviders(),
      supabase.rpc("admin_model_catalog"),
    ]);
    if (modelsRes.error) throw modelsRes.error;
    if (adminCatalogRes.error) throw adminCatalogRes.error;
    const makerById = new Map(providers.map((p) => [p.id, p.name ?? null]));
    const comparisonById = new Map<string, ModelPriceSummary | null>();
    for (const row of adminCatalogRes.data ?? []) {
      if (typeof row.id !== "string") continue;
      comparisonById.set(row.id, preferredPrice(row.pricing, row.usage_basis));
    }
    return (modelsRes.data ?? []).map((row): AiModel => ({
      ...withValidatedCapabilities(row),
      maker: row.provider_id ? (makerById.get(row.provider_id) ?? null) : null,
      preferred_pricing: comparisonById.get(row.id) ?? null,
    }));
  },

  async fetchProviders(): Promise<AiProvider[]> {
    const { data, error } = await supabase
      .schema("ai")
      .from("provider")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return data.map(parseProvider);
  },

  async updateProviderCache(
    providerId: string,
    cache: ProviderModelsCache,
  ): Promise<void> {
    const { error } = await supabase
      .schema("ai")
      .from("provider")
      .update({ provider_models_cache: cache })
      .eq("id", providerId);
    if (error) throw error;
  },

  async fetchProviderWithCache(providerId: string): Promise<AiProvider | null> {
    const { data, error } = await supabase
      .schema("ai")
      .from("provider")
      .select("*")
      .eq("id", providerId)
      .single();
    if (error) throw error;
    return parseProvider(data);
  },

  // ── Provider CRUD (identity fields — separate from the cache-only helpers above) ──

  /** Full-column provider fetch for the Provider CRUD screen (all fields,
   *  including slug/website_url/logo_url/visibility/is_system/organization_id).
   *  `fetchProviders()` above shares this complete generated row contract;
   *  its read-only consumers simply use fewer fields. */
  async fetchAllProviders(): Promise<AiProvider[]> {
    const { data, error } = await supabase
      .schema("ai")
      .from("provider")
      .select("*")
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (error) throw error;
    return data.map(parseProvider);
  },

  async createProvider(payload: AiProviderInsert): Promise<AiProvider> {
    const { data, error } = await supabase
      .schema("ai")
      .from("provider")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return parseProvider(data);
  },

  async updateProvider(
    id: string,
    payload: AiProviderUpdate,
  ): Promise<AiProvider> {
    const { data, error } = await supabase
      .schema("ai")
      .from("provider")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return parseProvider(data);
  },

  async deleteProvider(id: string): Promise<void> {
    const { error } = await supabase
      .schema("ai")
      .from("provider")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  // ── Endpoint CRUD (ai.endpoint — one row per serving vendor) ──

  async fetchEndpoints(): Promise<AiEndpoint[]> {
    const { data, error } = await supabase
      .schema("ai")
      .from("endpoint")
      .select("*")
      .is("deleted_at", null)
      .order("display_name", { ascending: true });
    if (error) throw error;
    return data.map(parseEndpoint);
  },

  async createEndpoint(payload: AiEndpointInsert): Promise<AiEndpoint> {
    const { data, error } = await supabase
      .schema("ai")
      .from("endpoint")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return parseEndpoint(data);
  },

  async updateEndpoint(
    id: string,
    payload: AiEndpointUpdate,
  ): Promise<AiEndpoint> {
    const { data, error } = await supabase
      .schema("ai")
      .from("endpoint")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return parseEndpoint(data);
  },

  async deleteEndpoint(id: string): Promise<void> {
    const { error } = await supabase
      .schema("ai")
      .from("endpoint")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  // ── API CRUD (ai.api — one row per wire contract / translator) ──

  async fetchApis(): Promise<AiApi[]> {
    const { data, error } = await supabase
      .schema("ai")
      .from("api")
      .select("*")
      .is("deleted_at", null)
      .order("display_name", { ascending: true });
    if (error) throw error;
    return data.map(parseApi);
  },

  async createApi(payload: AiApiInsert): Promise<AiApi> {
    const { data, error } = await supabase
      .schema("ai")
      .from("api")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return parseApi(data);
  },

  async updateApi(id: string, payload: AiApiUpdate): Promise<AiApi> {
    const { data, error } = await supabase
      .schema("ai")
      .from("api")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return parseApi(data);
  },

  async deleteApi(id: string): Promise<void> {
    const { error } = await supabase
      .schema("ai")
      .from("api")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  // ── Offering CRUD (ai.offering — model × endpoint × api, per-offering pricing/overrides) ──

  async fetchOfferings(): Promise<AiOffering[]> {
    const { data, error } = await supabase
      .schema("ai")
      .from("offering")
      .select("*")
      .is("deleted_at", null)
      .order("priority", { ascending: true });
    if (error) throw error;
    return data.map(parseOffering);
  },

  /** The live offerings of one model. `token_billed` — the fact that a media
   *  model's NULL usage_basis is intentional — is recorded per offering, so a
   *  model-level pricing screen must read it from here. */
  async fetchOfferingsForModel(modelId: string): Promise<AiOffering[]> {
    const { data, error } = await supabase
      .schema("ai")
      .from("offering")
      .select("*")
      .eq("model_id", modelId)
      .is("deleted_at", null)
      .order("priority", { ascending: true });
    if (error) throw error;
    return data.map(parseOffering);
  },

  async createOffering(payload: AiOfferingInsert): Promise<AiOffering> {
    const { data, error } = await supabase
      .schema("ai")
      .from("offering")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return parseOffering(data);
  },

  async updateOffering(
    id: string,
    payload: AiOfferingUpdate,
  ): Promise<AiOffering> {
    const { data, error } = await supabase
      .schema("ai")
      .from("offering")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return parseOffering(data);
  },

  async deleteOffering(id: string): Promise<void> {
    const { error } = await supabase
      .schema("ai")
      .from("offering")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  /** Resolved user-facing config for one model (ai.model_config view) —
   *  controls/constraints computed live from ai.api.rules ⊕ ai.offering.override
   *  × ai.setting for the PREFERRED offering. This is what the app's settings
   *  engine consumes; admin rule editors show it as the read-only result of
   *  their edits. Null when the model is deprecated/deleted (view excludes it). */
  async fetchModelConfig(
    modelId: string,
  ): Promise<Database["ai"]["Views"]["model_config"]["Row"] | null> {
    const { data, error } = await supabase
      .schema("ai")
      .from("model_config")
      .select("*")
      .eq("id", modelId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  /** Read-only reporting view — offering × endpoint/api × model_definition joined,
   *  with points-based pricing computed. Nothing writes to this; edit the
   *  underlying offering row instead. */
  async fetchModelOfferingView(): Promise<AiModelOfferingView[]> {
    const { data, error } = await supabase
      .schema("ai")
      .from("model_offering")
      .select("*");
    if (error) throw error;
    return data;
  },

  // ── Model alias CRUD (ai.model_alias — alternate names → model row) ──

  async fetchAliases(): Promise<AiModelAliasRow[]> {
    const { data, error } = await supabase
      .schema("ai")
      .from("model_alias")
      .select("*")
      .is("deleted_at", null)
      .order("alias", { ascending: true });
    if (error) throw error;
    return data;
  },

  async createAlias(payload: AiModelAliasInsert): Promise<AiModelAliasRow> {
    const { data, error } = await supabase
      .schema("ai")
      .from("model_alias")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateAlias(
    id: string,
    payload: AiModelAliasUpdate,
  ): Promise<AiModelAliasRow> {
    const { data, error } = await supabase
      .schema("ai")
      .from("model_alias")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteAlias(id: string): Promise<void> {
    const { error } = await supabase
      .schema("ai")
      .from("model_alias")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  // ── Setting CRUD (ai.setting — canonical settings vocabulary) ──

  async fetchSettings(): Promise<AiSetting[]> {
    const { data, error } = await supabase
      .schema("ai")
      .from("setting")
      .select("*")
      .is("deleted_at", null)
      .order("key", { ascending: true });
    if (error) throw error;
    return data.map(parseSetting);
  },

  async createSetting(payload: AiSettingInsert): Promise<AiSetting> {
    const { data, error } = await supabase
      .schema("ai")
      .from("setting")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return parseSetting(data);
  },

  async updateSetting(
    id: string,
    payload: AiSettingUpdate,
  ): Promise<AiSetting> {
    const { data, error } = await supabase
      .schema("ai")
      .from("setting")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return parseSetting(data);
  },

  async deleteSetting(id: string): Promise<void> {
    const { error } = await supabase
      .schema("ai")
      .from("setting")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  async create(payload: AiModelInsert): Promise<AiModel> {
    const { data, error } = await supabase
      .schema("ai")
      .from("model_definition")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return this.withMaker(data);
  },

  async update(id: string, payload: AiModelUpdate): Promise<AiModel> {
    const { data, error } = await supabase
      .schema("ai")
      .from("model_definition")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return this.withMaker(data);
  },

  /** Attach the resolved `maker` (ai.provider.name via the provider_id FK) to a
   *  freshly written model row so the caller can splice it into a list without a
   *  full refetch. The dropped free-text `provider` column is never read. */
  async withMaker(row: AiModelRow): Promise<AiModel> {
    const providerId = row.provider_id;
    let maker: string | null = null;
    if (providerId) {
      const providers = await this.fetchProviders();
      maker = providers.find((p) => p.id === providerId)?.name ?? null;
    }
    return { ...withValidatedCapabilities(row), maker };
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .schema("ai")
      .from("model_definition")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  async fetchUsage(modelId: string): Promise<ModelUsageResult> {
    // NOTE: public.prompts was moved to graveyard.prompts — that leg is intentionally
    // removed. All user-owned prompts have been migrated to agent.definition.
    const [builtinsResult, agentsResult, agentTemplatesResult] =
      await Promise.all([
        // prompt_builtins migrated 1:1 to agent.definition (agent_type='builtin'), same UUIDs
        supabase
          .schema("agent")
          .from("definition")
          .select("id, name, source_agent_id, settings")
          .eq("agent_type", "builtin")
          .or(`model_id.eq.${modelId},settings->>model_id.eq.${modelId}`)
          .returns<AgentBuiltinUsageRow[]>(),
        supabase
          .schema("agent")
          .from("definition")
          .select("id, name, model_id")
          .or(
            `model_id.eq.${modelId},settings->>model_id.eq.${modelId},model_tiers->>default.eq.${modelId}`,
          )
          .returns<AgentUsageRow[]>(),
        supabase
          .schema("agent")
          .from("template")
          .select("id, name, model_id")
          .or(
            `model_id.eq.${modelId},settings->>model_id.eq.${modelId},model_tiers->>default.eq.${modelId}`,
          )
          .returns<AgentUsageRow[]>(),
      ]);

    if (builtinsResult.error) throw builtinsResult.error;
    if (agentsResult.error) throw agentsResult.error;
    if (agentTemplatesResult.error) throw agentTemplatesResult.error;

    // public.prompts is graveyarded — return empty array; no live prompt rows remain.
    const prompts: ModelUsageResult["prompts"] = [];

    const promptBuiltins = (builtinsResult.data ?? []).map((b) => ({
      id: b.id,
      name: b.name ?? b.id,
      table: "agent.definition" as const,
      source_prompt_id: b.source_agent_id ?? null,
    }));

    const agents = (agentsResult.data ?? []).map((a) => ({
      id: a.id,
      name: a.name ?? a.id,
      table: "agent.definition" as const,
    }));

    const agentTemplates = (agentTemplatesResult.data ?? []).map((t) => ({
      id: t.id,
      name: t.name ?? t.id,
      table: "agent.template" as const,
    }));

    return { prompts, promptBuiltins, agents, agentTemplates };
  },

  async replaceModelReferences(
    oldId: string,
    newId: string,
    newSettings?: LLMParams,
  ): Promise<ReplaceModelReferencesResult> {
    return replaceModelReferencesViaAdmin(oldId, newId, newSettings);
  },

  async replaceModelInPrompts(
    _oldId: string,
    _newId: string,
    _newSettings?: LLMParams,
  ): Promise<number> {
    // public.prompts was moved to graveyard.prompts — no live rows to update.
    // All prompt model references are now on agent.definition and handled by replaceModelInBuiltins.
    console.warn(
      "[aiModelService.replaceModelInPrompts] public.prompts is graveyarded — no-op, returning 0",
    );
    return 0;
  },

  async replaceModelInBuiltins(
    oldId: string,
    newId: string,
    newSettings?: LLMParams,
  ): Promise<number> {
    const result = await replaceModelReferencesViaAdmin(
      oldId,
      newId,
      newSettings,
    );
    return result.builtins;
  },

  async replaceModelInAgents(
    oldId: string,
    newId: string,
    newSettings?: LLMParams,
  ): Promise<number> {
    const result = await replaceModelReferencesViaAdmin(
      oldId,
      newId,
      newSettings,
    );
    return result.agents;
  },

  async replaceModelInAgentTemplates(
    oldId: string,
    newId: string,
    newSettings?: LLMParams,
  ): Promise<number> {
    const result = await replaceModelReferencesViaAdmin(
      oldId,
      newId,
      newSettings,
    );
    return result.templates;
  },

  /** Bulk-patch a single field on multiple models in parallel */
  async bulkPatchField(
    patches: Array<{
      id: string;
      field: keyof AiModelUpdate;
      value: AiModel[keyof AiModel];
    }>,
  ): Promise<void> {
    const results = await Promise.all(
      patches.map(({ id, field, value }) =>
        supabase
          .schema("ai")
          .from("model_definition")
          .update(modelFieldUpdate(field, value))
          .eq("id", id),
      ),
    );
    const firstError = results.find((r) => r.error);
    if (firstError?.error) throw firstError.error;
  },

  /** Patch one of the inline audit fields on a single model. The runtime
   *  builder keeps each dynamic key/value pair aligned with the generated
   *  update contract before it reaches Supabase. */
  async patchField(
    id: string,
    field: keyof Omit<AiModel, "id">,
    value: AiModel[keyof AiModel],
  ): Promise<void> {
    const { error } = await supabase
      .schema("ai")
      .from("model_definition")
      .update(modelFieldUpdate(field, value))
      .eq("id", id);
    if (error) throw error;
  },
};

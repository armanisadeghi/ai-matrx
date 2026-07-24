"use client";

import { supabase } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";
import type {
  AiModel,
  AiModelAliasRow,
  AiModelAliasInsert,
  AiModelAliasUpdate,
  AiModelInsert,
  AiModelUpdate,
  AiModelOfferingView,
  AiOffering,
  AiOfferingInsert,
  AiOfferingUpdate,
  AiProvider,
  AiProviderInsert,
  AiProviderUpdate,
  AiApi,
  AiApiInsert,
  AiApiUpdate,
  AiEndpoint,
  AiEndpointInsert,
  AiEndpointUpdate,
  AiSetting,
  AiSettingInsert,
  AiSettingUpdate,
  ModelUsageResult,
  ProviderModelsCache,
} from "./types";
import type { LLMParams } from "@/features/agents/types/agent-api-types";

type ReplaceModelReferencesResult = {
  agents: number;
  builtins: number;
  templates: number;
};

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

  const payload = (await response.json()) as ReplaceModelReferencesResult & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to replace model references.");
  }

  return payload;
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

export const aiModelService = {
  async fetchAll(): Promise<AiModel[]> {
    // Resolve `maker` from the provider_id FK (ai.provider.name). The old
    // free-text `provider` column is dropping — never read it. Fetch providers
    // alongside models and map by id so every row carries a display brand.
    const [modelsRes, providers] = await Promise.all([
      supabase
        .schema("ai")
        .from("model_definition")
        .select("*")
        .order("common_name", { ascending: true, nullsFirst: false }),
      this.fetchProviders(),
    ]);
    if (modelsRes.error) throw modelsRes.error;
    const makerById = new Map(providers.map((p) => [p.id, p.name ?? null]));
    return (modelsRes.data ?? []).map(
      (row): AiModel =>
        ({
          ...row,
          maker: row.provider_id
            ? (makerById.get(row.provider_id) ?? null)
            : null,
        }) as unknown as AiModel,
    );
  },

  async fetchProviders(): Promise<AiProvider[]> {
    const { data, error } = await supabase
      .schema("ai")
      .from("provider")
      .select(
        "id, name, company_description, documentation_link, models_link, doc_sources, provider_models_cache",
      )
      .order("name", { ascending: true });
    if (error) throw error;
    return data as AiProvider[];
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
      .select(
        "id, name, company_description, documentation_link, models_link, doc_sources, provider_models_cache",
      )
      .eq("id", providerId)
      .single();
    if (error) throw error;
    return data as AiProvider;
  },

  // ── Provider CRUD (identity fields — separate from the cache-only helpers above) ──

  /** Full-column provider fetch for the Provider CRUD screen (all fields,
   *  including slug/website_url/logo_url/visibility/is_system/organization_id).
   *  `fetchProviders()` above stays narrow-select for its existing read-only
   *  consumers (model form dropdown, provider reference modal). */
  async fetchAllProviders(): Promise<AiProvider[]> {
    const { data, error } = await supabase
      .schema("ai")
      .from("provider")
      .select("*")
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (error) throw error;
    return data as unknown as AiProvider[];
  },

  async createProvider(payload: AiProviderInsert): Promise<AiProvider> {
    const { data, error } = await supabase
      .schema("ai")
      .from("provider")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as AiProvider;
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
    return data as unknown as AiProvider;
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
    return data as unknown as AiEndpoint[];
  },

  async createEndpoint(payload: AiEndpointInsert): Promise<AiEndpoint> {
    const { data, error } = await supabase
      .schema("ai")
      .from("endpoint")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as AiEndpoint;
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
    return data as unknown as AiEndpoint;
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
    return data as unknown as AiApi[];
  },

  async createApi(payload: AiApiInsert): Promise<AiApi> {
    const { data, error } = await supabase
      .schema("ai")
      .from("api")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as AiApi;
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
    return data as unknown as AiApi;
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
    return data as unknown as AiOffering[];
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
    return data as unknown as AiOffering[];
  },

  async createOffering(payload: AiOfferingInsert): Promise<AiOffering> {
    const { data, error } = await supabase
      .schema("ai")
      .from("offering")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as AiOffering;
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
    return data as unknown as AiOffering;
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
    return data as unknown as AiModelOfferingView[];
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
    return data as unknown as AiSetting[];
  },

  async createSetting(payload: AiSettingInsert): Promise<AiSetting> {
    const { data, error } = await supabase
      .schema("ai")
      .from("setting")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as AiSetting;
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
    return data as unknown as AiSetting;
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
    return this.withMaker(data as Record<string, unknown>);
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
    return this.withMaker(data as Record<string, unknown>);
  },

  /** Attach the resolved `maker` (ai.provider.name via the provider_id FK) to a
   *  freshly written model row so the caller can splice it into a list without a
   *  full refetch. The dropped free-text `provider` column is never read. */
  async withMaker(row: Record<string, unknown>): Promise<AiModel> {
    const providerId =
      typeof row.provider_id === "string" ? row.provider_id : null;
    let maker: string | null = null;
    if (providerId) {
      const providers = await this.fetchProviders();
      maker = providers.find((p) => p.id === providerId)?.name ?? null;
    }
    return { ...row, maker } as unknown as AiModel;
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
          .update({
            [field]: value,
          } as Database["ai"]["Tables"]["model_definition"]["Update"])
          .eq("id", id),
      ),
    );
    const firstError = results.find((r) => r.error);
    if (firstError?.error) throw firstError.error;
  },

  /** Patch a single field on a single model (convenience for inline audit fixes).
   *  Widened to `keyof Omit<AiModel, "id">` so newly-added augmented fields
   *  (mid_fallback_id, guest_fallback_id) flow through ahead of the next
   *  `pnpm db:generate` refresh of database.types.ts. */
  async patchField(
    id: string,
    field: keyof Omit<AiModel, "id">,
    value: AiModel[keyof AiModel],
  ): Promise<void> {
    const { error } = await supabase
      .schema("ai")
      .from("model_definition")
      .update({ [field]: value } as unknown as AiModelUpdate)
      .eq("id", id);
    if (error) throw error;
  },
};

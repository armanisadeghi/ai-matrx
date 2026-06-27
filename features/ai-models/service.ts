"use client";

import { supabase } from "@/utils/supabase/client";
import type {
  AiModel,
  AiModelInsert,
  AiModelUpdate,
  AiProvider,
  ModelUsageResult,
  ProviderModelsCache,
} from "./types";
import type { PromptSettings } from "@/features/prompts/types/core";

export const aiModelService = {
  async fetchAll(): Promise<AiModel[]> {
    const { data, error } = await supabase
      .schema("ai")
      .from("model")
      .select("*")
      .order("common_name", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data as AiModel[];
  },

  async fetchProviders(): Promise<AiProvider[]> {
    const { data, error } = await supabase
      .schema("ai")
      .from("provider")
      .select(
        "id, name, company_description, documentation_link, models_link, provider_models_cache",
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
        "id, name, company_description, documentation_link, models_link, provider_models_cache",
      )
      .eq("id", providerId)
      .single();
    if (error) throw error;
    return data as AiProvider;
  },

  async create(payload: AiModelInsert): Promise<AiModel> {
    const { data, error } = await supabase
      .schema("ai")
      .from("model")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as AiModel;
  },

  async update(id: string, payload: AiModelUpdate): Promise<AiModel> {
    const { data, error } = await supabase
      .schema("ai")
      .from("model")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as AiModel;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.schema("ai").from("model").delete().eq("id", id);
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
          .or(`model_id.eq.${modelId},settings->>model_id.eq.${modelId}`),
        supabase
          .schema("agent")
          .from("definition")
          .select("id, name, model_id")
          .or(
            `model_id.eq.${modelId},settings->>model_id.eq.${modelId},model_tiers->>primary_model_id.eq.${modelId}`,
          ),
        supabase
          .schema("agent")
          .from("template")
          .select("id, name, model_id")
          .or(
            `model_id.eq.${modelId},settings->>model_id.eq.${modelId},model_tiers->>primary_model_id.eq.${modelId}`,
          ),
      ]);

    if (builtinsResult.error) throw builtinsResult.error;
    if (agentsResult.error) throw agentsResult.error;
    if (agentTemplatesResult.error) throw agentTemplatesResult.error;

    // public.prompts is graveyarded — return empty array; no live prompt rows remain.
    const prompts: ModelUsageResult["prompts"] = [];

    const promptBuiltins = (builtinsResult.data ?? []).map((b) => ({
      id: b.id,
      name: (b as { name?: string }).name ?? b.id,
      table: "agent.definition" as const,
      source_prompt_id: (b as { source_agent_id?: string | null }).source_agent_id ?? null,
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

  async replaceModelInPrompts(
    _oldId: string,
    _newId: string,
    _newSettings?: PromptSettings,
  ): Promise<number> {
    // public.prompts was moved to graveyard.prompts — no live rows to update.
    // All prompt model references are now on agent.definition and handled by replaceModelInBuiltins.
    console.warn("[aiModelService.replaceModelInPrompts] public.prompts is graveyarded — no-op, returning 0");
    return 0;
  },

  async replaceModelInBuiltins(
    oldId: string,
    newId: string,
    newSettings?: PromptSettings,
  ): Promise<number> {
    // prompt_builtins migrated 1:1 to agent.definition (agent_type='builtin'), same UUIDs
    const { data: rows, error: fetchErr } = await supabase
      .schema("agent")
      .from("definition")
      .select("id, model_id, settings")
      .eq("agent_type", "builtin")
      .or(`model_id.eq.${oldId},settings->>model_id.eq.${oldId}`);
    if (fetchErr) throw fetchErr;
    if (!rows || rows.length === 0) return 0;

    const updates = rows.map((row) => {
      const hasColumn = row.model_id === oldId;
      // When newSettings provided, replace entire settings object (strip old model's stale keys).
      // Otherwise patch only model_id into existing settings.
      const settings = newSettings
        ? { ...newSettings, model_id: newId }
        : typeof row.settings === "object" && row.settings !== null
          ? { ...(row.settings as Record<string, unknown>), model_id: newId }
          : { model_id: newId };
      const payload: Record<string, unknown> = { settings };
      if (hasColumn) payload.model_id = newId;
      return supabase.schema("agent").from("definition").update(payload).eq("id", row.id);
    });

    const results = await Promise.all(updates);
    const firstError = results.find((r) => r.error);
    if (firstError?.error) throw firstError.error;

    return rows.length;
  },

  async replaceModelInAgents(
    oldId: string,
    newId: string,
    newSettings?: PromptSettings,
  ): Promise<number> {
    const { data: rows, error: fetchErr } = await supabase
      .schema("agent")
      .from("definition")
      .select("id, model_id, settings, model_tiers")
      .or(`model_id.eq.${oldId},settings->>model_id.eq.${oldId}`);
    if (fetchErr) throw fetchErr;
    if (!rows || rows.length === 0) return 0;

    const updates = rows.map((row) => {
      const hasColumn = row.model_id === oldId;
      const settings = newSettings
        ? { ...newSettings, model_id: newId }
        : typeof row.settings === "object" && row.settings !== null
          ? { ...(row.settings as Record<string, unknown>), model_id: newId }
          : { model_id: newId };
      const payload: Record<string, unknown> = { settings };
      if (hasColumn) payload.model_id = newId;
      return supabase
        .schema("agent")
        .from("definition")
        .update(payload)
        .eq("id", row.id);
    });

    const results = await Promise.all(updates);
    const firstError = results.find((r) => r.error);
    if (firstError?.error) throw firstError.error;

    return rows.length;
  },

  async replaceModelInAgentTemplates(
    oldId: string,
    newId: string,
    newSettings?: PromptSettings,
  ): Promise<number> {
    const { data: rows, error: fetchErr } = await supabase
      .schema("agent")
      .from("template")
      .select("id, model_id, settings, model_tiers")
      .or(`model_id.eq.${oldId},settings->>model_id.eq.${oldId}`);
    if (fetchErr) throw fetchErr;
    if (!rows || rows.length === 0) return 0;

    const updates = rows.map((row) => {
      const hasColumn = row.model_id === oldId;
      const settings = newSettings
        ? { ...newSettings, model_id: newId }
        : typeof row.settings === "object" && row.settings !== null
          ? { ...(row.settings as Record<string, unknown>), model_id: newId }
          : { model_id: newId };
      const payload: Record<string, unknown> = { settings };
      if (hasColumn) payload.model_id = newId;
      return supabase
        .schema("agent")
        .from("template")
        .update(payload)
        .eq("id", row.id);
    });

    const results = await Promise.all(updates);
    const firstError = results.find((r) => r.error);
    if (firstError?.error) throw firstError.error;

    return rows.length;
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
          .from("model")
          .update({ [field]: value })
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
      .from("model")
      .update({ [field]: value } as unknown as AiModelUpdate)
      .eq("id", id);
    if (error) throw error;
  },
};

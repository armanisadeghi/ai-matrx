import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { LLMParams } from "@/features/agents/types/agent-api-types";

type AdminSupabase = SupabaseClient<Database>;

type AgentSettingsRow = {
  id: string;
  model_id: string | null;
  settings: Record<string, unknown> | null;
  model_tiers: Record<string, unknown> | null;
};

function buildModelReferenceFilter(oldId: string): string {
  return [
    `model_id.eq.${oldId}`,
    `settings->>model_id.eq.${oldId}`,
    `model_tiers->>default.eq.${oldId}`,
  ].join(",");
}

function buildSettingsPayload(
  oldId: string,
  newId: string,
  existing: Record<string, unknown> | null,
  newSettings?: LLMParams,
): Record<string, unknown> {
  if (newSettings) {
    return { ...newSettings, model_id: newId };
  }
  if (existing && typeof existing === "object") {
    return { ...existing, model_id: newId };
  }
  return { model_id: newId };
}

function patchModelTiers(
  modelTiers: Record<string, unknown> | null,
  oldId: string,
  newId: string,
): Record<string, unknown> | null {
  if (!modelTiers || typeof modelTiers !== "object") return modelTiers;

  const next: Record<string, unknown> = { ...modelTiers };
  if (next.default === oldId) {
    next.default = newId;
  }

  const tiers = next.tiers;
  if (tiers && typeof tiers === "object" && !Array.isArray(tiers)) {
    const tierMap = { ...(tiers as Record<string, unknown>) };
    for (const [key, value] of Object.entries(tierMap)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const tier = value as Record<string, unknown>;
        if (tier.model_id === oldId) {
          tierMap[key] = { ...tier, model_id: newId };
        }
      }
    }
    next.tiers = tierMap;
  }

  return next;
}

async function applyDefinitionUpdates(
  supabase: AdminSupabase,
  rows: AgentSettingsRow[],
  oldId: string,
  newId: string,
  newSettings?: LLMParams,
): Promise<number> {
  let updated = 0;

  for (const row of rows) {
    const hasColumn = row.model_id === oldId;
    const settings = buildSettingsPayload(
      oldId,
      newId,
      row.settings,
      newSettings,
    );
    const modelTiers = patchModelTiers(row.model_tiers, oldId, newId);
    const tiersChanged =
      JSON.stringify(modelTiers) !== JSON.stringify(row.model_tiers);

    const payload: Database["agent"]["Tables"]["definition"]["Update"] = {
      settings:
        settings as Database["agent"]["Tables"]["definition"]["Update"]["settings"],
    };
    if (hasColumn) payload.model_id = newId;
    if (tiersChanged) {
      payload.model_tiers =
        modelTiers as Database["agent"]["Tables"]["definition"]["Update"]["model_tiers"];
    }

    const { data, error } = await supabase
      .schema("agent")
      .from("definition")
      .update(payload)
      .eq("id", row.id)
      .select("id");

    if (error) throw error;
    if (data && data.length > 0) updated += data.length;
  }

  return updated;
}

export interface ReplaceModelReferencesResult {
  agents: number;
  builtins: number;
  templates: number;
}

export async function replaceModelReferencesAdmin(
  supabase: AdminSupabase,
  oldId: string,
  newId: string,
  newSettings?: LLMParams,
): Promise<ReplaceModelReferencesResult> {
  const filter = buildModelReferenceFilter(oldId);

  const [builtinsResult, agentsResult, templatesResult] = await Promise.all([
    supabase
      .schema("agent")
      .from("definition")
      .select("id, model_id, settings, model_tiers")
      .eq("agent_type", "builtin")
      .or(filter)
      .returns<AgentSettingsRow[]>(),
    supabase
      .schema("agent")
      .from("definition")
      .select("id, model_id, settings, model_tiers")
      .neq("agent_type", "builtin")
      .or(filter)
      .returns<AgentSettingsRow[]>(),
    supabase
      .schema("agent")
      .from("template")
      .select("id, model_id, settings, model_tiers")
      .or(filter)
      .returns<AgentSettingsRow[]>(),
  ]);

  if (builtinsResult.error) throw builtinsResult.error;
  if (agentsResult.error) throw agentsResult.error;
  if (templatesResult.error) throw templatesResult.error;

  const [builtins, agents, templates] = await Promise.all([
    applyDefinitionUpdates(
      supabase,
      builtinsResult.data ?? [],
      oldId,
      newId,
      newSettings,
    ),
    applyDefinitionUpdates(
      supabase,
      agentsResult.data ?? [],
      oldId,
      newId,
      newSettings,
    ),
    (async () => {
      let updated = 0;
      for (const row of templatesResult.data ?? []) {
        const hasColumn = row.model_id === oldId;
        const settings = buildSettingsPayload(
          oldId,
          newId,
          row.settings,
          newSettings,
        );
        const modelTiers = patchModelTiers(row.model_tiers, oldId, newId);
        const tiersChanged =
          JSON.stringify(modelTiers) !== JSON.stringify(row.model_tiers);

        const payload: Database["agent"]["Tables"]["template"]["Update"] = {
          settings:
            settings as Database["agent"]["Tables"]["template"]["Update"]["settings"],
        };
        if (hasColumn) payload.model_id = newId;
        if (tiersChanged) {
          payload.model_tiers =
            modelTiers as Database["agent"]["Tables"]["template"]["Update"]["model_tiers"];
        }

        const { data, error } = await supabase
          .schema("agent")
          .from("template")
          .update(payload)
          .eq("id", row.id)
          .select("id");

        if (error) throw error;
        if (data && data.length > 0) updated += data.length;
      }
      return updated;
    })(),
  ]);

  const total = agents + builtins + templates;
  const candidates =
    (builtinsResult.data?.length ?? 0) +
    (agentsResult.data?.length ?? 0) +
    (templatesResult.data?.length ?? 0);

  if (candidates > 0 && total === 0) {
    throw new Error(
      `Found ${candidates} reference(s) but updated 0 — check admin credentials.`,
    );
  }

  return { agents, builtins, templates };
}

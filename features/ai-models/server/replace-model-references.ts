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

/**
 * The change note stamped on every agent version this batch creates
 * (Agent Change Impact I5, discovery A Gap 9). The snapshot trigger reads
 * `app.change_note` only inside the writing transaction, which PostgREST
 * cannot set — so the note is written onto the version row the UPDATE just
 * produced (`agent.definition.version` is bumped to that row's number).
 */
function batchChangeNote(oldId: string, newId: string): string {
  return `Deprecated model replaced ${oldId} → ${newId} (deprecated-models audit batch)`;
}

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
): Promise<string[]> {
  const updated: string[] = [];

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
      .select("id, version");

    if (error) throw error;
    for (const written of data ?? []) {
      updated.push(written.id);
      // Name the batch on the snapshot the trigger just created. Best effort
      // by design: a missing note never undoes a written replacement, but a
      // failed stamp is said, not swallowed.
      if (typeof written.version === "number") {
        const { error: noteError } = await supabase
          .schema("agent")
          .from("definition_version")
          .update({ change_note: batchChangeNote(oldId, newId) })
          .eq("agent_id", written.id)
          .eq("version_number", written.version)
          .is("change_note", null);
        if (noteError) {
          console.warn(
            `[replace-model-references] agent ${written.id} v${written.version} was replaced but its change note could not be stamped: ${noteError.message}`,
          );
        }
      }
    }
  }

  return updated;
}

export interface ReplaceModelReferencesResult {
  agents: number;
  builtins: number;
  templates: number;
  /**
   * Every `agent.definition` id this call rewrote (personal agents AND
   * builtins) — the scope the post-batch impact panel grades (I5). Templates
   * are not agents and hold no mandate, so they are counted, not listed.
   */
  agent_ids: string[];
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

  const total = agents.length + builtins.length + templates;
  const candidates =
    (builtinsResult.data?.length ?? 0) +
    (agentsResult.data?.length ?? 0) +
    (templatesResult.data?.length ?? 0);

  if (candidates > 0 && total === 0) {
    throw new Error(
      `Found ${candidates} reference(s) but updated 0 — check admin credentials.`,
    );
  }

  return {
    agents: agents.length,
    builtins: builtins.length,
    templates,
    agent_ids: [...builtins, ...agents],
  };
}

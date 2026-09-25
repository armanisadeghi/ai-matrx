import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { LLMParams } from "@/features/agents/types/agent-api-types";

/**
 * The signed-in admin's OWN client (`await createClient()`), never the
 * service-role client: `agent.definition` is provenance-governed, and a
 * service-role write names no actor, so the database refuses it (23514,
 * "declares actor_tier=code, but names no actor_system" — 2026-09-25, Opus 5 →
 * Opus 5.5 was refused outright). The admin's session stamps `human` + their
 * id, and RLS `platform_admin_all` admits a platform admin.
 */
type AdminSupabase = SupabaseClient<Database>;

/**
 * An OPTIONAL value swap the admin ticked in Review: on every row being
 * replaced, if `settings[key]` equals `from`, write `to` instead (`to`
 * undefined → remove the key). Rows holding any other value are untouched.
 * Swaps are offers, never gates — an empty list is a normal replace.
 */
export interface SettingSwap {
  key: string;
  from: unknown;
  to?: unknown;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

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

/**
 * The row's own settings, then the admin's explicit overrides, then any
 * ticked swaps. Never a wipe: a setting nobody touched stays exactly as the
 * agent's owner left it.
 */
function buildSettingsPayload(
  newId: string,
  existing: Record<string, unknown> | null,
  newSettings?: LLMParams,
  swaps: SettingSwap[] = [],
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...(existing && typeof existing === "object" ? existing : {}),
  };
  for (const swap of swaps) {
    if (!(swap.key in out) || !sameValue(out[swap.key], swap.from)) continue;
    if (swap.to === undefined) delete out[swap.key];
    else out[swap.key] = swap.to;
  }
  Object.assign(out, newSettings ?? {});
  out.model_id = newId;
  return out;
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
  swaps: SettingSwap[] = [],
): Promise<string[]> {
  const updated: string[] = [];

  for (const row of rows) {
    const hasColumn = row.model_id === oldId;
    const settings = buildSettingsPayload(
      newId,
      row.settings,
      newSettings,
      swaps,
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
  /**
   * Rows that reference the old model but this admin's session could not
   * write (RLS: platform admins write `internal`-and-wider rows only). The
   * replace still lands everywhere else; the UI announces the gap.
   */
  skipped: number;
}

export async function replaceModelReferencesAdmin(
  supabase: AdminSupabase,
  oldId: string,
  newId: string,
  newSettings?: LLMParams,
  swaps: SettingSwap[] = [],
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
      swaps,
    ),
    applyDefinitionUpdates(
      supabase,
      agentsResult.data ?? [],
      oldId,
      newId,
      newSettings,
      swaps,
    ),
    (async () => {
      let updated = 0;
      for (const row of templatesResult.data ?? []) {
        const hasColumn = row.model_id === oldId;
        const settings = buildSettingsPayload(
          newId,
          row.settings,
          newSettings,
          swaps,
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
      `Found ${candidates} reference(s) but the database let this account update none of them — it is not signed in as a platform admin.`,
    );
  }

  return {
    agents: agents.length,
    builtins: builtins.length,
    templates,
    agent_ids: [...builtins, ...agents],
    skipped: candidates - total,
  };
}

export { buildSettingsPayload as buildReplacementSettings };

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllRows } from "@ai-matrx/data/db";
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
  // `Json` in the generated types is `unknown` — the real jsonb column, not
  // a guaranteed object. `buildSettingsPayload` below runtime-checks it.
  settings: unknown;
  model_tiers: unknown;
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
 * The row's own settings, then ticked swaps, then the admin's explicit
 * overrides. Never a wipe: a setting nobody touched stays exactly as the
 * agent's owner left it. An override of `null` removes the key.
 */
function buildSettingsPayload(
  newId: string,
  existing: unknown,
  newSettings?: LLMParams,
  swaps: SettingSwap[] = [],
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...(existing && typeof existing === "object" && !Array.isArray(existing)
      ? existing
      : {}),
  };
  for (const swap of swaps) {
    if (!(swap.key in out) || !sameValue(out[swap.key], swap.from)) continue;
    if (swap.to === undefined) delete out[swap.key];
    else out[swap.key] = swap.to;
  }
  for (const [key, value] of Object.entries(newSettings ?? {})) {
    if (value === null) delete out[key];
    else if (value !== undefined) out[key] = value;
  }
  out.model_id = newId;
  return out;
}

function swapTierEntry(value: unknown, oldId: string, newId: string): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const tier = value as Record<string, unknown>;
    if (tier.model_id === oldId) return { ...tier, model_id: newId };
  }
  return value;
}

/**
 * Rewrites every reference to `oldId` inside `model_tiers`, whatever its
 * shape: an array of tier entries, or `{ default, tiers: {...} | [...] }`.
 * An array stays an array.
 */
function patchModelTiers(
  modelTiers: unknown,
  oldId: string,
  newId: string,
): unknown {
  if (Array.isArray(modelTiers)) {
    return modelTiers.map((entry) => swapTierEntry(entry, oldId, newId));
  }
  if (!modelTiers || typeof modelTiers !== "object") return modelTiers;

  const next: Record<string, unknown> = {
    ...(modelTiers as Record<string, unknown>),
  };
  if (next.default === oldId) next.default = newId;
  const tiers = next.tiers;
  if (Array.isArray(tiers)) {
    next.tiers = tiers.map((entry) => swapTierEntry(entry, oldId, newId));
  } else if (tiers && typeof tiers === "object") {
    next.tiers = Object.fromEntries(
      Object.entries(tiers as Record<string, unknown>).map(([k, v]) => [
        k,
        swapTierEntry(v, oldId, newId),
      ]),
    );
  }
  return next;
}

interface RowFailure {
  id: string;
  message: string;
}

interface LegResult {
  written: string[];
  failures: RowFailure[];
}

function rowPayload(
  row: AgentSettingsRow,
  oldId: string,
  newId: string,
  newSettings: LLMParams | undefined,
  swaps: SettingSwap[],
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    settings: buildSettingsPayload(newId, row.settings, newSettings, swaps),
  };
  if (row.model_id === oldId) payload.model_id = newId;
  const modelTiers = patchModelTiers(row.model_tiers, oldId, newId);
  if (JSON.stringify(modelTiers) !== JSON.stringify(row.model_tiers)) {
    payload.model_tiers = modelTiers;
  }
  return payload;
}

/**
 * One row at a time; a refused or failed row is RECORDED, never allowed to
 * abort the rows after it — a replace that stops half-way and reports
 * "failed" leaves the admin guessing which agents moved.
 */
async function applyDefinitionUpdates(
  supabase: AdminSupabase,
  rows: AgentSettingsRow[],
  oldId: string,
  newId: string,
  newSettings: LLMParams | undefined,
  swaps: SettingSwap[],
): Promise<LegResult> {
  const written: string[] = [];
  const failures: RowFailure[] = [];

  for (const row of rows) {
    const { data, error } = await supabase
      .schema("agent")
      .from("definition")
      .update(
        rowPayload(
          row,
          oldId,
          newId,
          newSettings,
          swaps,
        ) as Database["agent"]["Tables"]["definition"]["Update"],
      )
      .eq("id", row.id)
      .select("id, version");

    if (error) {
      failures.push({ id: row.id, message: error.message });
      continue;
    }
    if (!data || data.length === 0) {
      failures.push({ id: row.id, message: "refused by access rules" });
      continue;
    }
    for (const saved of data) {
      written.push(saved.id);
      // Name the batch on the snapshot the trigger just created. Best effort
      // by design: a missing note never undoes a written replacement, but a
      // failed stamp is said, not swallowed.
      if (typeof saved.version === "number") {
        const { error: noteError } = await supabase
          .schema("agent")
          .from("definition_version")
          .update({ change_note: batchChangeNote(oldId, newId) })
          .eq("agent_id", saved.id)
          .eq("version_number", saved.version)
          .is("change_note", null);
        if (noteError) {
          console.warn(
            `[replace-model-references] agent ${saved.id} v${saved.version} was replaced but its change note could not be stamped: ${noteError.message}`,
          );
        }
      }
    }
  }

  return { written, failures };
}

async function applyTemplateUpdates(
  supabase: AdminSupabase,
  rows: AgentSettingsRow[],
  oldId: string,
  newId: string,
  newSettings: LLMParams | undefined,
  swaps: SettingSwap[],
): Promise<LegResult> {
  const written: string[] = [];
  const failures: RowFailure[] = [];
  for (const row of rows) {
    const { data, error } = await supabase
      .schema("agent")
      .from("template")
      .update(
        rowPayload(
          row,
          oldId,
          newId,
          newSettings,
          swaps,
        ) as Database["agent"]["Tables"]["template"]["Update"],
      )
      .eq("id", row.id)
      .select("id");
    if (error) failures.push({ id: row.id, message: error.message });
    else if (!data || data.length === 0)
      failures.push({ id: row.id, message: "refused by access rules" });
    else written.push(...data.map((r) => r.id));
  }
  return { written, failures };
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
   * Rows found that this admin's session could not write (access rules
   * refused, or the row's write failed). The replace still lands everywhere
   * else; the UI announces the gap.
   */
  skipped: number;
}

/**
 * Every matching row — never the silent 1000-row PostgREST page.
 *
 * `agent_type` (builtin vs. non-builtin) is a `agent.definition`-only
 * concept — `agent.template` never carried it, so the branches are split by
 * literal table name rather than passing `table` through as a union: that
 * keeps each `.from(...)` call narrowed to the one table whose Row shape it
 * actually queries instead of the union of both.
 */
function readCandidates(
  supabase: AdminSupabase,
  table: "definition" | "template",
  filter: string,
  agentType: "builtin" | "non-builtin" | null,
  label: string,
): Promise<AgentSettingsRow[]> {
  if (table === "definition") {
    return readAllRows<AgentSettingsRow>(
      ({ from, to }) => {
        let query = supabase
          .schema("agent")
          .from("definition")
          .select("id, model_id, settings, model_tiers", { count: "exact" })
          .or(filter);
        if (agentType === "builtin") query = query.eq("agent_type", "builtin");
        if (agentType === "non-builtin")
          query = query.neq("agent_type", "builtin");
        return query.order("id", { ascending: true }).range(from, to);
      },
      { label },
    );
  }
  return readAllRows<AgentSettingsRow>(
    ({ from, to }) =>
      supabase
        .schema("agent")
        .from("template")
        .select("id, model_id, settings, model_tiers", { count: "exact" })
        .or(filter)
        .order("id", { ascending: true })
        .range(from, to),
    { label },
  );
}

export async function replaceModelReferencesAdmin(
  supabase: AdminSupabase,
  oldId: string,
  newId: string,
  newSettings?: LLMParams,
  swaps: SettingSwap[] = [],
): Promise<ReplaceModelReferencesResult> {
  const filter = buildModelReferenceFilter(oldId);

  const [builtinRows, agentRows, templateRows] = await Promise.all([
    readCandidates(supabase, "definition", filter, "builtin", "agent.definition builtins"),
    readCandidates(supabase, "definition", filter, "non-builtin", "agent.definition agents"),
    readCandidates(supabase, "template", filter, null, "agent.template"),
  ]);

  const [builtins, agents, templates] = await Promise.all([
    applyDefinitionUpdates(supabase, builtinRows, oldId, newId, newSettings, swaps),
    applyDefinitionUpdates(supabase, agentRows, oldId, newId, newSettings, swaps),
    applyTemplateUpdates(supabase, templateRows, oldId, newId, newSettings, swaps),
  ]);

  const failures = [
    ...builtins.failures,
    ...agents.failures,
    ...templates.failures,
  ];
  const written =
    builtins.written.length + agents.written.length + templates.written.length;
  if (failures.length > 0) {
    console.warn(
      `[replace-model-references] ${oldId} → ${newId}: ${failures.length} row(s) not written`,
      failures.slice(0, 20),
    );
  }

  // Nothing at all landed: say the database's own reason, not a guess.
  if (failures.length > 0 && written === 0) {
    throw new Error(
      `None of the ${failures.length} reference(s) could be written. First refusal (row ${failures[0].id}): ${failures[0].message}`,
    );
  }

  return {
    agents: agents.written.length,
    builtins: builtins.written.length,
    templates: templates.written.length,
    agent_ids: [...builtins.written, ...agents.written],
    skipped: failures.length,
  };
}

export {
  buildSettingsPayload as buildReplacementSettings,
  patchModelTiers as patchReplacementModelTiers,
};

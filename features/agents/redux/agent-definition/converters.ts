/**
 * Agent Definition — DB ↔ Frontend Converters
 *
 * Rules:
 *  - Outer column names convert between snake_case (DB) and camelCase (frontend).
 *  - The CONTENTS of all JSONB fields (messages, settings, variable_definitions,
 *    context_policies, model_tiers, output_schema, custom_tools) are NEVER case-converted.
 *    They are stored and returned exactly as the DB/API provides them.
 *
 * DB-managed fields — excluded from ALL write payloads (Insert + Update):
 *  - id                 — DB generates on insert
 *  - created_at         — DB trigger
 *  - updated_at         — DB trigger (set_agent.definition_updated_at)
 *  - source_agent_id    — set only by agx_duplicate_agent() RPC, never by direct writes
 *  - source_snapshot_at — set only by agx_duplicate_agent() RPC, never by direct writes
 *
 * Version-specific frontend fields (isVersion, parentAgentId, version,
 * changedAt, changeNote) are frontend-only runtime fields — never written to DB.
 * Live agent records from dbRowToAgentDefinition() always set these to their
 * false/null defaults.
 */

import type { Database } from "@/types/database.types";
import { parseCustomTools } from "@/features/agents/redux/agent-definition/parse-custom-tools";
import { sanitizeAgentToolIds } from "@/features/agents/redux/agent-definition/sanitize-tool-ids";
import { stripNullish } from "@/utils/supabase/payload";
import type { SkillConfig } from "@/features/skills/types";
import { parseUiGates } from "@/lib/redux/slices/agent-settings/ui-gates";
import type { MatrxDirectivesConfig } from "@/features/agents/types/matrx-directives.types";
import { isJsonObject } from "@/types/json";
import type {
  AgentDefinition,
  AgentType,
  AgentVersionSnapshot,
  ModelTier,
  ModelTiers,
} from "../../types/agent-definition.types";

// ---------------------------------------------------------------------------
// settings sanitizer — settings holds ONLY server-consumed model params.
// These keys have dedicated columns now (matrx_actions / ui_gates / model_id /
// tools); a writer must never reintroduce them into the settings blob. This is
// the loud-recovery layer at the DB write chokepoint: if it ever strips one, an
// upstream writer is still mis-routing a non-param into settings — a bug.
// ---------------------------------------------------------------------------

const SETTINGS_FORBIDDEN_KEYS: readonly string[] = [
  "output_apply", // → matrx_actions column (retired key)
  "model_id", // → model_id column
  "internal_tools", // junk (no server consumer)
  "file_urls", // → ui_gates column
  "image_urls", // → ui_gates column
  "youtube_videos", // → ui_gates column
  "tools", // → tools[] column / tool_config (the boolean UI flag → ui_gates)
];

function sanitizeServerSettings(
  settings: AgentDefinition["settings"] | null | undefined,
): Record<string, unknown> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  const stripped: string[] = [];
  for (const [k, v] of Object.entries(settings)) {
    if (SETTINGS_FORBIDDEN_KEYS.includes(k)) {
      stripped.push(k);
      continue;
    }
    out[k] = v;
  }
  if (stripped.length > 0) {
    console.warn(
      `[agent-converters] Stripped non-param key(s) from settings on write: ${stripped.join(
        ", ",
      )}. These belong in dedicated columns (matrx_actions / ui_gates / model_id / tools) — ` +
        "an upstream writer is mis-routing them into settings.",
    );
  }
  return out;
}

export type { AgentVersionSnapshot };

// ---------------------------------------------------------------------------
// Supabase row types (derived from generated types)
// ---------------------------------------------------------------------------

type AgentRow = Database["agent"]["Tables"]["definition"]["Row"];
type AgentInsert = Omit<
  Database["agent"]["Tables"]["definition"]["Insert"],
  "id" | "created_at" | "updated_at" | "source_agent_id" | "source_snapshot_at"
>;
type AgentUpdate = Omit<
  Database["agent"]["Tables"]["definition"]["Update"],
  "id" | "created_at" | "updated_at" | "source_agent_id" | "source_snapshot_at"
>;

export type { AgentInsert, AgentUpdate };

// ---------------------------------------------------------------------------
// tool_config — flags ONLY on agent.definition.
// Shape the FE/server actually consume:
//   { auto_tools_disabled?: bool, excluded_tools?: string[] }
//
// Tool ASSIGNMENT is NOT here. Authoritative columns:
//   - tools uuid[]        → registered tool ids
//   - custom_tools jsonb  → inline CustomTool defs
// The executor (aidream) reads those columns only. `tool_config.tools` is a
// dead / refused write path — never prefer it on read (an empty [] there
// used to mask real tools and make Builder saves look like they didn't stick).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// DB → Frontend
// ---------------------------------------------------------------------------

/** Defensive parser for the `agent.definition.skill_config` JSONB. Returns the
 * empty default when the column is missing / malformed; the DB CHECK from
 * migration 0095 guarantees the shape when present, so this is mainly
 * about old rows + tests. */
export function parseSkillConfigJson(raw: unknown): SkillConfig {
  const empty: SkillConfig = {
    included: [],
    listed: [],
    forbidden: [],
    disabled: false,
  };
  if (!isJsonObject(raw)) return empty;
  const arrOrEmpty = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
  return {
    included: arrOrEmpty(raw.included),
    listed: arrOrEmpty(raw.listed),
    forbidden: arrOrEmpty(raw.forbidden),
    disabled: typeof raw.disabled === "boolean" ? raw.disabled : false,
  };
}

/** Read the one frontend-visible flag stored inside `tool_config`. */
export function parseAgentAutoToolsDisabled(raw: unknown): boolean {
  if (!isJsonObject(raw)) return false;
  return raw.auto_tools_disabled === true;
}

/** Narrow the generated text column to the two values enforced by the DB. */
function parseAgentType(raw: string): AgentType {
  if (raw === "user" || raw === "builtin") return raw;
  throw new Error(`[agent-converters] Invalid agent_type: ${raw}`);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/** Validate understood directive keys while preserving opaque host-owned keys. */
function parseMatrxDirectives(raw: unknown): MatrxDirectivesConfig {
  if (!isJsonObject(raw)) {
    throw new Error("[agent-converters] matrx_actions must be an object");
  }
  if (raw.actions !== undefined && !isStringArray(raw.actions)) {
    throw new Error("[agent-converters] matrx_actions.actions must be strings");
  }
  if (
    raw.apply_policy !== undefined &&
    raw.apply_policy !== "auto" &&
    raw.apply_policy !== "ask" &&
    raw.apply_policy !== "off"
  ) {
    throw new Error(
      '[agent-converters] matrx_actions.apply_policy must be "auto", "ask", or "off"',
    );
  }
  if (raw.auto_apply !== undefined && typeof raw.auto_apply !== "boolean") {
    throw new Error(
      "[agent-converters] matrx_actions.auto_apply must be a boolean",
    );
  }
  if (raw.allow !== undefined && !isStringArray(raw.allow)) {
    throw new Error("[agent-converters] matrx_actions.allow must be strings");
  }
  if (raw.directive !== undefined && typeof raw.directive !== "string") {
    throw new Error(
      "[agent-converters] matrx_actions.directive must be a string",
    );
  }

  const parsed: MatrxDirectivesConfig = {};
  Object.assign(parsed, raw);
  return parsed;
}

/** Validate the small, closed model-tier JSON contract at DB ingress. */
function parseModelTiersJson(raw: unknown): ModelTiers | null {
  if (raw === null) return null;
  if (!isJsonObject(raw) || typeof raw.default !== "string") {
    throw new Error(
      "[agent-converters] model_tiers must be null or an object with a string default",
    );
  }

  const parsed: ModelTiers = { default: raw.default };
  if (raw.flexible !== undefined) {
    if (typeof raw.flexible !== "boolean") {
      throw new Error(
        "[agent-converters] model_tiers.flexible must be a boolean",
      );
    }
    parsed.flexible = raw.flexible;
  }

  if (raw.tiers !== undefined) {
    if (!isJsonObject(raw.tiers)) {
      throw new Error("[agent-converters] model_tiers.tiers must be an object");
    }
    const tiers: Record<string, ModelTier> = {};
    for (const [key, value] of Object.entries(raw.tiers)) {
      if (!isJsonObject(value) || typeof value.modelId !== "string") {
        throw new Error(
          `[agent-converters] model_tiers.tiers.${key}.modelId must be a string`,
        );
      }
      if (value.label !== undefined && typeof value.label !== "string") {
        throw new Error(
          `[agent-converters] model_tiers.tiers.${key}.label must be a string`,
        );
      }
      const tier: ModelTier = { modelId: value.modelId };
      if (value.label !== undefined) tier.label = value.label;
      tiers[key] = tier;
    }
    parsed.tiers = tiers;
  }

  return parsed;
}

/**
 * Converts a full agents Row into the frontend AgentDefinition shape.
 * Closed JSONB contracts are parsed here; their keys are never case-converted.
 */
export function dbRowToAgentDefinition(row: AgentRow): AgentDefinition {
  // Tools come from the authoritative columns — never from tool_config.
  const ingress = { agentId: row.id, relation: "agent.definition" };
  const tools = row.tools ?? [];
  const customTools = parseCustomTools(row.custom_tools, ingress);

  // auto_tools_disabled lives only in tool_config (no dedicated column). The
  // server reads it from there (agx_manager.py); round-trip it so the Builder
  // toggle reflects the saved value.
  const autoToolsDisabled = parseAgentAutoToolsDisabled(row.tool_config);

  // skill_config is JSONB matching the SkillConfig shape; see migration 0095
  // for the structural CHECK constraint. The DB CHECK guarantees the keys we
  // read are arrays / boolean as expected, so the defensive parser only
  // needs to handle null / legacy-row missing-column cases.
  const skillConfig = parseSkillConfigJson(row.skill_config);

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    tags: row.tags ?? [],
    isActive: row.is_active,
    isArchived: row.is_archived,
    isFavorite: row.is_favorite,
    agentType: parseAgentType(row.agent_type),

    modelId: row.model_id,
    // messages: JSONB — cast but not key-converted
    messages: (row.messages as unknown as AgentDefinition["messages"]) ?? [],
    variableDefinitions:
      (row.variable_definitions as unknown as AgentDefinition["variableDefinitions"]) ??
      null,
    settings:
      (row.settings as unknown as AgentDefinition["settings"]) ??
      ({} as AgentDefinition["settings"]),
    tools,

    contextPolicies:
      (row.context_policies as unknown as AgentDefinition["contextPolicies"]) ??
      [],
    autoContextDisabled: row.auto_context_disabled === true,
    inputKind: row.input_kind ?? null,

    modelTiers: parseModelTiersJson(row.model_tiers),
    outputSchema:
      (row.output_schema as unknown as AgentDefinition["outputSchema"]) ?? null,
    customTools,
    autoToolsDisabled,
    skillConfig,
    uiGates: parseUiGates(row.ui_gates),
    matrxDirectives: parseMatrxDirectives(row.matrx_actions),
    mcpServers: row.mcp_servers ?? [],

    createdBy: row.created_by,
    organizationId: row.organization_id,
    taskId: row.task_id,

    sourceAgentId: row.source_agent_id,
    sourceSnapshotAt: row.source_snapshot_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,

    // Live agents from the DB are never version snapshots
    isVersion: false,
    parentAgentId: null,
    version: row.version,
    changedAt: null,
    changeNote: null,

    // Access metadata not available from a direct row fetch —
    // populated separately by fetchAgentsList or fetchAgentAccessLevel
    isOwner: null,
    accessLevel: null,
    sharedByEmail: null,

    // Knowledge retrieval-boost for this agent's derivatives. DB default is 0
    // (no boost); the column is non-nullable on agent.definition so we just
    // pass it through.
    defaultRagBoost: row.default_rag_boost ?? 0,
    ragAwarenessMode: row.rag_awareness_mode ?? "none",
  };
}

// ---------------------------------------------------------------------------
// Frontend → DB (Insert — new record, no id)
// ---------------------------------------------------------------------------

/**
 * Converts an AgentDefinition into a DB Insert payload.
 * Strips all DB-managed fields (id, created_at, updated_at, version) and
 * removes any key whose value is null/undefined so the DB's defaults apply.
 *
 * This last step is critical: `agent.definition` has many NOT NULL columns with
 * defaults (custom_tools, context_policies, messages, settings, tools, tags,
 * mcp_servers, is_*, agent_type, version). Sending `null` for any of them
 * bypasses the default and triggers a 23502 violation. See
 * utils/supabase/payload.ts for the full rationale.
 */
export function agentDefinitionToInsert(agent: AgentDefinition): AgentInsert {
  if (!agent.organizationId) {
    throw new Error(
      "[agent-converters] organizationId is required for agent.definition inserts",
    );
  }

  const raw: AgentInsert = {
    name: agent.name,
    description: agent.description,
    category: agent.category,
    tags: agent.tags,
    is_active: agent.isActive,
    is_archived: agent.isArchived,
    is_favorite: agent.isFavorite,
    agent_type: agent.agentType,

    model_id: agent.modelId,
    messages: agent.messages,
    variable_definitions: agent.variableDefinitions,
    settings: sanitizeServerSettings(agent.settings),
    tools: sanitizeAgentToolIds(agent.tools, "agentDefinitionToInsert"),

    ui_gates: agent.uiGates,
    matrx_actions: agent.matrxDirectives,

    context_policies: agent.contextPolicies,
    auto_context_disabled: agent.autoContextDisabled,
    input_kind: agent.inputKind,

    model_tiers: agent.modelTiers,
    output_schema: agent.outputSchema,
    custom_tools: agent.customTools,
    mcp_servers: agent.mcpServers,

    created_by: agent.createdBy,
    organization_id: agent.organizationId,
    task_id: agent.taskId,

    default_rag_boost: agent.defaultRagBoost,
    rag_awareness_mode: agent.ragAwarenessMode,

    // skill_config: send only when non-default so brand-new rows take the
    // DB's `{}` default. The server's CHECK constraint (migration 0095)
    // accepts both an empty object and the full shape.
    skill_config: skillConfigToJsonb(agent.skillConfig),
  };

  return stripNullish(raw);
}

// ---------------------------------------------------------------------------
// Frontend → DB (Update — partial, keyed by id externally)
// ---------------------------------------------------------------------------

/**
 * Converts a partial AgentDefinition into a DB Update payload.
 * Only includes keys present in the input — never overwrites with undefined.
 * Strips all DB-managed fields even if accidentally included.
 */
export function agentDefinitionToUpdate(
  partial: Partial<AgentDefinition>,
): AgentUpdate {
  const update: AgentUpdate = {};

  if (partial.name !== undefined) update.name = partial.name;
  if (partial.description !== undefined)
    update.description = partial.description;
  if (partial.category !== undefined) update.category = partial.category;
  if (partial.tags !== undefined) update.tags = partial.tags;
  if (partial.isActive !== undefined) update.is_active = partial.isActive;
  if (partial.isArchived !== undefined) update.is_archived = partial.isArchived;
  if (partial.isFavorite !== undefined) update.is_favorite = partial.isFavorite;
  if (partial.agentType !== undefined) update.agent_type = partial.agentType;

  if (partial.modelId !== undefined) update.model_id = partial.modelId;
  if (partial.messages !== undefined) update.messages = partial.messages;
  if (partial.variableDefinitions !== undefined)
    update.variable_definitions = partial.variableDefinitions;
  if (partial.settings !== undefined)
    update.settings = sanitizeServerSettings(partial.settings);
  if (partial.tools !== undefined) {
    update.tools = sanitizeAgentToolIds(
      partial.tools,
      "agentDefinitionToUpdate",
    );
  }

  if (partial.uiGates !== undefined) update.ui_gates = partial.uiGates;
  if (partial.matrxDirectives !== undefined)
    update.matrx_actions = partial.matrxDirectives;

  if (partial.contextPolicies !== undefined)
    update.context_policies = partial.contextPolicies;

  if (partial.autoContextDisabled !== undefined)
    update.auto_context_disabled = partial.autoContextDisabled;
  if (partial.inputKind !== undefined) update.input_kind = partial.inputKind;

  if (partial.modelTiers !== undefined) update.model_tiers = partial.modelTiers;
  if (partial.outputSchema !== undefined)
    update.output_schema = partial.outputSchema;
  if (partial.customTools !== undefined)
    update.custom_tools = partial.customTools;
  if (partial.mcpServers !== undefined) update.mcp_servers = partial.mcpServers;

  if (partial.createdBy !== undefined) update.created_by = partial.createdBy;
  if (partial.organizationId !== undefined) {
    if (partial.organizationId === null) {
      throw new Error(
        "[agent-converters] organizationId cannot be cleared on agent.definition",
      );
    }
    update.organization_id = partial.organizationId;
  }
  if (partial.taskId !== undefined) update.task_id = partial.taskId;

  if (partial.defaultRagBoost !== undefined)
    update.default_rag_boost = partial.defaultRagBoost;
  if (partial.ragAwarenessMode !== undefined)
    update.rag_awareness_mode = partial.ragAwarenessMode;

  if (partial.skillConfig !== undefined) {
    update.skill_config = skillConfigToJsonb(partial.skillConfig);
  }

  return update;
}

/** SkillConfig → JSONB-shaped object for the agent.definition row. Returns the
 * `{}` empty-default when every field is at its zero value so we don't
 * spam the DB with redundant `{"included":[],"listed":[],...}` rows. */
function skillConfigToJsonb(
  cfg: SkillConfig | undefined,
): Record<string, unknown> {
  if (!cfg) return {};
  const isEmpty =
    cfg.included.length === 0 &&
    cfg.listed.length === 0 &&
    cfg.forbidden.length === 0 &&
    !cfg.disabled;
  if (isEmpty) return {};
  return {
    included: cfg.included,
    listed: cfg.listed,
    forbidden: cfg.forbidden,
    disabled: cfg.disabled,
  };
}

// ---------------------------------------------------------------------------
// Version Snapshot → Frontend
// ---------------------------------------------------------------------------

/**
 * Converts a version snapshot RPC row into AgentDefinition shape.
 * Used by both the client thunk (fetchAgentVersionSnapshot) and
 * SSR data layer (getAgentSnapshot) — single source of truth.
 */
export function versionSnapshotRowToAgentDefinition(
  parentAgentId: string,
  row: AgentVersionSnapshot,
): AgentDefinition {
  return {
    id: row.version_id,
    isVersion: true,
    parentAgentId,
    version: row.version_number,
    changedAt: row.changed_at,
    changeNote: row.change_note,

    agentType: parseAgentType(row.agent_type),
    name: row.name,
    description: row.description,
    category: row.category,
    tags: row.tags,
    isActive: row.is_active,

    isArchived: false,
    isFavorite: false,
    createdBy: null,
    organizationId: null,
    taskId: null,
    sourceAgentId: null,
    sourceSnapshotAt: null,
    createdAt: row.changed_at,
    updatedAt: row.changed_at,

    modelId: row.model_id,
    messages: row.messages ?? [],
    variableDefinitions: row.variable_definitions,
    settings: row.settings,
    tools: row.tools ?? [],
    contextPolicies: row.context_policies ?? [],
    autoContextDisabled: row.auto_context_disabled === true,
    inputKind: row.input_kind ?? null,
    modelTiers: parseModelTiersJson(row.model_tiers),
    outputSchema: row.output_schema,
    customTools: row.custom_tools ?? [],
    autoToolsDisabled: parseAgentAutoToolsDisabled(row.tool_config),
    skillConfig: parseSkillConfigJson(row.skill_config),
    uiGates: parseUiGates(row.ui_gates),
    matrxDirectives: parseMatrxDirectives(row.matrx_actions),
    mcpServers: row.mcp_servers ?? [],

    isOwner: null,
    accessLevel: null,
    sharedByEmail: null,
    defaultRagBoost: row.default_rag_boost,
    ragAwarenessMode: row.rag_awareness_mode,
  };
}

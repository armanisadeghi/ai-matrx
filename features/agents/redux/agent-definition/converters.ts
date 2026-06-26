/**
 * Agent Definition — DB ↔ Frontend Converters
 *
 * Rules:
 *  - Outer column names convert between snake_case (DB) and camelCase (frontend).
 *  - The CONTENTS of all JSONB fields (messages, settings, variable_definitions,
 *    context_slots, model_tiers, output_schema, custom_tools) are NEVER case-converted.
 *    They are stored and returned exactly as the DB/API provides them.
 *
 * DB-managed fields — excluded from ALL write payloads (Insert + Update):
 *  - id                 — DB generates on insert
 *  - created_at         — DB trigger
 *  - updated_at         — DB trigger (set_agx_agent_updated_at)
 *  - source_agent_id    — set only by agx_duplicate_agent() RPC, never by direct writes
 *  - source_snapshot_at — set only by agx_duplicate_agent() RPC, never by direct writes
 *
 * Version-specific frontend fields (isVersion, parentAgentId, version,
 * changedAt, changeNote) are frontend-only runtime fields — never written to DB.
 * Live agent records from dbRowToAgentDefinition() always set these to their
 * false/null defaults.
 */

import type { Database } from "@/types/database.types";
import { stripNullish } from "@/utils/supabase/payload";
import type { SkillConfig } from "@/features/skills/types";
import type { UiGates } from "@/lib/redux/slices/agent-settings/ui-gates";
import type { MatrxActionsConfig } from "@/features/agents/types/matrx-actions.types";
import type {
  AgentDefinition,
  AgentType,
  AgentVersionSnapshot,
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
): AgentDefinition["settings"] {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {} as AgentDefinition["settings"];
  }
  const src = settings as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const stripped: string[] = [];
  for (const [k, v] of Object.entries(src)) {
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
  return out as AgentDefinition["settings"];
}

export type { AgentVersionSnapshot };

// ---------------------------------------------------------------------------
// Supabase row types (derived from generated types)
// ---------------------------------------------------------------------------

type AgentRow = Database["public"]["Tables"]["agx_agent"]["Row"];
type AgentInsert = Omit<
  Database["public"]["Tables"]["agx_agent"]["Insert"],
  "id" | "created_at" | "updated_at" | "source_agent_id" | "source_snapshot_at"
>;
type AgentUpdate = Omit<
  Database["public"]["Tables"]["agx_agent"]["Update"],
  "id" | "created_at" | "updated_at" | "source_agent_id" | "source_snapshot_at"
>;

export type { AgentInsert, AgentUpdate };

// ---------------------------------------------------------------------------
// tool_config — the canonical JSONB on agx_agent.
// Shape:
//   { tools: ToolSpec[], excluded_tools: string[], auto_tools_disabled: bool }
// where ToolSpec is the same discriminated union as the request schema:
//   { kind: "registered", tool_id: uuid, ... } | { kind: "inline", ... }
//
// Backend keeps the legacy `tools` (uuid[]) + `custom_tools` (jsonb[]) columns
// in sync with `tool_config` for back-compat; we prefer `tool_config` on read
// so when legacy columns get dropped this file keeps working unchanged. On
// write we still hit the legacy columns — backend's dual-sync keeps both
// coherent, and switching writes to `tool_config` is a separate move once
// backend confirms legacy is no longer required.
// ---------------------------------------------------------------------------

interface ToolConfigJson {
  tools?: Array<Record<string, unknown>>;
  excluded_tools?: string[];
  auto_tools_disabled?: boolean;
}

function splitToolConfig(toolConfig: unknown): {
  tools: string[];
  customTools: AgentDefinition["customTools"];
} | null {
  if (!toolConfig || typeof toolConfig !== "object") return null;
  const cfg = toolConfig as ToolConfigJson;
  if (!Array.isArray(cfg.tools)) return null;
  const tools: string[] = [];
  const customTools: AgentDefinition["customTools"] = [];
  for (const spec of cfg.tools) {
    if (!spec || typeof spec !== "object") continue;
    const kind = spec.kind;
    if (kind === "registered") {
      const toolId = (spec.tool_id ?? spec.name) as string | undefined;
      if (toolId) tools.push(toolId);
    } else if (kind === "inline") {
      customTools.push(
        spec as unknown as AgentDefinition["customTools"][number],
      );
    }
    // kind === "agent" is per-request only (not stored on the agent row);
    // ignore here.
  }
  return { tools, customTools };
}

// ---------------------------------------------------------------------------
// DB → Frontend
// ---------------------------------------------------------------------------

/** Defensive parser for the `agx_agent.skill_config` JSONB. Returns the
 * empty default when the column is missing / malformed; the DB CHECK from
 * migration 0095 guarantees the shape when present, so this is mainly
 * about old rows + tests. */
function parseSkillConfigJson(raw: unknown): SkillConfig {
  const empty: SkillConfig = {
    included: [],
    listed: [],
    forbidden: [],
    disabled: false,
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const obj = raw as Record<string, unknown>;
  const arrOrEmpty = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
  return {
    included: arrOrEmpty(obj.included),
    listed: arrOrEmpty(obj.listed),
    forbidden: arrOrEmpty(obj.forbidden),
    disabled: typeof obj.disabled === "boolean" ? obj.disabled : false,
  };
}

/**
 * Converts a full agents Row into the frontend AgentDefinition shape.
 * Safe to call with any row — all JSONB fields are cast but not key-converted.
 */
export function dbRowToAgentDefinition(row: AgentRow): AgentDefinition {
  // Prefer tool_config (canonical) over the legacy split columns. Legacy
  // columns are still maintained backend-side, but will eventually be
  // dropped — reading from tool_config insulates us from that.
  const fromToolConfig = splitToolConfig(row.tool_config);
  const tools = fromToolConfig?.tools ?? row.tools ?? [];
  const customTools =
    fromToolConfig?.customTools ??
    ((row.custom_tools as unknown as AgentDefinition["customTools"]) ?? []);

  // auto_tools_disabled lives only in tool_config (no legacy column). The
  // server reads it from there (agx_manager.py); round-trip it so the Builder
  // toggle reflects the saved value.
  const tc = row.tool_config;
  const autoToolsDisabled =
    tc && typeof tc === "object" && !Array.isArray(tc)
      ? Boolean((tc as ToolConfigJson).auto_tools_disabled)
      : false;

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
    isPublic: row.is_public,
    isArchived: row.is_archived,
    isFavorite: row.is_favorite,
    agentType: row.agent_type as AgentType,

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

    contextSlots:
      (row.context_slots as unknown as AgentDefinition["contextSlots"]) ?? [],

    modelTiers:
      (row.model_tiers as unknown as AgentDefinition["modelTiers"]) ?? null,
    outputSchema:
      (row.output_schema as unknown as AgentDefinition["outputSchema"]) ?? null,
    customTools,
    autoToolsDisabled,
    skillConfig,
    uiGates: (row.ui_gates as unknown as UiGates) ?? {},
    matrxActions: (row.matrx_actions as unknown as MatrxActionsConfig) ?? {},
    mcpServers: row.mcp_servers ?? [],

    userId: row.user_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
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

    // RAG retrieval-boost for this agent's derivatives. DB default is 0
    // (no boost); the column is non-nullable on agx_agent so we just
    // pass it through.
    defaultRagBoost: row.default_rag_boost ?? 0,
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
 * This last step is critical: `agx_agent` has many NOT NULL columns with
 * defaults (custom_tools, context_slots, messages, settings, tools, tags,
 * mcp_servers, is_*, agent_type, version). Sending `null` for any of them
 * bypasses the default and triggers a 23502 violation. See
 * utils/supabase/payload.ts for the full rationale.
 */
export function agentDefinitionToInsert(agent: AgentDefinition): AgentInsert {
  const raw: Partial<AgentInsert> = {
    name: agent.name,
    description: agent.description,
    category: agent.category,
    tags: agent.tags,
    is_active: agent.isActive,
    is_public: agent.isPublic,
    is_archived: agent.isArchived,
    is_favorite: agent.isFavorite,
    agent_type: agent.agentType,

    model_id: agent.modelId,
    messages:
      agent.messages as unknown as Database["public"]["Tables"]["agx_agent"]["Insert"]["messages"],
    variable_definitions:
      agent.variableDefinitions as unknown as Database["public"]["Tables"]["agx_agent"]["Insert"]["variable_definitions"],
    settings: sanitizeServerSettings(
      agent.settings,
    ) as unknown as Database["public"]["Tables"]["agx_agent"]["Insert"]["settings"],
    tools: agent.tools,

    ui_gates:
      agent.uiGates as unknown as Database["public"]["Tables"]["agx_agent"]["Insert"]["ui_gates"],
    matrx_actions:
      agent.matrxActions as unknown as Database["public"]["Tables"]["agx_agent"]["Insert"]["matrx_actions"],

    context_slots:
      agent.contextSlots as unknown as Database["public"]["Tables"]["agx_agent"]["Insert"]["context_slots"],

    model_tiers:
      agent.modelTiers as unknown as Database["public"]["Tables"]["agx_agent"]["Insert"]["model_tiers"],
    output_schema:
      agent.outputSchema as unknown as Database["public"]["Tables"]["agx_agent"]["Insert"]["output_schema"],
    custom_tools:
      agent.customTools as unknown as Database["public"]["Tables"]["agx_agent"]["Insert"]["custom_tools"],
    mcp_servers: agent.mcpServers,

    user_id: agent.userId,
    organization_id: agent.organizationId,
    project_id: agent.projectId,
    task_id: agent.taskId,

    default_rag_boost: agent.defaultRagBoost,

    // skill_config: send only when non-default so brand-new rows take the
    // DB's `{}` default. The server's CHECK constraint (migration 0095)
    // accepts both an empty object and the full shape.
    skill_config: skillConfigToJsonb(agent.skillConfig),
  };

  return stripNullish(raw) as AgentInsert;
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
  if (partial.isPublic !== undefined) update.is_public = partial.isPublic;
  if (partial.isArchived !== undefined) update.is_archived = partial.isArchived;
  if (partial.isFavorite !== undefined) update.is_favorite = partial.isFavorite;
  if (partial.agentType !== undefined) update.agent_type = partial.agentType;

  if (partial.modelId !== undefined) update.model_id = partial.modelId;
  if (partial.messages !== undefined)
    update.messages =
      partial.messages as unknown as Database["public"]["Tables"]["agx_agent"]["Update"]["messages"];
  if (partial.variableDefinitions !== undefined)
    update.variable_definitions =
      partial.variableDefinitions as unknown as Database["public"]["Tables"]["agx_agent"]["Update"]["variable_definitions"];
  if (partial.settings !== undefined)
    update.settings = sanitizeServerSettings(
      partial.settings,
    ) as unknown as Database["public"]["Tables"]["agx_agent"]["Update"]["settings"];
  if (partial.tools !== undefined) update.tools = partial.tools;

  if (partial.uiGates !== undefined)
    update.ui_gates =
      partial.uiGates as unknown as Database["public"]["Tables"]["agx_agent"]["Update"]["ui_gates"];
  if (partial.matrxActions !== undefined)
    update.matrx_actions =
      partial.matrxActions as unknown as Database["public"]["Tables"]["agx_agent"]["Update"]["matrx_actions"];

  if (partial.contextSlots !== undefined)
    update.context_slots =
      partial.contextSlots as unknown as Database["public"]["Tables"]["agx_agent"]["Update"]["context_slots"];

  if (partial.modelTiers !== undefined)
    update.model_tiers =
      partial.modelTiers as unknown as Database["public"]["Tables"]["agx_agent"]["Update"]["model_tiers"];
  if (partial.outputSchema !== undefined)
    update.output_schema =
      partial.outputSchema as unknown as Database["public"]["Tables"]["agx_agent"]["Update"]["output_schema"];
  if (partial.customTools !== undefined)
    update.custom_tools =
      partial.customTools as unknown as Database["public"]["Tables"]["agx_agent"]["Update"]["custom_tools"];
  if (partial.mcpServers !== undefined) update.mcp_servers = partial.mcpServers;

  if (partial.userId !== undefined) update.user_id = partial.userId;
  if (partial.organizationId !== undefined)
    update.organization_id = partial.organizationId;
  if (partial.projectId !== undefined) update.project_id = partial.projectId;
  if (partial.taskId !== undefined) update.task_id = partial.taskId;

  if (partial.defaultRagBoost !== undefined)
    update.default_rag_boost = partial.defaultRagBoost;

  if (partial.skillConfig !== undefined) {
    update.skill_config = skillConfigToJsonb(partial.skillConfig);
  }

  return update;
}

/** SkillConfig → JSONB-shaped object for the agx_agent row. Returns the
 * `{}` empty-default when every field is at its zero value so we don't
 * spam the DB with redundant `{"included":[],"listed":[],...}` rows. */
function skillConfigToJsonb(cfg: SkillConfig | undefined): Record<string, unknown> {
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

    agentType: row.agent_type as AgentDefinition["agentType"],
    name: row.name,
    description: row.description,
    category: row.category,
    tags: row.tags,
    isActive: row.is_active,

    isPublic: false,
    isArchived: false,
    isFavorite: false,
    userId: null,
    organizationId: null,
    projectId: null,
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
    contextSlots: row.context_slots ?? [],
    modelTiers: row.model_tiers,
    outputSchema: row.output_schema,
    customTools: row.custom_tools ?? [],
    autoToolsDisabled: Boolean(
      (row as unknown as { tool_config?: { auto_tools_disabled?: boolean } })
        .tool_config?.auto_tools_disabled,
    ),
    // Version snapshot row schema may or may not carry skill_config — the
    // RPC return type isn't tightened here. Defensive parse handles both.
    skillConfig: parseSkillConfigJson(
      (row as { skill_config?: unknown }).skill_config,
    ),
    uiGates: (row.ui_gates as unknown as UiGates) ?? {},
    matrxActions: (row.matrx_actions as unknown as MatrxActionsConfig) ?? {},
    mcpServers: row.mcp_servers ?? [],

    isOwner: null,
    accessLevel: null,
    sharedByEmail: null,
    // Version snapshots predate the dedup-pyramid column. Default to 0
    // (no boost) for snapshots that don't carry it; live agents read
    // the real value via dbRowToAgentDefinition.
    defaultRagBoost:
      (row as unknown as { default_rag_boost?: number }).default_rag_boost ??
      0,
  };
}

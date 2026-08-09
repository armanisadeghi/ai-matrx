/**
 * The canonical field set for linked-agent sync.
 *
 * THIS IS THE CONTRACT. `public.agx_sync_linked_agents(p_from_id, p_to_id,
 * p_include_identity)` copies exactly these `agent.definition` columns from the
 * source row onto the target row — the identity group only when
 * `p_include_identity` is true, the behavior group always.
 *
 * Every consumer that answers "are these two agents the same?" or "what will
 * Pull/Push overwrite?" derives its answer from this list, so a verdict can
 * never disagree with what the sync actually writes. Drift between this list
 * and the live RPC is caught by `pnpm check:sync-fields`
 * ([script](../../../scripts/check-agent-sync-fields.ts)), which parses the
 * SET clause out of the deployed function definition.
 *
 * Adding a column to the RPC's UPDATE means adding a row here in the same
 * change — otherwise the sync silently overwrites a field the comparison swore
 * was identical.
 *
 * KNOWN GAP (not a bug in this file): `ui_gates` and `matrx_actions` are real
 * config columns on `agent.definition` that the RPC does NOT copy. They are
 * deliberately absent below because the comparison must describe the sync as
 * it is, not as it should be. Tracked in FOUND_DEFECTS.md.
 */

/** Identity = name/description/category/tags — only copied when the caller opts in. */
export type AgentSyncFieldGroup = "identity" | "behavior";

export interface AgentSyncField {
  /** `agent.definition` column name — what the RPC's UPDATE ... SET targets. */
  readonly column: string;
  /** camelCase key used for the snapshot object + the diff adapter registry. */
  readonly field: string;
  /** Human label shown in the per-field summary. */
  readonly label: string;
  readonly group: AgentSyncFieldGroup;
}

export const AGENT_SYNC_FIELDS: readonly AgentSyncField[] = [
  // ── Identity (copied only when includeIdentity) ───────────────────────────
  { column: "name", field: "name", label: "Name", group: "identity" },
  {
    column: "description",
    field: "description",
    label: "Description",
    group: "identity",
  },
  { column: "category", field: "category", label: "Category", group: "identity" },
  { column: "tags", field: "tags", label: "Tags", group: "identity" },

  // ── Behavior (always copied) ──────────────────────────────────────────────
  {
    column: "messages",
    field: "messages",
    label: "System prompt & messages",
    group: "behavior",
  },
  {
    column: "variable_definitions",
    field: "variableDefinitions",
    label: "Variables",
    group: "behavior",
  },
  { column: "model_id", field: "modelId", label: "Model", group: "behavior" },
  {
    column: "model_tiers",
    field: "modelTiers",
    label: "Model tiers",
    group: "behavior",
  },
  { column: "settings", field: "settings", label: "Settings", group: "behavior" },
  {
    column: "output_schema",
    field: "outputSchema",
    label: "Output schema",
    group: "behavior",
  },
  { column: "tools", field: "tools", label: "Tools", group: "behavior" },
  {
    column: "custom_tools",
    field: "customTools",
    label: "Custom tools",
    group: "behavior",
  },
  {
    column: "context_slots",
    field: "contextSlots",
    label: "Context slots",
    group: "behavior",
  },
  {
    column: "mcp_servers",
    field: "mcpServers",
    label: "MCP servers",
    group: "behavior",
  },
  {
    column: "tool_config",
    field: "toolConfig",
    label: "Tool config",
    group: "behavior",
  },
  {
    column: "skill_config",
    field: "skillConfig",
    label: "Skills",
    group: "behavior",
  },
  {
    column: "default_rag_boost",
    field: "defaultRagBoost",
    label: "RAG boost",
    group: "behavior",
  },
  {
    column: "rag_awareness_mode",
    field: "ragAwarenessMode",
    label: "RAG awareness",
    group: "behavior",
  },
] as const;

/**
 * Column list for the snapshot read. `id` leads so the caller can key the two
 * rows without a second round trip.
 */
export const AGENT_SYNC_SNAPSHOT_SELECT: string = [
  "id",
  ...AGENT_SYNC_FIELDS.map((f) => f.column),
].join(", ");

/** camelCase field → descriptor, for labeling a diff node. */
export const AGENT_SYNC_FIELD_BY_KEY: Readonly<Record<string, AgentSyncField>> =
  Object.fromEntries(AGENT_SYNC_FIELDS.map((f) => [f.field, f]));

/**
 * One agent's values for exactly the synced fields, keyed by camelCase field.
 * Values are the RAW Postgres values (not passed through the agent converter),
 * because the RPC copies raw columns — normalizing first could hide a real
 * difference or invent one.
 */
export type AgentSyncSnapshot = Record<string, unknown>;

/** Map a `agent.definition` row (snake_case) onto a snapshot (camelCase). */
export function toAgentSyncSnapshot(
  row: Record<string, unknown>,
): AgentSyncSnapshot {
  const snapshot: AgentSyncSnapshot = {};
  for (const f of AGENT_SYNC_FIELDS) {
    snapshot[f.field] = row[f.column] ?? null;
  }
  return snapshot;
}

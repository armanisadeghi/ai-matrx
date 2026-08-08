import type {
  AgentDefinition,
  AgentDefinitionRecord,
} from "@/features/agents/types/agent-definition.types";

/**
 * Human-readable, multi-line summary of a full agent definition — the "Copy"
 * (human) flavor shared by every agent-detail surface (currently
 * `AgentViewContent`). The AI flavor dumps the full definition as JSON via
 * `buildAgentPayload`, so this only needs to cover the fields a human scans.
 */
export function agentDefinitionSummary(
  agent: AgentDefinition,
  opts?: {
    liveAgentId?: string;
    currentVersionId?: string | null;
    modelLabel?: string | null;
  },
): string {
  const entityLabel = agent.agentType === "builtin" ? "System Agent" : "Agent";
  const lines: string[] = [
    `${entityLabel}: ${agent.name}`,
    `Agent ID: ${opts?.liveAgentId ?? agent.id}`,
  ];
  if (agent.version != null) lines.push(`Version: ${agent.version}`);
  if (opts?.currentVersionId) {
    lines.push(`Current Version ID: ${opts.currentVersionId}`);
  }
  if (agent.description) lines.push(`Description: ${agent.description}`);
  if (agent.category) lines.push(`Category: ${agent.category}`);
  const modelLabel = opts?.modelLabel ?? agent.modelId;
  if (modelLabel) lines.push(`Model: ${modelLabel}`);
  if (agent.tags?.length) lines.push(`Tags: ${agent.tags.join(", ")}`);

  lines.push(
    "",
    `Settings: ${Object.keys(agent.settings ?? {}).length}`,
    `Variables: ${agent.variableDefinitions?.length ?? 0}`,
    `Context slots: ${agent.contextSlots?.length ?? 0}`,
    `Tools: ${(agent.tools?.length ?? 0) + (agent.customTools?.length ?? 0)}`,
    `MCP servers: ${agent.mcpServers?.length ?? 0}`,
    `Messages: ${agent.messages?.length ?? 0}`,
  );

  const statusBits = [
    agent.isActive ? "active" : "inactive",
    agent.isArchived ? "archived" : null,
    agent.isPublic ? "public" : null,
  ].filter(Boolean);
  lines.push("", `Status: ${statusBits.join(", ")}`);
  if (agent.isVersion && agent.changeNote) {
    lines.push(`Change note: ${agent.changeNote}`);
  }

  return lines.join("\n");
}

/**
 * Compact roster projection for a builtin (system) agent — the single shape
 * behind both `SystemAgentsGrid`'s surface-registry scope emitter and its
 * "Roster summary" Copy-for-AI variant. Never duplicate this projection.
 */
export interface SystemAgentRosterEntry {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  model_id: string | null;
  is_active: boolean | null;
  is_archived: boolean | null;
  updated_at: string | null;
}

export function buildSystemAgentRosterEntries(
  agents: AgentDefinitionRecord[],
): SystemAgentRosterEntry[] {
  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description ?? null,
    category: a.category ?? null,
    tags: a.tags ?? null,
    model_id: a.modelId ?? null,
    is_active: a.isActive ?? null,
    is_archived: a.isArchived ?? null,
    updated_at: a.updatedAt ?? null,
  }));
}

/** One scannable line per roster entry — used for both the per-card human
 *  copy and the whole-roster human copy-all. */
export function systemAgentRosterEntrySummary(
  entry: SystemAgentRosterEntry,
): string {
  return [
    entry.name,
    entry.category ? `(${entry.category})` : null,
    entry.model_id ? `model:${entry.model_id}` : null,
    entry.is_active === false ? "[inactive]" : null,
    entry.is_archived ? "[archived]" : null,
  ]
    .filter(Boolean)
    .join(" ");
}

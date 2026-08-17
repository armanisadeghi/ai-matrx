import { computeDiff } from "@/components/diff/engine/compute-diff";
import { AGENT_DIFF_OPTIONS } from "@/features/agents/components/diff/agent-diff-constants";
import {
  parseAgentAutoToolsDisabled,
  parseSkillConfigJson,
} from "@/features/agents/redux/agent-definition/converters";
import { parseCustomTools } from "@/features/agents/redux/agent-definition/parse-custom-tools";
import { sanitizeAgentToolIds } from "@/features/agents/redux/agent-definition/sanitize-tool-ids";
import type { Database } from "@/types/database.types";

export type AgentDefinitionVersionRow =
  Database["agent"]["Tables"]["definition_version"]["Row"];

/** One immutable agent version reduced to the fields the canonical diff sees. */
export interface AgentVersionFieldSnapshot {
  versionNumber: number;
  changedAt: string;
  values: Readonly<Record<string, unknown>>;
}

export interface AgentFieldChangeMoment {
  versionNumber: number;
  changedAt: string;
}

/**
 * Convert the generated DB row into the same camelCase/value semantics used by
 * `AgentDefinition`. This is intentionally a comparison record rather than a
 * second domain model: version-only metadata stays beside `values`.
 */
export function toAgentVersionFieldSnapshot(
  row: AgentDefinitionVersionRow,
): AgentVersionFieldSnapshot {
  return {
    versionNumber: row.version_number,
    changedAt: row.changed_at,
    values: {
      name: row.name ?? "",
      description: row.description,
      category: row.category,
      tags: row.tags ?? [],
      isActive: row.is_active ?? false,
      messages: row.messages ?? [],
      variableDefinitions: row.variable_definitions,
      modelId: row.model_id,
      modelTiers: row.model_tiers,
      settings: row.settings ?? {},
      outputSchema: row.output_schema,
      tools: sanitizeAgentToolIds(
        row.tools ?? [],
        "fetchAgentVersionFieldSnapshots",
      ),
      customTools: parseCustomTools(row.custom_tools, {
        agentId: row.agent_id,
        relation: "agent.definition_version",
      }),
      contextSlots: row.context_slots ?? [],
      mcpServers: row.mcp_servers ?? [],
      autoToolsDisabled: parseAgentAutoToolsDisabled(row.tool_config),
      skillConfig: parseSkillConfigJson(row.skill_config),
      matrxActions: row.matrx_actions,
      uiGates: row.ui_gates,
    },
  };
}

function fieldValuesMatch(
  fieldKey: string,
  currentValue: unknown,
  historicalValue: unknown,
): boolean {
  return !computeDiff(
    { [fieldKey]: historicalValue },
    { [fieldKey]: currentValue },
    AGENT_DIFF_OPTIONS,
  ).hasChanges;
}

/**
 * Find when each requested field entered its current value. The walk stops at
 * the first older, different snapshot, so a value that later reverted is
 * attributed to the reversion—not its first-ever appearance.
 *
 * A missing key or newest-snapshot mismatch yields no answer. Callers must
 * disclose that gap instead of substituting the record timestamp as though it
 * were field-level history.
 */
export function deriveAgentFieldChangeMoments(
  currentValues: Readonly<Record<string, unknown>>,
  snapshots: readonly AgentVersionFieldSnapshot[],
  fieldKeys: readonly string[],
): Readonly<Record<string, AgentFieldChangeMoment>> {
  const ordered = [...snapshots].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  );
  const result: Record<string, AgentFieldChangeMoment> = {};

  for (const fieldKey of fieldKeys) {
    if (!Object.hasOwn(currentValues, fieldKey)) continue;
    const currentValue = currentValues[fieldKey];
    let candidate: AgentFieldChangeMoment | null = null;

    for (const snapshot of ordered) {
      if (!Object.hasOwn(snapshot.values, fieldKey)) {
        candidate = null;
        break;
      }
      if (
        !fieldValuesMatch(fieldKey, currentValue, snapshot.values[fieldKey])
      ) {
        break;
      }
      candidate = {
        versionNumber: snapshot.versionNumber,
        changedAt: snapshot.changedAt,
      };
    }

    if (candidate) result[fieldKey] = candidate;
  }

  return result;
}

/** Exact saved date for a numeric version, when that snapshot is visible. */
export function findAgentVersionMoment(
  snapshots: readonly AgentVersionFieldSnapshot[],
  version: number | null | undefined,
): AgentFieldChangeMoment | null {
  if (version == null) return null;
  const snapshot = snapshots.find((item) => item.versionNumber === version);
  return snapshot
    ? {
        versionNumber: snapshot.versionNumber,
        changedAt: snapshot.changedAt,
      }
    : null;
}

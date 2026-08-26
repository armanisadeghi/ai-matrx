import { computeDiff } from "@/components/diff/engine/compute-diff";
import type { DiffNode, DiffResult } from "@/components/diff/engine/types";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import { AGENT_DIFF_OPTIONS } from "./agent-diff-constants";

/** Optional identity fields copied only when a sync requests identity. */
const AGENT_PROFILE_FIELDS = new Set(["name", "description", "category", "tags"]);

/** Per-record state deliberately left local by the linked-agent sync contract. */
const AGENT_LOCAL_STATE_FIELDS = new Set([
  "isActive",
  "isArchived",
  "isFavorite",
]);

export interface AgentDefinitionComparison {
  diffResult: DiffResult;
  changedFields: DiffNode[];
  behaviorFields: DiffNode[];
  profileFields: DiffNode[];
  localStateFields: DiffNode[];
  behaviorMatches: boolean;
  comparedConfigurationMatches: boolean;
}

/**
 * Redux stores fetch/undo bookkeeping beside AgentDefinition under top-level
 * `_...` keys. Remove that record chrome at the comparison boundary while
 * leaving nested structured values untouched — nested `_`/`__` keys such as
 * output-schema `__kind` are executable agent data and must remain visible.
 */
function toComparableAgentRecord(
  agent: Partial<AgentDefinition>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(agent).filter(([key]) => !key.startsWith("_")),
  );
}

/**
 * Compare two live agents through the same exclusions and identity rules as
 * the canonical AgentDiffViewer, while separating behavior from expected
 * personal-copy profile differences.
 */
export function compareAgentDefinitions(
  systemAgent: Partial<AgentDefinition>,
  personalAgent: Partial<AgentDefinition>,
): AgentDefinitionComparison {
  const systemRecord = toComparableAgentRecord(systemAgent);
  const personalRecord = toComparableAgentRecord(personalAgent);
  const diffResult = computeDiff(
    systemRecord,
    personalRecord,
    AGENT_DIFF_OPTIONS,
  );
  const changedFields = diffResult.root.filter(
    (node) => node.changeType !== "unchanged",
  );
  const profileFields = changedFields.filter((node) =>
    AGENT_PROFILE_FIELDS.has(node.key),
  );
  const localStateFields = changedFields.filter((node) =>
    AGENT_LOCAL_STATE_FIELDS.has(node.key),
  );
  const behaviorFields = changedFields.filter(
    (node) =>
      !AGENT_PROFILE_FIELDS.has(node.key) &&
      !AGENT_LOCAL_STATE_FIELDS.has(node.key),
  );

  return {
    diffResult,
    changedFields,
    behaviorFields,
    profileFields,
    localStateFields,
    behaviorMatches: behaviorFields.length === 0,
    comparedConfigurationMatches: !diffResult.hasChanges,
  };
}

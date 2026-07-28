import type { DiffOptions } from "@/components/diff/engine/types";

/** Internal/runtime fields that should never appear in diffs */
export const AGENT_EXCLUDE_PATHS = new Set([
  "id",
  "userId",
  "organizationId",
  "taskId",
  "createdAt",
  "updatedAt",
  "isVersion",
  "parentAgentId",
  "sourceAgentId",
  "sourceSnapshotAt",
  "isOwner",
  "accessLevel",
  "sharedByEmail",
  "agentType",
  "version",
  "changeNote",
  "changedAt",
]);

/** Identity keys for array matching — prevents false diffs when items shift position */
export const AGENT_IDENTITY_KEYS: Record<string, string> = {
  variableDefinitions: "name",
  contextSlots: "key",
  customTools: "name",
};

export const AGENT_DIFF_OPTIONS: DiffOptions = {
  excludePaths: AGENT_EXCLUDE_PATHS,
  identityKeys: AGENT_IDENTITY_KEYS,
  skipUnderscorePrefix: true,
};

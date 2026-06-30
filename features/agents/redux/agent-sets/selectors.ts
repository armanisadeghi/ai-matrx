// features/agents/agent-sets/redux/selectors.ts
//
// Memoized selectors for the `agentSets` slice. Per-set selectors are factories
// (bind once per orchestratorId via useMemo), mirroring the agent-consumers
// `makeSelect*` convention.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import { selectAllAgents } from "@/features/agents/redux/agent-definition/selectors";
import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";
import type { AgentSetDetailEntry } from "./slice";
import type { AgentSetMember, AgentSetSummary } from "@/features/agents/agent-sets/types";

const selectAgentSets = (state: RootState) => state.agentSets;

export const selectAgentSetsList = createSelector(
  selectAgentSets,
  (s): AgentSetSummary[] => s.list,
);

export const selectAgentSetsListStatus = createSelector(
  selectAgentSets,
  (s) => s.listStatus,
);

export const selectAgentSetsListError = createSelector(
  selectAgentSets,
  (s) => s.listError,
);

export const selectAgentSetsCount = createSelector(
  selectAgentSetsList,
  (list) => list.length,
);

const EMPTY_ENTRY: AgentSetDetailEntry = {
  members: [],
  config: {},
  label: null,
  exists: false,
  status: "idle",
  error: null,
};

/** Per-set detail entry (members + config + status). Bind once per orchestratorId. */
export function makeSelectAgentSetEntry(orchestratorId: string) {
  return createSelector(
    selectAgentSets,
    (s): AgentSetDetailEntry => s.byId[orchestratorId] ?? EMPTY_ENTRY,
  );
}

const EMPTY_MEMBERS: AgentSetMember[] = [];

/** Ordered members of a set. Bind once per orchestratorId. */
export function makeSelectAgentSetMembers(orchestratorId: string) {
  return createSelector(
    selectAgentSets,
    (s): AgentSetMember[] => s.byId[orchestratorId]?.members ?? EMPTY_MEMBERS,
  );
}

/** Set of member agent ids for fast membership checks. Bind once per orchestratorId. */
export function makeSelectAgentSetMemberIds(orchestratorId: string) {
  return createSelector(makeSelectAgentSetMembers(orchestratorId), (members) =>
    members.map((m) => m.agentId),
  );
}

/** Whether a given set is loaded + ready. Bind once per orchestratorId. */
export function makeSelectAgentSetStatus(orchestratorId: string) {
  return createSelector(
    selectAgentSets,
    (s) => s.byId[orchestratorId]?.status ?? "idle",
  );
}

/**
 * Live (non-version, non-archived) agents the user can choose as an orchestrator
 * or drag into a set, sorted by name. Sourced from the shared agentDefinition
 * registry (populated by `fetchAgentsList`).
 */
export const selectPickableAgents = createSelector(
  selectAllAgents,
  (agents): AgentDefinitionRecord[] =>
    Object.values(agents)
      .filter((a): a is AgentDefinitionRecord => Boolean(a) && !a.isVersion && !a.isArchived)
      .sort((x, y) => (x.name ?? "").localeCompare(y.name ?? "")),
);

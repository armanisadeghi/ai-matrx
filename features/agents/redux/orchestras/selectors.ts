// features/agents/agent-sets/redux/selectors.ts
//
// Memoized selectors for the `agentSets` slice. Per-set selectors are factories
// (bind once per orchestratorId via useMemo), mirroring the agent-consumers
// `makeSelect*` convention.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
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

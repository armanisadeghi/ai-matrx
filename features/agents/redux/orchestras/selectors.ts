// features/agents/orchestras/redux/selectors.ts
//
// Memoized selectors for the `orchestras` slice. Per-set selectors are factories
// (bind once per conductorId via useMemo), mirroring the agent-consumers
// `makeSelect*` convention.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import type { OrchestraDetailEntry } from "./slice";
import type { OrchestraMember, OrchestraSummary } from "@/features/agents/orchestras/types";

const selectOrchestras = (state: RootState) => state.orchestras;

export const selectOrchestrasList = createSelector(
  selectOrchestras,
  (s): OrchestraSummary[] => s.list,
);

export const selectOrchestrasListStatus = createSelector(
  selectOrchestras,
  (s) => s.listStatus,
);

export const selectOrchestrasListError = createSelector(
  selectOrchestras,
  (s) => s.listError,
);

export const selectOrchestrasCount = createSelector(
  selectOrchestrasList,
  (list) => list.length,
);

const EMPTY_ENTRY: OrchestraDetailEntry = {
  members: [],
  config: {},
  label: null,
  exists: false,
  status: "idle",
  error: null,
};

/** Per-set detail entry (members + config + status). Bind once per conductorId. */
export function makeSelectOrchestraEntry(conductorId: string) {
  return createSelector(
    selectOrchestras,
    (s): OrchestraDetailEntry => s.byId[conductorId] ?? EMPTY_ENTRY,
  );
}

const EMPTY_MEMBERS: OrchestraMember[] = [];

/** Ordered members of a set. Bind once per conductorId. */
export function makeSelectOrchestraMembers(conductorId: string) {
  return createSelector(
    selectOrchestras,
    (s): OrchestraMember[] => s.byId[conductorId]?.members ?? EMPTY_MEMBERS,
  );
}

/** Set of member agent ids for fast membership checks. Bind once per conductorId. */
export function makeSelectOrchestraMemberIds(conductorId: string) {
  return createSelector(makeSelectOrchestraMembers(conductorId), (members) =>
    members.map((m) => m.agentId),
  );
}

/** Whether a given set is loaded + ready. Bind once per conductorId. */
export function makeSelectOrchestraStatus(conductorId: string) {
  return createSelector(
    selectOrchestras,
    (s) => s.byId[conductorId]?.status ?? "idle",
  );
}

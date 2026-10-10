// lib/redux/sagas/rootSaga.ts
//
// Slim root saga — entity-free. Used by `makeStore()` (the slim store).
// Entity-bound routes use `createEntityRootSaga` from `./entity-rootSaga.ts`
// which wraps this slim saga and adds entity-specific watchers.
//
// See `~/.claude/plans/the-entity-system-which-bubbly-wind.md`.

import { all, call, fork } from "redux-saga/effects";
import { chatSagas } from "@ai-matrx/chat/store/sagas";
import { watchDefinitionChanges } from "@/features/agents/redux/sagas/syncDefinitionToInstances.saga";
import { watchModelToolDefault } from "@/features/agents/redux/sagas/modelToolDefault.saga";

export function createSlimRootSaga() {
  return function* rootSaga() {
    yield all([
      ...chatSagas().map((saga) => fork(saga)),
      // Builder tier (P25): agent-definition edits reach live runs.
      fork(watchDefinitionChanges),
      // A model that cannot use tools turns automatic tools off.
      fork(watchModelToolDefault),
    ]);
  };
}

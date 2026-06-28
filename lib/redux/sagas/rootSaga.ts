// lib/redux/sagas/rootSaga.ts
//
// Slim root saga — entity-free. Used by `makeStore()` (the slim store).
// Entity-bound routes use `createEntityRootSaga` from `./entity-rootSaga.ts`
// which wraps this slim saga and adds entity-specific watchers.
//
// See `~/.claude/plans/the-entity-system-which-bubbly-wind.md`.

import { all, call, fork } from "redux-saga/effects";
import { watchDefinitionChanges } from "@/features/agents/redux/execution-system/sagas/syncDefinitionToInstances.saga";

export function createSlimRootSaga() {
  return function* rootSaga() {
    yield all([fork(watchDefinitionChanges)]);
  };
}

// packages/chat/src/store/sagas.ts
//
// The chat package's root-level sagas (PACKAGE-INDEPENDENCE.md §2.2, P2). The host's root saga
// forks each; `createChatStore()` does the same. Empty since P25: the only saga it had,
// `watchDefinitionChanges` (builder edits -> live runs), is builder-tier and now lives with the
// builder in the app (`features/agents/redux/sagas/syncDefinitionToInstances.saga.ts`), forked by
// the host's root saga. A function for the same import-cycle reason as `chatMiddlewares()`.

import type { Saga } from "redux-saga";

export function chatSagas(): readonly Saga[] {
  return [];
}

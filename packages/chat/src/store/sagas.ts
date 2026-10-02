// packages/chat/src/store/sagas.ts
//
// The chat package's root-level sagas (PACKAGE-INDEPENDENCE.md §2.2, P2). The host's root saga
// forks each; `createChatStore()` does the same. `watchDefinitionChanges` is builder-only and
// leaves at P25. A function for the same import-cycle reason as `chatMiddlewares()`.

import { watchDefinitionChanges } from "../agents/redux/execution-system/sagas/syncDefinitionToInstances.saga";

export function chatSagas() {
  return [watchDefinitionChanges] as const;
}

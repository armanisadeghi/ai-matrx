// features/agents/redux/execution-system/instance-user-input/restore-composer-remarks.thunk.ts
//
// The remarks half of the composer restore (see composer-draft-store.ts §
// Staged remarks). Reads the conversation's unsent remarks for this person and
// puts each back as its chip, under its own resource id. A tombstone (the
// remarks went with a send) or another person's record restores nothing, and a
// chip already on screen is never duplicated.

import type { ChatDispatch, ChatRootState } from "../../../../store/root-state";
import { readComposerRemarks } from "./composer-draft-store";
import { isDraftRestoreEnabled } from "./composer-draft.middleware";
import { readStoredRemarks, restageRemarks } from "../instance-resources/remarks";

export function restoreComposerRemarks(conversationId: string, ownerId: string | null, alias?: string) {
  return (dispatch: ChatDispatch, getState: () => ChatRootState): number => {
    if (!isDraftRestoreEnabled(getState())) return 0;
    const stored = readStoredRemarks(readComposerRemarks(conversationId, ownerId, alias));
    if (stored.length === 0) return 0;
    return dispatch(restageRemarks(conversationId, stored));
  };
}

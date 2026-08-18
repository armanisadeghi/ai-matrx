/**
 * The reserved `__google_files` context key — the client half.
 *
 * Attached Google files do NOT travel as a `content[]` resource block. They
 * travel as a context directive, because the server side does two things at
 * once (aidream `services/google_workspace/attachments.py`): it names the files
 * for the agent, and it injects the Google tool for that turn even when the
 * agent's own configuration does not carry it. A content block would deliver
 * the first half and silently drop the second, leaving the agent able to name
 * an attachment it cannot open.
 *
 * Keep this key byte-identical to `GOOGLE_FILES_CONTEXT_KEY` on the server.
 */

import type { RootState } from "@/lib/redux/store";

export const GOOGLE_FILES_CONTEXT_KEY = "__google_files";

/** Stable empty reference — a new [] each render would thrash every selector. */
export const EMPTY_GOOGLE_FILE_IDS: readonly string[] = [];

export function selectGoogleFileIds(
  state: RootState,
  conversationId: string,
): readonly string[] {
  const entry =
    state.instanceContext?.byConversationId?.[conversationId]?.[
      GOOGLE_FILES_CONTEXT_KEY
    ];
  const value = entry?.value;
  if (!Array.isArray(value)) return EMPTY_GOOGLE_FILE_IDS;
  return value.filter((id): id is string => typeof id === "string");
}

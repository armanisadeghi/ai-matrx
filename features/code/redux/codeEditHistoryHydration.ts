/**
 * codeEditHistoryHydration — read path for the AI edit history slice.
 *
 *   • `loadCodeEditHistoryThunk(conversationId)` fetches every
 *     `cx_code_message_file` row plus its `cx_code_edit` children
 *     for one conversation and dispatches `mergeFromServer`. Safe to
 *     dispatch repeatedly — the slice's hydrationStatus guard skips
 *     in-flight loads.
 *
 *   • `useEditHistoryForConversation(conversationId)` is the React
 *     hook used by the in-tab triple view, the chat-message strip,
 *     and the sidebar history list. It runs the load on mount or
 *     when `conversationId` changes.
 *
 * The active conversation is hydrated automatically by
 * `loadConversation` via a side dispatch (kept out of the main
 * bundle thunk to avoid coupling features/agents to features/code).
 */

import { useEffect } from "react";
import { useStore } from "react-redux";
import type { AppDispatch, AppStore, RootState } from "@/lib/redux/store";
import { useAppDispatch } from "@/lib/redux/hooks";
import { runTrackedRequest } from "@/lib/redux/net/runTrackedRequest";
import { createClient } from "@/utils/supabase/client";
import {
  mergeFromServer,
  setHydrationStatus,
  selectCodeEditHistory,
  type AppliedEditEntry,
  type EditEntryStatus,
  type MessageFileSnapshot,
  type MessageFileStatus,
} from "./codeEditHistorySlice";

interface MessageFileRow {
  id: string;
  message_id: string;
  conversation_id: string;
  user_id: string;
  organization_id: string | null;
  file_adapter: string;
  file_path: string;
  library_file_id: string | null;
  before_content: string;
  after_content: string;
  status: MessageFileStatus;
  reverted_at: string | null;
  git_commit_sha: string | null;
  git_branch: string | null;
  created_at: string;
  updated_at: string;
}

interface EditRow {
  id: string;
  message_file_id: string;
  message_id: string;
  conversation_id: string;
  block_index: number;
  search_text: string;
  replace_text: string;
  status: EditEntryStatus;
  applied_at: string | null;
  rejected_at: string | null;
  reverted_at: string | null;
  reject_reason: string | null;
  created_at: string;
}

function rowsToSnapshots(
  files: MessageFileRow[],
  edits: EditRow[],
): MessageFileSnapshot[] {
  const editsByFile = new Map<string, EditRow[]>();
  for (const e of edits) {
    const list = editsByFile.get(e.message_file_id) ?? [];
    list.push(e);
    editsByFile.set(e.message_file_id, list);
  }

  return files.map((row) => {
    const rowEdits = (editsByFile.get(row.id) ?? []).sort(
      (a, b) => a.block_index - b.block_index,
    );
    const mapped: AppliedEditEntry[] = rowEdits.map((e) => ({
      id: e.id,
      patchId: `${row.message_id}:${row.id}:${e.block_index}`,
      blockIndex: e.block_index,
      search: e.search_text,
      replace: e.replace_text,
      status: e.status,
      appliedAt: e.applied_at ?? undefined,
      rejectedAt: e.rejected_at ?? undefined,
      revertedAt: e.reverted_at ?? undefined,
      rejectReason: e.reject_reason ?? undefined,
    }));

    const snap: MessageFileSnapshot = {
      id: row.id,
      messageId: row.message_id,
      conversationId: row.conversation_id,
      organizationId: row.organization_id ?? undefined,
      fileAdapter: row.file_adapter,
      filePath: row.file_path,
      libraryFileId: row.library_file_id ?? undefined,
      beforeContent: row.before_content,
      afterContent: row.after_content,
      edits: mapped,
      status: row.status,
      appliedAt: row.created_at,
      revertedAt: row.reverted_at ?? undefined,
      persistedAt: row.updated_at,
      gitCommitSha: row.git_commit_sha ?? undefined,
      gitBranch: row.git_branch ?? undefined,
    };
    return snap;
  });
}

interface LoadOptions {
  /** Skip the hydrationStatus guard. Used by the explicit "reload"
   *  button in the sidebar history panel. */
  force?: boolean;
}

export function loadCodeEditHistoryThunk(
  conversationId: string,
  options: LoadOptions = {},
): (dispatch: AppDispatch, getState: () => RootState) => Promise<void> {
  return async (dispatch, getState) => {
    if (!conversationId) return;
    const status =
      selectCodeEditHistory(getState()).hydrationStatus[conversationId];
    if (!options.force && (status === "loading" || status === "loaded")) {
      return;
    }

    dispatch(setHydrationStatus({ conversationId, status: "loading" }));

    try {
      await runTrackedRequest(dispatch, {
        id: `code-history-load:${conversationId}`,
        kind: "crud",
        label: `Load AI edit history for conversation ${conversationId}`,
        run: async () => {
          const supabase = createClient();
          const [filesRes, editsRes] = await Promise.all([
            supabase
              .schema("chat").from("code_message_file")
              .select("*")
              .eq("conversation_id", conversationId)
              .order("created_at", { ascending: true }),
            supabase
              .schema("chat").from("code_edit")
              .select("*")
              .eq("conversation_id", conversationId)
              .order("created_at", { ascending: true }),
          ]);

          if (filesRes.error) throw filesRes.error;
          if (editsRes.error) throw editsRes.error;

          const snapshots = rowsToSnapshots(
            (filesRes.data ?? []) as MessageFileRow[],
            (editsRes.data ?? []) as EditRow[],
          );
          dispatch(mergeFromServer({ conversationId, snapshots }));
        },
      });
    } catch (err) {
      dispatch(setHydrationStatus({ conversationId, status: "error" }));
      // eslint-disable-next-line no-console
      console.error(
        `[codeEditHistory] hydration failed for conversation ${conversationId}:`,
        err,
      );
    }
  };
}

/**
 * Lazily hydrate the edit history for one conversation. Re-runs when
 * the id changes; mounts cheaply when history is already loaded.
 */
export function useEditHistoryForConversation(
  conversationId: string | null | undefined,
): void {
  const dispatch = useAppDispatch();
  const store = useStore() as AppStore;

  useEffect(() => {
    if (!conversationId) return;
    const status = selectCodeEditHistory(store.getState()).hydrationStatus[
      conversationId
    ];
    if (status === "loading" || status === "loaded") return;
    dispatch(loadCodeEditHistoryThunk(conversationId));
  }, [conversationId, store, dispatch]);
}

/**
 * codeEditHistoryFlush — persistence layer for codeEditHistorySlice.
 *
 *   • `flushHistoryThunk(args?)` batches every entry in
 *     `codeEditHistory.pendingWrites` (or the explicit subset
 *     `args.keys`) into per-(message, file) RPC calls against
 *     `cx_code_history_upsert`. Each call goes through
 *     `runTrackedRequest` so the existing retry / recovery UI lights
 *     up if a flush stalls. On success we dispatch `markPersisted`
 *     to drop the entry; on failure we dispatch `markWriteError` and
 *     leave it queued for the hook's next sweep.
 *
 *   • `useFlushAIEditHistory()` is the React-side scheduler. It
 *     debounces flushes by 500ms after the most-recent write, plus
 *     hard triggers on assistant-turn completion, page hide, and
 *     route change. Mounted once at the workspace root.
 */

import { useEffect, useRef } from "react";
import { useStore } from "react-redux";
import { usePathname } from "next/navigation";
import type { AppDispatch, AppStore, RootState } from "@/lib/redux/store";
import { useAppDispatch } from "@/lib/redux/hooks";
import { runTrackedRequest } from "@/lib/redux/net/runTrackedRequest";
import { createClient } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import {
  markPersisted,
  markWriteError,
  selectCodeEditHistory,
  type AppliedEditEntry,
  type MessageFileSnapshot,
  type PendingWrite,
} from "./codeEditHistorySlice";
import { fileIdentityKey } from "../utils/fileIdentity";

// ─── Payload helpers ────────────────────────────────────────────────────────

interface RpcEditPayload {
  block_index: number;
  search_text: string;
  replace_text: string;
  status: AppliedEditEntry["status"];
  applied_at: string | null;
  rejected_at: string | null;
  reverted_at: string | null;
  reject_reason: string | null;
}

interface RpcPayload {
  message_id: string;
  conversation_id: string;
  organization_id: string | null;
  file_adapter: string;
  file_path: string;
  library_file_id: string | null;
  before_content: string;
  after_content: string;
  status: MessageFileSnapshot["status"];
  git_commit_sha: string | null;
  git_branch: string | null;
  edits_applied_count: number;
  edits_rejected_count: number;
  edits_pending_count: number;
  edits: RpcEditPayload[];
}

interface RpcResponse {
  message_file_id: string;
  edits: Array<{ block_index: number | string; id: string }>;
}

function buildPayload(snap: MessageFileSnapshot): RpcPayload {
  let applied = 0;
  let rejected = 0;
  let reverted = 0;
  for (const e of snap.edits) {
    if (e.status === "applied") applied++;
    else if (e.status === "rejected") rejected++;
    else if (e.status === "reverted") reverted++;
  }
  return {
    message_id: snap.messageId,
    conversation_id: snap.conversationId,
    organization_id: snap.organizationId ?? null,
    file_adapter: snap.fileAdapter,
    file_path: snap.filePath,
    library_file_id: snap.libraryFileId ?? null,
    before_content: snap.beforeContent,
    after_content: snap.afterContent,
    status: snap.status,
    git_commit_sha: snap.gitCommitSha ?? null,
    git_branch: snap.gitBranch ?? null,
    edits_applied_count: applied,
    edits_rejected_count: rejected,
    // pending count: anything that isn't applied/rejected/reverted.
    edits_pending_count: Math.max(
      0,
      snap.edits.length - applied - rejected - reverted,
    ),
    edits: snap.edits.map((e) => ({
      block_index: e.blockIndex,
      search_text: e.search,
      replace_text: e.replace,
      status: e.status,
      applied_at: e.appliedAt ?? null,
      rejected_at: e.rejectedAt ?? null,
      reverted_at: e.revertedAt ?? null,
      reject_reason: e.rejectReason ?? null,
    })),
  };
}

function findSnapshot(
  state: RootState,
  write: PendingWrite,
): MessageFileSnapshot | null {
  const list = selectCodeEditHistory(state).byMessage[write.messageId];
  if (!list) return null;
  const fileKey = fileIdentityKey(write.fileIdentity);
  for (const s of list) {
    const k = `${s.fileAdapter}:${s.filePath}`;
    if (k === fileKey) return s;
  }
  return null;
}

// ─── Flush thunk ────────────────────────────────────────────────────────────

interface FlushHistoryArgs {
  /** When omitted, flushes every entry in `pendingWrites`. */
  keys?: string[];
  /**
   * When true, skip the in-flight guard. Used by the visibilitychange
   * trigger so the user doesn't lose data on a fast page hide.
   */
  force?: boolean;
}

const inFlight = new Set<string>();

export function flushHistoryThunk(
  args: FlushHistoryArgs = {},
): (dispatch: AppDispatch, getState: () => RootState) => Promise<void> {
  return async (dispatch, getState) => {
    const state = getState();
    const writes = selectCodeEditHistory(state).pendingWrites;
    const keys = args.keys ?? Object.keys(writes);
    if (keys.length === 0) return;

    const supabase = createClient();

    await Promise.all(
      keys.map(async (key) => {
        if (!args.force && inFlight.has(key)) return;
        const write = writes[key];
        if (!write) return;
        // Re-resolve the snapshot at flush time so the latest state
        // (including any further accepts that landed during the
        // 500ms debounce window) is what we send.
        const snap = findSnapshot(getState(), write);
        if (!snap) return;
        const payload = buildPayload(snap);

        inFlight.add(key);
        try {
          await runTrackedRequest(dispatch, {
            id: `code-history:${key}`,
            kind: "crud",
            label: `Save edit history for ${snap.filePath}`,
            run: async () => {
              const { data, error } = await supabase.rpc(
                "cx_code_history_upsert",
                { p_payload: payload as unknown as Json },
              );
              if (error) throw error;
              const response = data as unknown as RpcResponse | null;
              if (!response?.message_file_id) {
                throw new Error(
                  "cx_code_history_upsert: missing message_file_id in response",
                );
              }
              dispatch(
                markPersisted({
                  messageId: write.messageId,
                  fileIdentity: write.fileIdentity,
                  messageFileId: response.message_file_id,
                  editIds: (response.edits ?? []).map((e) => ({
                    blockIndex:
                      typeof e.block_index === "number"
                        ? e.block_index
                        : Number.parseInt(String(e.block_index), 10),
                    id: e.id,
                  })),
                  persistedAt: new Date().toISOString(),
                }),
              );
            },
          });
        } catch (err) {
          dispatch(
            markWriteError({
              messageId: write.messageId,
              fileIdentity: write.fileIdentity,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        } finally {
          inFlight.delete(key);
        }
      }),
    );
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

interface UseFlushOptions {
  /** Disable persistence entirely (used in tests). */
  enabled?: boolean;
  /** Debounce window after the last write before we attempt a flush. */
  debounceMs?: number;
}

export function useFlushAIEditHistory(opts: UseFlushOptions = {}): void {
  const { enabled = true, debounceMs = 500 } = opts;
  const dispatch = useAppDispatch();
  const store = useStore() as AppStore;
  const pathname = usePathname();
  const lastPathnameRef = useRef(pathname);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced subscriber. Fires `debounceMs` after the latest write
  // mutation lands. Cheap to subscribe — selects a single ref.
  useEffect(() => {
    if (!enabled) return undefined;
    let lastWrites = selectCodeEditHistory(store.getState()).pendingWrites;
    const unsubscribe = store.subscribe(() => {
      const writes = selectCodeEditHistory(store.getState()).pendingWrites;
      if (writes === lastWrites) return;
      lastWrites = writes;
      if (Object.keys(writes).length === 0) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        dispatch(flushHistoryThunk());
      }, debounceMs);
    });
    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
    };
  }, [enabled, store, dispatch, debounceMs]);

  // Flush on assistant turn completion. The `requests.byRequestId`
  // status going to "complete" is the cleanest signal that a stream
  // finished and the user is back at idle — perfect time to ship the
  // batch even if the debounce window hasn't elapsed yet.
  useEffect(() => {
    if (!enabled) return undefined;
    let lastCompleteCount = 0;
    const computeCompleteCount = (state: RootState): number => {
      const byId = state.activeRequests?.byRequestId ?? {};
      let n = 0;
      for (const id in byId) {
        if (byId[id]?.status === "complete") n++;
      }
      return n;
    };
    lastCompleteCount = computeCompleteCount(store.getState());

    const unsubscribe = store.subscribe(() => {
      const count = computeCompleteCount(store.getState());
      if (count !== lastCompleteCount) {
        lastCompleteCount = count;
        const writes = selectCodeEditHistory(store.getState()).pendingWrites;
        if (Object.keys(writes).length > 0) {
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
          }
          dispatch(flushHistoryThunk());
        }
      }
    });
    return unsubscribe;
  }, [enabled, store, dispatch]);

  // Browser-level safety nets: page hide / unload / tab hidden. We
  // dispatch with `force: true` so an in-flight flush doesn't block
  // the rescue dispatch.
  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof window === "undefined") return undefined;

    const flushNow = () => {
      const writes = selectCodeEditHistory(store.getState()).pendingWrites;
      if (Object.keys(writes).length === 0) return;
      dispatch(flushHistoryThunk({ force: true }));
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushNow();
    };
    const onBeforeUnload = () => flushNow();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onBeforeUnload);
    };
  }, [enabled, store, dispatch]);

  // Route change inside the SPA — Next.js doesn't emit a beforeunload
  // for client-side navigation, so we lean on `usePathname` to
  // detect it.
  useEffect(() => {
    if (!enabled) return;
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    const writes = selectCodeEditHistory(store.getState()).pendingWrites;
    if (Object.keys(writes).length > 0) {
      dispatch(flushHistoryThunk({ force: true }));
    }
  }, [enabled, pathname, store, dispatch]);
}

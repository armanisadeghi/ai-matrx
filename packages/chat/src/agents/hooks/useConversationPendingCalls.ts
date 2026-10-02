/**
 * useConversationPendingCalls — surface durable client-delegated tool prompts.
 *
 * Mount this hook in any component that renders a conversation. It fetches
 * the list of `cx_tool_call` rows the server has persisted in
 * `status='delegated'` for this conversation and exposes them so the UI can
 * render pending prompts exactly as if the original SSE had just delivered
 * the `tool_delegated` events live.
 *
 * Use case: the user closed their browser during a tool prompt and reopened
 * the conversation the next day. The server preserved the call; this hook
 * surfaces it.
 *
 * Intentionally stateless — no Redux slice is introduced. Callers keep the
 * list in local state and re-run the fetch when they need to.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  fetchConversationPendingCalls,
  type PendingCallSummary,
} from "@/features/agents/api/fetch-pending-calls";

export interface UseConversationPendingCallsResult {
  /** All client-delegated calls currently awaiting the user's response. */
  pendingCalls: PendingCallSummary[];
  /** True from the moment the hook starts fetching until the first response. */
  isLoading: boolean;
  /** Re-fetch from the server (e.g. after POSTing a tool_result). */
  refresh: () => Promise<PendingCallSummary[]>;
}

export interface UseConversationPendingCallsOptions {
  /** Skip the automatic fetch-on-mount. Default: false. */
  skip?: boolean;
}

export function useConversationPendingCalls(
  conversationId: string | null | undefined,
  options: UseConversationPendingCallsOptions = {},
): UseConversationPendingCallsResult {
  const { skip = false } = options;
  const dispatch = useAppDispatch();
  const [pendingCalls, setPendingCalls] = useState<PendingCallSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Guard against a late fetch resolving after the hook re-fired with a new id.
  const latestRequestRef = useRef<number>(0);

  const refresh = useCallback(async () => {
    if (!conversationId) return [];
    const tick = ++latestRequestRef.current;
    setIsLoading(true);
    try {
      const calls = await dispatch(
        fetchConversationPendingCalls(conversationId),
      );
      if (tick === latestRequestRef.current) {
        setPendingCalls(calls);
      }
      return calls;
    } finally {
      if (tick === latestRequestRef.current) {
        setIsLoading(false);
      }
    }
  }, [conversationId, dispatch]);

  useEffect(() => {
    if (skip) return;
    if (!conversationId) {
      setPendingCalls([]);
      return;
    }
    void refresh();
  }, [conversationId, refresh, skip]);

  return { pendingCalls, isLoading, refresh };
}

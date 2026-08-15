// features/agents/agent-sets/run/useSetMemberRunStatus.ts
//
// The live member-highlight data source. Given the active run conversation and
// the set's member agent ids, derives `{ byAgentId, isRunning }` for the canvas
// rings / grid dots.
//
// The wire events only carry the CHILD conversation id (the member's agent_id
// is deliberately opaque on the stream — matrx_ai agent projection). The
// documented contract is: read `initial_agent_id` from the child conversation
// row (owned by the same user, RLS-readable). Each child id is resolved ONCE
// per app lifetime via a module-level cache + in-flight dedupe — one tiny
// select per child, never polled.

import { useEffect, useMemo, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { supabase } from "@/utils/supabase/client";
import {
  selectConversationTurnRunning,
  selectSubAgentOpsForConversation,
  type SubAgentRunState,
} from "./set-run-status.selectors";

// ── child conversation → agent_id resolution (module-level, dedup'd) ─────

/** Resolved child conversation ids. Only successful lookups are cached, so a
 *  not-yet-committed child row (or a transient error) retries on the next
 *  status change instead of blinding the highlight forever. */
const agentIdByConversation = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function resolveConversationAgentId(
  conversationId: string,
): Promise<string | null> {
  const cached = agentIdByConversation.get(conversationId);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = inflight.get(conversationId);
  if (pending) return pending;

  // Promise.resolve: the supabase builder is a PromiseLike, not a Promise.
  const promise = Promise.resolve(
    supabase
      .schema("chat")
      .from("conversation")
      .select("initial_agent_id")
      .eq("id", conversationId)
      .maybeSingle(),
  ).then(({ data, error }) => {
    inflight.delete(conversationId);
    if (error) {
      console.warn(
        "[useSetMemberRunStatus] child conversation lookup failed",
        conversationId,
        error,
      );
      return null;
    }
    const agentId = data?.initial_agent_id ?? null;
    if (agentId) agentIdByConversation.set(conversationId, agentId);
    return agentId;
  });
  inflight.set(conversationId, promise);
  return promise;
}

// ── the hook ─────────────────────────────────────────────────────────────

export interface SetMemberRunStatus {
  /** Member agent_id → live state. Absent key = idle this turn. */
  byAgentId: Record<string, SubAgentRunState>;
  /** True while the run conversation's current turn is streaming. */
  isRunning: boolean;
}

const EMPTY_BY_AGENT_ID: Record<string, SubAgentRunState> = {};

/** running beats failed beats done when a member ran more than once in a turn. */
function mergeState(
  prev: SubAgentRunState | undefined,
  next: SubAgentRunState,
): SubAgentRunState {
  if (prev === "running" || next === "running") return "running";
  if (prev === "failed" || next === "failed") return "failed";
  return next;
}

export function useSetMemberRunStatus(
  conversationId: string | null,
  memberAgentIds: string[],
): SetMemberRunStatus {
  const opsSelector = useMemo(
    () => selectSubAgentOpsForConversation(conversationId),
    [conversationId],
  );
  const ops = useAppSelector(opsSelector);
  const isRunning = useAppSelector(selectConversationTurnRunning(conversationId));

  // Bumped when an async child→agent resolution lands, so byAgentId recomputes
  // against the module cache. Ops identity changes on every status transition,
  // so unresolved (row-not-yet-committed) children also retry then.
  const [resolutionEpoch, setResolutionEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const unresolved = ops
      .map((op) => op.childConversationId)
      .filter((id): id is string => !!id && !agentIdByConversation.has(id));
    if (unresolved.length === 0) return;
    for (const id of Array.from(new Set(unresolved))) {
      void resolveConversationAgentId(id).then((agentId) => {
        if (!cancelled && agentId) setResolutionEpoch((n) => n + 1);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [ops]);

  const byAgentId = useMemo(() => {
    if (ops.length === 0 || memberAgentIds.length === 0)
      return EMPTY_BY_AGENT_ID;
    const memberSet = new Set(memberAgentIds);
    const map: Record<string, SubAgentRunState> = {};
    for (const op of ops) {
      if (!op.childConversationId) continue;
      const agentId = agentIdByConversation.get(op.childConversationId);
      // Non-member children (other agent_call children, summarizers) filter
      // out naturally here.
      if (!agentId || !memberSet.has(agentId)) continue;
      map[agentId] = mergeState(map[agentId], op.status);
    }
    return Object.keys(map).length > 0 ? map : EMPTY_BY_AGENT_ID;
    // resolutionEpoch is a deliberate dep: it invalidates against the
    // module-level cache, which useMemo can't see change otherwise.
  }, [ops, memberAgentIds, resolutionEpoch]);

  return useMemo(() => ({ byAgentId, isRunning }), [byAgentId, isRunning]);
}

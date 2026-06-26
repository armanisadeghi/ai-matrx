"use client";

/**
 * useRoomAgent
 *
 * The War Room TIER-2 ROOM agent for ONE room (lives in the room shell on
 * `/war-room/[id]`): a durable per-room conversation plus its READ-ONLY
 * single-room context, kept fresh.
 *
 * Conversation durability, the agent roster, agent switching, and tool arming
 * are owned by the shared `useDurableAgentConversation` primitive (this hook used
 * to re-implement that recipe — it is now the master hook's twin only in the
 * thin context layer). This hook owns:
 *   • the per-room storage key (so each room keeps its own conversation);
 *   • the default ROOM persona (`WAR_ROOM_ROOM_AGENT_ID`) — which knows it can
 *     see/act on all of the user's data via the `data` tool;
 *   • the ROOM tool set (the master family MINUS `war_room_create_room` — a room
 *     agent reads/messages its own threads and renames its room, but does not
 *     spin up new rooms);
 *   • building + pushing `buildRoomAgentContext(sessionId)` on resolve and
 *     whenever this room's tile set changes, with the no-empty guard.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { WAR_ROOM_MASTER_TOOL_NAMES } from "@/features/agents/war-room-master-tools/tools/names";
import { selectPrimaryRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { WAR_ROOM_ROOM_AGENT_ID } from "@/features/war-room/constants";
import { selectThreadIdsForRoom } from "@/features/war-room/redux/selectors";
import { useDurableAgentConversation } from "@/features/war-room/hooks/useDurableAgentConversation";
import { reportWarRoomError } from "@/features/war-room/utils/reportWarRoomError";
import {
  buildRoomAgentContext,
  type ThreadStatusResolver,
} from "@/features/war-room/service/roomAgentContext";

/**
 * Tools the ROOM agent is armed with: the master family MINUS
 * `war_room_create_room`. Derived from the shared list so it can never drift
 * from the dispatcher's known names.
 */
const ROOM_AGENT_TOOL_NAMES = WAR_ROOM_MASTER_TOOL_NAMES.filter(
  (name) => name !== "war_room_create_room",
);

interface UseRoomAgentReturn {
  /** This room's agent conversation id — null until resolved. */
  conversationId: string | null;
  /** The active agent id (the room persona, or the user's chosen agent). */
  agentId: string | null;
  /** Switch the room agent to another agent. */
  switchAgent: (agentId: string) => void;
  /** Rebuild + push the single-room read-only context for the current state. */
  refreshContext: () => Promise<void>;
  /** True once the conversation is resolved and ready to chat in. */
  ready: boolean;
}

export function useRoomAgent(sessionId: string): UseRoomAgentReturn {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const { conversationId, agentId, ready, switchAgent } =
    useDurableAgentConversation({
      storageKey: sessionId ? `war-room:room-agent:${sessionId}` : null,
      defaultAgentId: WAR_ROOM_ROOM_AGENT_ID,
      toolNames: ROOM_AGENT_TOOL_NAMES,
    });

  // Re-push trigger: THIS room's tile set. The room shell hydrates the active
  // session's tiles into the warRoom slice, so the ordered tile-id list is the
  // signal — adding/removing/renaming a thread re-pushes the roster.
  const threadIds = useAppSelector(selectThreadIdsForRoom(sessionId));
  const threadSignature = threadIds.join("|");

  // ── Build + push the single-room read-only context ───────────────────────
  const refreshContext = useCallback(async () => {
    if (!conversationId) return;
    const resolveStatus: ThreadStatusResolver = (cid) =>
      selectPrimaryRequest(cid)(store.getState())?.status;
    let entries;
    try {
      entries = await buildRoomAgentContext(sessionId, resolveStatus);
    } catch (err) {
      reportWarRoomError("room-agent/context", err, { toast: false });
      return;
    }
    // NEVER clobber good context with an empty set — the single inline
    // `war_room` entry is always present on success, so this only skips when the
    // build itself failed.
    if (entries.length > 0) {
      dispatch(setContextEntries({ conversationId, entries }));
    }
  }, [conversationId, sessionId, dispatch, store]);

  // Push on resolve and whenever this room's tile set changes.
  useEffect(() => {
    if (!conversationId) return;
    void refreshContext();
    // tileSignature is the intended re-push trigger; refreshContext is stable.
  }, [conversationId, threadSignature, refreshContext]);

  return {
    conversationId,
    agentId,
    switchAgent,
    refreshContext,
    ready,
  };
}

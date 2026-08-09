"use client";

/**
 * useMasterAgent
 *
 * The War Room TIER-3 MASTER agent (`/war-room/all`): a durable, user-wide
 * conversation plus its READ-ONLY cross-room context, kept fresh.
 *
 * Conversation durability, the agent roster, agent switching, and tool arming
 * are owned by the shared `useDurableAgentConversation` primitive (keyed per
 * user — the master has no DB owner row to hang the id on). This hook owns:
 *   • the default MASTER persona, resolved from the `war_room.master` AGENT
 *     SLOT — which knows it can see/act on all of the user's data via the
 *     `data` tool. Only a NEW master conversation is minted with it: the
 *     roster is keyed by agent id, so a chat started under the previous
 *     default resumes under that agent untouched (constants.ts § the
 *     persisted-id doctrine);
 *   • the full MASTER tool set (read/message any thread, rename + create rooms);
 *   • building + pushing `buildMasterAgentContext()` on resolve and whenever the
 *     room set changes, with the no-empty guard.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { WAR_ROOM_MASTER_TOOL_NAMES } from "@/features/agents/war-room-master-tools/tools/names";
import { selectPrimaryRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { useAgentSlot } from "@/features/agents/slots/useAgentSlot";
import { WAR_ROOM_MASTER_AGENT_SLOT } from "@/features/war-room/constants";
import { selectSessionsList } from "@/features/war-room/redux/selectors";
import { useDurableAgentConversation } from "@/features/war-room/hooks/useDurableAgentConversation";
import { reportWarRoomError } from "@/features/war-room/utils/reportWarRoomError";
import {
  buildMasterAgentContext,
  type ThreadStatusResolver,
} from "@/features/war-room/service/masterAgentContext";

interface UseMasterAgentReturn {
  /** The master conversation id — null until resolved. */
  conversationId: string | null;
  /** The active agent id (the master persona, or the user's chosen agent). */
  agentId: string | null;
  /** Switch the master agent to another agent. */
  switchAgent: (agentId: string) => void;
  /** Rebuild + push the cross-room read-only context for the current state. */
  refreshContext: () => Promise<void>;
  /** True once the conversation is resolved and ready to chat in. */
  ready: boolean;
}

export function useMasterAgent(): UseMasterAgentReturn {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  // Subscribe to the user id so the resolve RE-RUNS if auth hydrates after first
  // mount (the panel mounts deep in the authed shell).
  const userId = useAppSelector(selectUserId);

  // The tier's default persona comes from the slot, never a hardcoded id.
  // Until it resolves the durable hook stays idle (it will not mint under a
  // guessed agent); a failure is LOUD and leaves the panel on its loading
  // state rather than silently starting the wrong agent.
  const { slot: masterSlot, error: masterSlotError } = useAgentSlot(
    WAR_ROOM_MASTER_AGENT_SLOT,
  );
  useEffect(() => {
    if (masterSlotError) {
      reportWarRoomError(
        "master-agent/slot",
        new Error(
          `War Room master agent slot "${WAR_ROOM_MASTER_AGENT_SLOT}" could not resolve: ${masterSlotError}`,
        ),
      );
    }
  }, [masterSlotError]);

  const { conversationId, agentId, ready, switchAgent } =
    useDurableAgentConversation({
      storageKey: userId ? `war-room:master-conversation:${userId}` : null,
      defaultAgentId: masterSlot?.agentId ?? null,
      toolNames: WAR_ROOM_MASTER_TOOL_NAMES,
    });

  // Re-push trigger: the room set on `/all`. The builder fetches its own
  // cross-room data fresh on each call, so a coarse "rooms changed" signal is
  // enough — adding/removing a room re-pushes the roster.
  const sessions = useAppSelector(selectSessionsList);
  const roomSignature = sessions.map((s) => `${s.id}:${s.title}`).join("|");

  // ── Build + push the cross-room read-only context ────────────────────────
  const refreshContext = useCallback(async () => {
    if (!conversationId) return;
    const resolveStatus: ThreadStatusResolver = (cid) =>
      selectPrimaryRequest(cid)(store.getState())?.status;
    let entries;
    try {
      entries = await buildMasterAgentContext(resolveStatus);
    } catch (err) {
      reportWarRoomError("master-agent/context", err, { toast: false });
      return;
    }
    // NEVER clobber good context with an empty set — the single inline
    // `war_room` entry is always present on success, so this only skips when the
    // build itself failed.
    if (entries.length > 0) {
      dispatch(setContextEntries({ conversationId, entries }));
    }
  }, [conversationId, dispatch, store]);

  // Push on resolve and whenever the room set changes.
  useEffect(() => {
    if (!conversationId) return;
    void refreshContext();
    // roomSignature is the intended re-push trigger; refreshContext is stable.
  }, [conversationId, roomSignature, refreshContext]);

  return {
    conversationId,
    agentId,
    switchAgent,
    refreshContext,
    ready,
  };
}

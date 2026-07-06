"use client";

/**
 * useRoomAgent
 *
 * The War Room TIER-2 ROOM agent for ONE room (lives in the room shell on
 * `/war-room/[id]`): the room's OVERSIGHT chat — a conversation whose context
 * is every thread in the room — plus its READ-ONLY single-room context, kept
 * fresh.
 *
 * Conversation truth is the room's `conversation → war_room` association
 * edges, exactly like the per-thread Chat tab (FEATURE.md invariant 11's
 * room-level twin):
 *   • ONE conversation is created at war-room provisioning
 *     (`provisionRoomDefaults`) — this hook NEVER mints; it only BINDS to the
 *     room's active conversation edge (instance + tolerant history rehydrate).
 *   • Switching / adding chats goes through `setRoomActiveConversation` /
 *     `startRoomConversation` (the RoomAgentPanel's canonical chat select).
 *   • Legacy rooms that kept their chat only in localStorage (the old
 *     useDurableAgentConversation roster) get a ONE-TIME migration: the stored
 *     conversation is attached as a durable edge, then the edge is the truth.
 *
 * This hook also owns the ROOM tool set (the master family MINUS
 * `war_room_create_room`), armed on the bound conversation, and pushes
 * `buildRoomAgentContext(sessionId)` on bind + whenever the room's thread set
 * changes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { setClientTools } from "@/features/agents/redux/execution-system/instance-client-tools/instance-client-tools.slice";
import { setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { WAR_ROOM_MASTER_TOOL_NAMES } from "@/features/agents/war-room-master-tools/tools/names";
import { selectPrimaryRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { WAR_ROOM_ROOM_AGENT_ID } from "@/features/war-room/constants";
import {
  selectActiveConversationIdForRoom,
  selectAssignmentsForContainer,
  selectContainerAssignmentsLoaded,
  selectThreadIdsForRoom,
} from "@/features/war-room/redux/selectors";
import {
  attachEntityToContainer,
  hydrateRoomAssignments,
} from "@/features/war-room/redux/thunks";
import { roomRef } from "@/features/war-room/types";
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
  /** The room's ACTIVE oversight conversation — null until bound. */
  conversationId: string | null;
  /** True once assignments hydrated (empty ⇒ show the explicit Start-chat state). */
  loaded: boolean;
  /** True once the conversation is bound and ready to chat in. */
  ready: boolean;
  /** Rebuild + push the single-room read-only context for the current state. */
  refreshContext: () => Promise<void>;
}

/** In-flight bind dedupe keyed `roomId::conversationId`. */
const inFlightBinds = new Set<string>();

/** Legacy localStorage roster key of the retired useDurableAgentConversation. */
function readLegacyRoomConversationId(roomId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const key = `war-room:room-agent:${roomId}`;
    const rosterRaw = window.localStorage.getItem(`${key}:roster`);
    if (rosterRaw) {
      const roster = JSON.parse(rosterRaw) as Record<string, string>;
      const active =
        window.localStorage.getItem(`${key}:active-agent`) ||
        WAR_ROOM_ROOM_AGENT_ID;
      return roster[active] ?? Object.values(roster)[0] ?? null;
    }
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useRoomAgent(sessionId: string): UseRoomAgentReturn {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [boundId, setBoundId] = useState<string | null>(null);

  const loaded = useAppSelector(
    selectContainerAssignmentsLoaded("room", sessionId),
  );
  const activeEdgeId = useAppSelector(
    selectActiveConversationIdForRoom(sessionId),
  );

  // ── Hydrate the room bucket (never creates) ───────────────────────────────
  useEffect(() => {
    if (sessionId) void dispatch(hydrateRoomAssignments(sessionId));
  }, [sessionId, dispatch]);

  // ── One-time legacy migration: localStorage chat → durable edge ──────────
  useEffect(() => {
    if (!sessionId || !loaded || activeEdgeId) return;
    const legacyId = readLegacyRoomConversationId(sessionId);
    if (!legacyId) return;
    void dispatch(
      attachEntityToContainer(roomRef(sessionId), "conversation", legacyId, {
        makeActive: true,
        metadata: { role: "agent", agentId: WAR_ROOM_ROOM_AGENT_ID },
      }),
    );
  }, [sessionId, loaded, activeEdgeId, dispatch]);

  // ── Bind to the active edge (instance + tolerant rehydrate) — NO minting ──
  useEffect(() => {
    if (!sessionId || !activeEdgeId || boundId === activeEdgeId) return;
    const bindKey = `${sessionId}::${activeEdgeId}`;
    if (inFlightBinds.has(bindKey)) return;
    inFlightBinds.add(bindKey);
    let cancelled = false;
    void (async () => {
      try {
        const inMemory =
          !!store.getState().conversations.byConversationId[activeEdgeId];
        if (!inMemory) {
          const row = selectAssignmentsForContainer(
            "room",
            sessionId,
          )(store.getState()).find(
            (a) =>
              a.entity_type === "conversation" && a.entity_id === activeEdgeId,
          );
          const agentId =
            (row?.metadata as { agentId?: string } | null)?.agentId ??
            WAR_ROOM_ROOM_AGENT_ID;
          await dispatch(
            createManualInstance({
              agentId,
              conversationId: activeEdgeId,
              apiEndpointMode: "agent",
              sourceFeature: "agent-runner",
              allowChat: true,
              autoRun: false,
              displayMode: "chat-assistant",
            }),
          ).unwrap();
          // Rehydrate prior turns; a not-yet-materialized conversation
          // resolves benignly (nothing to hydrate).
          try {
            await dispatch(
              loadConversation({ conversationId: activeEdgeId }),
            ).unwrap();
          } catch (err) {
            reportWarRoomError("room-agent/load", err, { toast: false });
          }
        }
        if (!cancelled) setBoundId(activeEdgeId);
      } catch (err) {
        reportWarRoomError("room-agent/bind", err, { toast: false });
      } finally {
        inFlightBinds.delete(bindKey);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, activeEdgeId, boundId, dispatch, store]);

  // ── Arm the room tool set on the bound conversation ──────────────────────
  useEffect(() => {
    if (!boundId) return undefined;
    dispatch(setClientTools({ conversationId: boundId, tools: [...ROOM_AGENT_TOOL_NAMES] }));
    return () => {
      dispatch(setClientTools({ conversationId: boundId, tools: [] }));
    };
  }, [boundId, dispatch]);

  // Re-push trigger: THIS room's thread set. Adding/removing/renaming a
  // thread re-pushes the roster.
  const threadIds = useAppSelector(selectThreadIdsForRoom(sessionId));
  const threadSignature = threadIds.join("|");

  // ── Build + push the single-room read-only context ───────────────────────
  const refreshContext = useCallback(async () => {
    if (!boundId) return;
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
    // `war_room` entry is always present on success, so this only skips when
    // the build itself failed.
    if (entries.length > 0) {
      dispatch(setContextEntries({ conversationId: boundId, entries }));
    }
  }, [boundId, sessionId, dispatch, store]);

  // Push on bind and whenever this room's thread set changes.
  useEffect(() => {
    if (!boundId) return;
    void refreshContext();
  }, [boundId, threadSignature, refreshContext]);

  return {
    conversationId: boundId,
    loaded,
    ready: Boolean(boundId),
    refreshContext,
  };
}

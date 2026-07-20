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
  selectPendingConversationForContainer,
  selectThreadIdsForRoom,
} from "@/features/war-room/redux/selectors";
import {
  attachEntityToContainer,
  hydrateRoomAssignments,
  materializeConversationEdge,
  pruneContainerPhantomConversations,
} from "@/features/war-room/redux/thunks";
import { useConversationMaterialized } from "@/features/agents/hooks/useConversationMaterialized";
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
  // A chat just started from the toolbar has no edge yet — it gets one only
  // once it materializes server-side. Bind it meanwhile so the user can
  // actually type into it; the edge write follows on its own.
  const pendingId = useAppSelector(
    selectPendingConversationForContainer("room", sessionId),
  );
  const targetId = activeEdgeId ?? pendingId;

  // ── Hydrate the room bucket (never creates) ───────────────────────────────
  useEffect(() => {
    if (sessionId) void dispatch(hydrateRoomAssignments(sessionId));
  }, [sessionId, dispatch]);

  // ── One-shot sweep of phantom edges (chats with no server row) ───────────
  useEffect(() => {
    if (!sessionId || !loaded) return;
    void dispatch(pruneContainerPhantomConversations(roomRef(sessionId)));
  }, [sessionId, loaded, dispatch]);

  // ── Promote the pending chat to a durable edge, once it's real ───────────
  // GATE: a client-minted conversation has no `chat.conversation` row until its
  // first turn commits. Edging it before then is what stranded phantom chats in
  // room chat lists forever. This fires within milliseconds of the first turn
  // being server-confirmed; a chat that's never used correctly leaves nothing.
  const pendingIsReal = useConversationMaterialized(pendingId);
  useEffect(() => {
    if (!sessionId || !pendingId || !pendingIsReal) return;
    void dispatch(
      materializeConversationEdge(roomRef(sessionId), pendingId, {
        makeActive: true,
        metadata: { role: "agent", agentId: WAR_ROOM_ROOM_AGENT_ID },
      }),
    );
  }, [sessionId, pendingId, pendingIsReal, dispatch]);

  // ── One-time legacy migration: localStorage chat → durable edge ──────────
  // Same gate: a legacy id can name a chat that was minted but never sent, and
  // migrating that into an edge would mint fresh phantom debris.
  // Read during render (not in an effect) because `useConversationMaterialized`
  // must gate on it — a legacy id can name a chat that was minted but never
  // sent, and migrating that into an edge would mint fresh phantom debris.
  // Deliberately NOT wrapped in useState/useMemo: state would go stale when
  // `sessionId` changes, and manual memoization is banned (React Compiler).
  // The cost is one `localStorage.getItem` per render of a hook that renders
  // rarely, and only while a room still has no chat.
  const legacyId =
    loaded && !activeEdgeId ? readLegacyRoomConversationId(sessionId) : null;
  const legacyIsReal = useConversationMaterialized(legacyId);
  useEffect(() => {
    if (!sessionId || !loaded || activeEdgeId || !legacyId || !legacyIsReal) {
      return;
    }
    void dispatch(
      attachEntityToContainer(roomRef(sessionId), "conversation", legacyId, {
        makeActive: true,
        metadata: { role: "agent", agentId: WAR_ROOM_ROOM_AGENT_ID },
      }),
    );
  }, [sessionId, loaded, activeEdgeId, legacyId, legacyIsReal, dispatch]);

  // ── Bind to the target chat (instance + tolerant rehydrate) — NO minting ──
  // `targetId` is the edge-backed chat, or the pending one when a chat was just
  // started and hasn't earned its edge yet. Binding a pending chat is what lets
  // the user send the first turn — which is precisely what makes it real.
  useEffect(() => {
    if (!sessionId || !targetId || boundId === targetId) return;
    const bindKey = `${sessionId}::${targetId}`;
    if (inFlightBinds.has(bindKey)) return;
    inFlightBinds.add(bindKey);
    let cancelled = false;
    void (async () => {
      try {
        const inMemory =
          !!store.getState().conversations.byConversationId[targetId];
        if (!inMemory) {
          const row = selectAssignmentsForContainer(
            "room",
            sessionId,
          )(store.getState()).find(
            (a) =>
              a.entity_type === "conversation" && a.entity_id === targetId,
          );
          const agentId =
            (row?.metadata as { agentId?: string } | null)?.agentId ??
            WAR_ROOM_ROOM_AGENT_ID;
          await dispatch(
            createManualInstance({
              agentId,
              conversationId: targetId,
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
              loadConversation({ conversationId: targetId }),
            ).unwrap();
          } catch (err) {
            reportWarRoomError("room-agent/load", err, { toast: false });
          }
        }
        if (!cancelled) setBoundId(targetId);
      } catch (err) {
        reportWarRoomError("room-agent/bind", err, { toast: false });
      } finally {
        inFlightBinds.delete(bindKey);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, targetId, boundId, dispatch, store]);

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

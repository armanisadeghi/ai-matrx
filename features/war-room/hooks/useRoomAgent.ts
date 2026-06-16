"use client";

/**
 * useRoomAgent
 *
 * Owns the ONE durable conversation a War Room's TIER-2 ROOM agent chats in
 * (lives in the room shell, on `/war-room/[id]`), and keeps its READ-ONLY
 * single-room context fresh. This is `useMasterAgent` keyed PER ROOM instead of
 * per user — the master narrowed to one session.
 *
 * Durability model (mirrors `useMasterAgent`, but keyed by sessionId so each
 * room gets its OWN persistent conversation — switching rooms switches agents):
 *   1. On mount, read the stored id for THIS room from localStorage
 *      (`war-room:room-agent:<sessionId>` — per room, not per user).
 *      • If present AND already an instance in Redux → reuse it (a remount in
 *        the same tab; skip the load).
 *      • If present but NOT in memory → recreate the instance keyed by that id
 *        (`createManualInstance({ conversationId })`) and `loadConversation` to
 *        rehydrate prior turns (it may 404 if no turn was ever sent — fine).
 *      • If absent → mint a fresh conversation and persist its id so the next
 *        visit to this room reuses it.
 *   2. Build + push the single-room context (`buildRoomAgentContext(sessionId)`)
 *      with the SAME no-empty guard `useStudioAssistant`/`useMasterAgent` use:
 *      never `setContextEntries` with []. (The builder always returns
 *      `room_agent_role`, so post-resolve it is never legitimately empty — the
 *      guard only fires if the build threw.)
 *   3. Re-push whenever THIS room's tile set changes (threads added/removed,
 *      renamed) — the room shell hydrates the active session's tiles into Redux,
 *      so a coarse "tiles changed" signal off the warRoom slice is the trigger.
 *
 * The user COMPOSES in this conversation (it's a real chat), so the panel
 * includes the canonical AgentConversationColumn. We reuse
 * `AUDIO_ASSISTANT_AGENT_ID` for v1 (same as the master); a dedicated room-agent
 * prompt is future polish — the room-scoped behavior comes from `room_agent_role`
 * + `war_room_threads` + the armed thread tools.
 *
 * ARMED TOOLS — the master tool family MINUS `war_room_create_room`: a room agent
 * reads/messages its own threads and can rename its own room, but should not
 * spin up new rooms (that's the master's job). The shared dispatcher
 * (`dispatchWarRoomMasterTool`) + threadResolver resolve a thread_id →
 * conversationId room-agnostically, so they work as-is; the ROSTER scoping (only
 * this room's threads, from `buildRoomAgentContext`) is what keeps the agent
 * acting within its room.
 *
 * Concurrent dispatches are de-duplicated by a module-level in-flight promise
 * keyed by sessionId so a double-mount can't create two conversations.
 */

import { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { setClientTools } from "@/features/agents/redux/execution-system/instance-client-tools/instance-client-tools.slice";
import { WAR_ROOM_MASTER_TOOL_NAMES } from "@/features/agents/war-room-master-tools/tools/names";
import { selectPrimaryRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { AUDIO_ASSISTANT_AGENT_ID } from "@/features/transcript-studio/constants";
import { selectTileIdsForSession } from "@/features/war-room/redux/selectors";
import {
  buildRoomAgentContext,
  type ThreadStatusResolver,
} from "@/features/war-room/service/roomAgentContext";

/**
 * Tools the ROOM agent is armed with: the master family MINUS
 * `war_room_create_room`. A room agent oversees ITS room — read/message its
 * threads, rename the room — but does not create new rooms. Derived from the
 * shared list so it can never drift from the dispatcher's known names.
 */
const ROOM_AGENT_TOOL_NAMES = WAR_ROOM_MASTER_TOOL_NAMES.filter(
  (name) => name !== "war_room_create_room",
);

interface UseRoomAgentReturn {
  /** This room's agent conversation id — null until resolved. */
  conversationId: string | null;
  /** Rebuild + push the single-room read-only context for the current state. */
  refreshContext: () => Promise<void>;
  /** True once the conversation is resolved and ready to chat in. */
  ready: boolean;
}

/** localStorage key for a room's durable agent conversation id. */
function storageKey(sessionId: string): string {
  return `war-room:room-agent:${sessionId}`;
}

function readStoredId(sessionId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey(sessionId));
  } catch {
    return null;
  }
}

function writeStoredId(sessionId: string, conversationId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(sessionId), conversationId);
  } catch {
    /* private-mode / quota — non-fatal; the conversation just won't survive refresh */
  }
}

/**
 * In-flight dedupe keyed by sessionId, so the panel mounting twice (e.g. React
 * strict-mode double effect, or a remount) resolves ONE conversation per room.
 */
const inFlight = new Map<string, Promise<string | null>>();

export function useRoomAgent(sessionId: string): UseRoomAgentReturn {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Re-push trigger: THIS room's tile set. The room shell hydrates the active
  // session's tiles into the warRoom slice, so the ordered tile-id list is the
  // signal — adding/removing/renaming a thread re-pushes the roster. (The
  // builder fetches its own per-thread data fresh on each call; a coarse "tiles
  // changed" signal is enough.)
  const tileIds = useAppSelector(selectTileIdsForSession(sessionId));
  const tileSignature = tileIds.join("|");

  // ── 1. Resolve the durable conversation once per room ────────────────────
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const existingFlight = inFlight.get(sessionId);
    const flight =
      existingFlight ??
      (async (): Promise<string | null> => {
        const storedId = readStoredId(sessionId);
        if (storedId) {
          const inMemory =
            !!store.getState().conversations.byConversationId[storedId];
          // Recreate the instance keyed by the stored id only if it isn't
          // already in memory (skip the load if present — same recipe as the
          // master hook / ChatRoomClient).
          if (!inMemory) {
            await dispatch(
              createManualInstance({
                agentId: AUDIO_ASSISTANT_AGENT_ID,
                conversationId: storedId,
                apiEndpointMode: "agent",
                sourceFeature: "agent-runner",
                allowChat: true,
                autoRun: false,
                displayMode: "chat-assistant",
              }),
            ).unwrap();
            // Rehydrate prior turns. May 404 / return empty if no turn was ever
            // sent — fine, the local instance still works.
            try {
              await dispatch(
                loadConversation({ conversationId: storedId }),
              ).unwrap();
            } catch (err) {
              console.warn(
                "[war-room/room-agent] loadConversation skipped:",
                err,
              );
            }
          }
          return storedId;
        }

        // No stored id — mint a fresh conversation, persist for next visit.
        const newId = await dispatch(
          createManualInstance({
            agentId: AUDIO_ASSISTANT_AGENT_ID,
            apiEndpointMode: "agent",
            sourceFeature: "agent-runner",
            allowChat: true,
            autoRun: false,
            displayMode: "chat-assistant",
          }),
        ).unwrap();
        writeStoredId(sessionId, newId);
        return newId;
      })();

    if (!existingFlight) inFlight.set(sessionId, flight);

    void flight
      .then((id) => {
        if (!cancelled && id) setConversationId(id);
      })
      .catch((err) => {
        console.error(
          "[war-room/room-agent] failed to resolve room conversation:",
          err,
        );
      })
      .finally(() => {
        if (inFlight.get(sessionId) === flight) inFlight.delete(sessionId);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, dispatch, store]);

  // ── 2/3. Build + push the single-room read-only context ──────────────────
  const refreshContext = useCallback(async () => {
    if (!conversationId) return;
    // Resolve live per-thread status from Redux at push time (the builder is a
    // pure service fn with no store access — we inject the resolver here).
    const resolveStatus: ThreadStatusResolver = (cid) =>
      selectPrimaryRequest(cid)(store.getState())?.status;
    let entries;
    try {
      entries = await buildRoomAgentContext(sessionId, resolveStatus);
    } catch (err) {
      console.error(
        "[war-room/room-agent] buildRoomAgentContext failed:",
        err,
      );
      return;
    }
    // NEVER clobber good context with an empty set — the same guard
    // `useStudioAssistant`/`useMasterAgent` use. `room_agent_role` is always
    // present on success, so this only skips when the build itself failed.
    if (entries.length > 0) {
      dispatch(setContextEntries({ conversationId, entries }));
    }
  }, [conversationId, sessionId, dispatch, store]);

  // Push on resolve and whenever this room's tile set changes.
  useEffect(() => {
    if (!conversationId) return;
    void refreshContext();
    // tileSignature is the intended re-push trigger; refreshContext is stable.
  }, [conversationId, tileSignature, refreshContext]);

  // ── Arm the ROOM messaging/management tools on this conversation ──────────
  // These inline tools (war_room_read_thread / _message_thread / _rename_room)
  // are NOT in the server registry; arming them here is what makes
  // build-tool-injection emit them as inline specs on the room agent's requests,
  // and routes their delegated calls to dispatchWarRoomMasterTool. Note this is
  // the master set MINUS war_room_create_room — a room agent doesn't create
  // rooms. Cleared on unmount / room switch so a remount re-arms a clean set.
  useEffect(() => {
    if (!conversationId) return;
    dispatch(
      setClientTools({
        conversationId,
        tools: [...ROOM_AGENT_TOOL_NAMES],
      }),
    );
    return () => {
      dispatch(setClientTools({ conversationId, tools: [] }));
    };
  }, [conversationId, dispatch]);

  return {
    conversationId,
    refreshContext,
    ready: Boolean(conversationId),
  };
}

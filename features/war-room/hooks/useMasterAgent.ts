"use client";

/**
 * useMasterAgent
 *
 * Owns the ONE durable conversation the War Room master agent (`/war-room/all`)
 * chats in, and keeps its READ-ONLY cross-room context fresh.
 *
 * Durability model (mirrors `ensureAssistantConversationThunk`, but the master
 * has NO DB owner row to hang the id on — it's a standalone, user-wide chat, so
 * the id lives in localStorage keyed by user):
 *   1. On mount, read the stored id for this user from localStorage.
 *      • If present AND already an instance in Redux → reuse it (a remount in
 *        the same tab; skip the load, the ChatRoomClient recipe).
 *      • If present but NOT in memory → recreate the instance keyed by that id
 *        (`createManualInstance({ conversationId })`) and `loadConversation` to
 *        rehydrate prior turns from the DB (it may 404 if no turn was ever sent
 *        — fine, the local instance still works).
 *      • If absent → mint a fresh conversation and persist its id to localStorage
 *        so the next refresh reuses it.
 *   2. Build + push the cross-room context (`buildMasterAgentContext`) with the
 *      SAME no-empty guard `useStudioAssistant` uses: never `setContextEntries`
 *      with []. (The builder always returns `master_role`, so post-resolve it is
 *      never legitimately empty — the guard only fires if the build threw.)
 *   3. Re-push whenever the room set changes (rooms added/removed on `/all`).
 *
 * The user COMPOSES in this conversation (it's a real chat), so the panel
 * includes the SmartAgentInput. We reuse `AUDIO_ASSISTANT_AGENT_ID` for v1; a
 * dedicated master agent/prompt is future polish (the orchestrator behavior
 * comes from `master_role` + `war_room_overview` + the thread tools later).
 *
 * Concurrent dispatches are de-duplicated by a module-level in-flight promise
 * keyed by userId so a double-mount can't create two conversations.
 */

import { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { getUserId } from "@/utils/auth/getUserId";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { selectPrimaryRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { AUDIO_ASSISTANT_AGENT_ID } from "@/features/transcript-studio/constants";
import { selectSessionsList } from "@/features/war-room/redux/selectors";
import {
  buildMasterAgentContext,
  type ThreadStatusResolver,
} from "@/features/war-room/service/masterAgentContext";

interface UseMasterAgentReturn {
  /** The master conversation id — null until resolved. */
  conversationId: string | null;
  /** Rebuild + push the cross-room read-only context for the current state. */
  refreshContext: () => Promise<void>;
  /** True once the conversation is resolved and ready to chat in. */
  ready: boolean;
}

/** localStorage key for the user's durable master conversation id. */
function storageKey(userId: string): string {
  return `war-room:master-conversation:${userId}`;
}

function readStoredId(userId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

function writeStoredId(userId: string, conversationId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), conversationId);
  } catch {
    /* private-mode / quota — non-fatal; the conversation just won't survive refresh */
  }
}

/**
 * In-flight dedupe keyed by userId, so the panel mounting twice (e.g. React
 * strict-mode double effect, or a remount) resolves ONE conversation.
 */
const inFlight = new Map<string, Promise<string | null>>();

export function useMasterAgent(): UseMasterAgentReturn {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Re-push trigger: the room set on `/all`. The builder fetches its own
  // cross-room data fresh on each call, so a coarse "rooms changed" signal is
  // enough — adding/removing a room re-pushes the roster. (Finer per-thread
  // changes live in the room view, not here; `refreshContext` covers those.)
  const sessions = useAppSelector(selectSessionsList);
  const roomSignature = sessions
    .map((s) => `${s.id}:${s.title}`)
    .join("|");

  // ── 1. Resolve the durable conversation once per user ────────────────────
  useEffect(() => {
    const userId = getUserId();
    if (!userId) return;
    let cancelled = false;

    const existingFlight = inFlight.get(userId);
    const flight =
      existingFlight ??
      (async (): Promise<string | null> => {
        const storedId = readStoredId(userId);
        if (storedId) {
          const inMemory = !!store.getState().conversations.byConversationId[
            storedId
          ];
          // Recreate the instance keyed by the stored id only if it isn't
          // already in memory (ChatRoomClient recipe — skip load if present).
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
                "[war-room/master] loadConversation skipped:",
                err,
              );
            }
          }
          return storedId;
        }

        // No stored id — mint a fresh conversation, persist for next load.
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
        writeStoredId(userId, newId);
        return newId;
      })();

    if (!existingFlight) inFlight.set(userId, flight);

    void flight
      .then((id) => {
        if (!cancelled && id) setConversationId(id);
      })
      .catch((err) => {
        console.error(
          "[war-room/master] failed to resolve master conversation:",
          err,
        );
      })
      .finally(() => {
        if (inFlight.get(userId) === flight) inFlight.delete(userId);
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, store]);

  // ── 2/3. Build + push the cross-room read-only context ───────────────────
  const refreshContext = useCallback(async () => {
    if (!conversationId) return;
    // Resolve live per-thread status from Redux at push time (the builder is a
    // pure service fn with no store access — we inject the resolver here).
    const resolveStatus: ThreadStatusResolver = (cid) =>
      selectPrimaryRequest(cid)(store.getState())?.status;
    let entries;
    try {
      entries = await buildMasterAgentContext(resolveStatus);
    } catch (err) {
      console.error("[war-room/master] buildMasterAgentContext failed:", err);
      return;
    }
    // NEVER clobber good context with an empty set — the same guard
    // `useStudioAssistant` uses. `master_role` is always present on success, so
    // this only skips when the build itself failed to produce anything.
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
    refreshContext,
    ready: Boolean(conversationId),
  };
}

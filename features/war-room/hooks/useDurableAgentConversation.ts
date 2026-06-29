"use client";

/**
 * useDurableAgentConversation
 *
 * The ONE durable-conversation primitive shared by the War Room TIER-2 (room)
 * and TIER-3 (master) agents — extracted from the two near-identical hooks that
 * each re-implemented this recipe (and a third copy in the Scribe assistant).
 *
 * Responsibilities:
 *   1. Resolve a durable conversation for the active agent, surviving refresh:
 *      • the active agent id is persisted (`<storageKey>:active-agent`);
 *      • a small per-scope ROSTER maps agentId → conversationId
 *        (`<storageKey>:roster`), so switching agents and switching BACK resumes
 *        the right conversation instead of losing it;
 *      • on mount we recreate the instance keyed by the stored id (if not already
 *        in Redux) and `loadConversation` to rehydrate prior turns (a 404 / empty
 *        load is fine — the local instance still works);
 *      • with nothing stored we mint a fresh conversation bound to `defaultAgentId`
 *        and persist it.
 *   2. **Legacy migration:** the previous hooks stored a BARE conversation id at
 *      `<storageKey>`. If that key holds an id and no roster exists yet, we seed
 *      the roster with `{ [defaultAgentId]: <legacyId> }` so existing Master/Room
 *      chats carry over untouched.
 *   3. Arm the tier's inline tool names on the active conversation (re-armed on
 *      switch, cleared on unmount) so `build-tool-injection` emits them.
 *   4. Expose `switchAgent(agentId)` — points the tier at another agent, resuming
 *      that agent's conversation from the roster or minting a fresh one. This is
 *      what makes the active agent VISIBLE and SWAPPABLE (no silent default).
 *
 * Context building stays in the tier hook (`useRoomAgent` / `useMasterAgent`) —
 * it differs per tier — and keys off the `conversationId` returned here.
 *
 * Concurrent resolves are de-duplicated by a module-level in-flight map keyed by
 * `<storageKey>::<agentId>` so a double-mount can't create two conversations.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { setClientTools } from "@/features/agents/redux/execution-system/instance-client-tools/instance-client-tools.slice";
import { reportWarRoomError } from "@/features/war-room/utils/reportWarRoomError";

export interface UseDurableAgentConversationConfig {
  /**
   * Stable storage-key root for this scope (e.g.
   * `war-room:room-agent:<sessionId>` or `war-room:master-conversation:<userId>`).
   * `null` until the scope is known (e.g. the user id has not hydrated) — the
   * hook stays idle until it is non-null.
   */
  storageKey: string | null;
  /** The tier persona this scope mints with by default. */
  defaultAgentId: string;
  /** Inline tool names to arm on the active conversation. */
  toolNames: readonly string[];
}

export interface UseDurableAgentConversationReturn {
  /** The active conversation id — null until resolved. */
  conversationId: string | null;
  /** The active agent id (the persona, or the user's chosen agent). */
  agentId: string | null;
  /** True once the conversation is resolved and ready to chat in. */
  ready: boolean;
  /** Switch the active agent — resumes that agent's chat or mints a fresh one. */
  switchAgent: (agentId: string) => void;
}

const ROSTER_SUFFIX = ":roster";
const ACTIVE_AGENT_SUFFIX = ":active-agent";

type Roster = Record<string, string>;

function lsGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private-mode / quota — non-fatal; the choice just won't survive refresh */
  }
}

function readRoster(storageKey: string, defaultAgentId: string): Roster {
  const raw = lsGet(storageKey + ROSTER_SUFFIX);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") return parsed as Roster;
    } catch {
      /* corrupt — fall through to legacy migration / empty */
    }
  }
  // Legacy: the old hooks stored a bare conversation id at `<storageKey>`.
  const legacy = lsGet(storageKey);
  if (legacy) return { [defaultAgentId]: legacy };
  return {};
}

function writeRoster(storageKey: string, roster: Roster): void {
  lsSet(storageKey + ROSTER_SUFFIX, JSON.stringify(roster));
}

/**
 * In-flight dedupe keyed by `<storageKey>::<agentId>` so two mounts (or a
 * mount racing a switch) resolve ONE conversation per (scope, agent).
 */
const inFlight = new Map<string, Promise<string | null>>();

export function useDurableAgentConversation(
  config: UseDurableAgentConversationConfig,
): UseDurableAgentConversationReturn {
  const { storageKey, defaultAgentId, toolNames } = config;
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);

  // The Room/Master panels live in closable WindowPanels, and `switchAgent`
  // awaits a network round-trip (createManualInstance + loadConversation). Guard
  // late resolves: commit only if still mounted AND this is the latest switch, so
  // closing mid-switch can't setState-after-unmount and a superseded switch can't
  // land the wrong conversation.
  const mountedRef = useRef(true);
  const switchTokenRef = useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Resolve the durable conversation for a given (scope, agent). Shared by the
  // mount effect and `switchAgent` so there is exactly one resolution path.
  const resolve = useCallback(
    (key: string, forAgentId: string): Promise<string | null> => {
      const flightKey = `${key}::${forAgentId}`;
      const existing = inFlight.get(flightKey);
      if (existing) return existing;

      const flight = (async (): Promise<string | null> => {
        const roster = readRoster(key, defaultAgentId);
        const storedId = roster[forAgentId];
        if (storedId) {
          const inMemory =
            !!store.getState().conversations.byConversationId[storedId];
          if (!inMemory) {
            await dispatch(
              createManualInstance({
                agentId: forAgentId,
                conversationId: storedId,
                apiEndpointMode: "agent",
                sourceFeature: "agent-runner",
                allowChat: true,
                autoRun: false,
                displayMode: "chat-assistant",
              }),
            ).unwrap();
            // Rehydrate prior turns. A 404 / empty load is fine — the
            // conversation was minted but no turn was ever sent.
            try {
              await dispatch(
                loadConversation({ conversationId: storedId }),
              ).unwrap();
            } catch (err) {
              reportWarRoomError("durable-agent/load", err, { toast: false });
            }
          }
          return storedId;
        }

        // No conversation for this agent yet — mint one and persist it.
        const newId = await dispatch(
          createManualInstance({
            agentId: forAgentId,
            apiEndpointMode: "agent",
            sourceFeature: "agent-runner",
            allowChat: true,
            autoRun: false,
            displayMode: "chat-assistant",
          }),
        ).unwrap();
        const next = { ...readRoster(key, defaultAgentId), [forAgentId]: newId };
        writeRoster(key, next);
        return newId;
      })();

      inFlight.set(flightKey, flight);
      void flight.finally(() => {
        if (inFlight.get(flightKey) === flight) inFlight.delete(flightKey);
      });
      return flight;
    },
    [dispatch, store, defaultAgentId],
  );

  // ── Resolve on mount / when the scope changes ────────────────────────────
  useEffect(() => {
    if (!storageKey) return;
    const token = ++switchTokenRef.current;
    const activeAgent = lsGet(storageKey + ACTIVE_AGENT_SUFFIX) || defaultAgentId;
    setAgentId(activeAgent);
    void resolve(storageKey, activeAgent)
      .then((id) => {
        // Commit only if still mounted and not superseded by a later
        // resolve/switch (e.g. the scope changed, or the user switched agents).
        if (id && mountedRef.current && token === switchTokenRef.current) {
          setConversationId(id);
        }
      })
      .catch((err) => {
        reportWarRoomError("durable-agent/resolve", err, { toast: false });
      });
  }, [storageKey, defaultAgentId, resolve]);

  // ── Switch the active agent ──────────────────────────────────────────────
  const switchAgent = useCallback(
    (nextAgentId: string) => {
      if (!storageKey || nextAgentId === agentId) return;
      const token = ++switchTokenRef.current;
      lsSet(storageKey + ACTIVE_AGENT_SUFFIX, nextAgentId);
      setAgentId(nextAgentId);
      // Clear the visible conversation while the next one resolves so the column
      // doesn't show the previous agent's chat under the new agent's name.
      setConversationId(null);
      void resolve(storageKey, nextAgentId)
        .then((id) => {
          // Only the latest, still-mounted switch commits.
          if (id && mountedRef.current && token === switchTokenRef.current) {
            setConversationId(id);
          }
        })
        .catch((err) => {
          reportWarRoomError("durable-agent/switch", err);
        });
    },
    [storageKey, agentId, resolve],
  );

  // ── Arm the tier's inline tools on the active conversation ───────────────
  const toolKey = toolNames.join("|");
  useEffect(() => {
    if (!conversationId) return undefined;
    dispatch(setClientTools({ conversationId, tools: [...toolNames] }));
    return () => {
      dispatch(setClientTools({ conversationId, tools: [] }));
    };
    // toolKey captures the armed set; conversationId is the binding target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, toolKey, dispatch]);

  return {
    conversationId,
    agentId,
    ready: Boolean(conversationId),
    switchAgent,
  };
}

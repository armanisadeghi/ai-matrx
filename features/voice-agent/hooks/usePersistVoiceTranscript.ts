// features/voice-agent/hooks/usePersistVoiceTranscript.ts
//
// Subscribes to the voice slice and flushes completed/interrupted turns to
// Supabase as they appear. Writes are idempotent — `persistedTurnIds` in the
// slice guards against double-writes (React strict mode, etc.).
//
// Lifecycle:
//   - On every render that produces new unpersisted turns: drain → write → mark.
//   - On unmount: best-effort `finalizeConversation` (rolls up message_count
//     + latency summary into `cx_conversation.metadata.voice`).

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  setConversationId,
  markTurnPersisted,
} from "../state/voiceAgentSlice";
import {
  selectVoiceConversationId,
  selectVoiceInstructions,
  selectVoiceLatencySummary,
  selectVoicePreset,
  selectVoiceTools,
  selectVoiceTotalInterruptions,
  selectVoiceTurns,
  selectVoiceUnpersistedTurns,
  selectVoiceVoiceId,
} from "../state/selectors";
import {
  ensureConversation,
  finalizeConversation,
  persistTurns,
} from "../persistence/voiceTranscriptWriter";

interface UsePersistVoiceTranscriptOpts {
  instanceId: string;
  /** If false, the hook is a no-op (used to opt out per-instance). */
  enabled?: boolean;
}

function newConversationId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function usePersistVoiceTranscript(
  opts: UsePersistVoiceTranscriptOpts,
): void {
  const { instanceId, enabled = true } = opts;
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const unpersistedTurns = useAppSelector((s) =>
    selectVoiceUnpersistedTurns(s, instanceId),
  );
  const conversationId = useAppSelector((s) =>
    selectVoiceConversationId(s, instanceId),
  );

  // Concurrency guards — at most one in-flight write per instance.
  const writeInFlightRef = useRef(false);
  const ensureInFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (unpersistedTurns.length === 0) return;
    if (writeInFlightRef.current) return;

    writeInFlightRef.current = true;

    void (async () => {
      try {
        // Ensure the cx_conversation row exists before any cx_message inserts.
        let convoId = conversationId;
        if (!convoId) {
          if (ensureInFlightRef.current) return;
          ensureInFlightRef.current = true;
          convoId = newConversationId();
          const s = store.getState();
          const voiceId = selectVoiceVoiceId(s, instanceId);
          const instructions = selectVoiceInstructions(s, instanceId);
          const tools = selectVoiceTools(s, instanceId);
          const preset = selectVoicePreset(s, instanceId);
          const ensured = await ensureConversation(convoId, {
            voiceId,
            instructions,
            tools: [...tools],
            preset,
          });
          ensureInFlightRef.current = false;
          // The project ships with `strictNullChecks: false`, which breaks
          // discriminated-union narrowing on the boolean tag `ensured.ok`
          // (TS treats `ok: true` and `ok: false` as both potentially
          // `undefined`, so neither `!ensured.ok` nor `if (ensured.ok) … else`
          // narrows the union). The `in` operator is a STRUCTURAL guard and
          // narrows correctly regardless of strict-null mode: `'error' in
          // ensured` selects the union member that has the `error` key.
          if ("error" in ensured) {
            console.error(
              "[usePersistVoiceTranscript] ensureConversation failed:",
              ensured.error,
            );
            return;
          }
          dispatch(setConversationId({ instanceId, conversationId: convoId }));
        }

        // Position = number of turns already persisted.
        const fullTurns = selectVoiceTurns(store.getState(), instanceId);
        const persistedSet = new Set(
          fullTurns
            .filter((t) => !unpersistedTurns.some((u) => u.id === t.id))
            .filter((t) => t.status !== "pending")
            .map((t) => t.id),
        );
        // Start position is the count of already-persisted turns.
        const startPosition = persistedSet.size;

        const result = await persistTurns({
          conversationId: convoId,
          turns: [...unpersistedTurns],
          startPosition,
        });
        if (result.ok) {
          for (const id of result.persistedTurnIds) {
            dispatch(markTurnPersisted({ instanceId, turnId: id }));
          }
        }
      } finally {
        writeInFlightRef.current = false;
      }
    })();
    // We deliberately depend on the *array reference* of unpersistedTurns —
    // the memoized selector returns the same array when nothing changed.
  }, [enabled, unpersistedTurns, conversationId, dispatch, instanceId, store]);

  // Finalize on unmount — non-blocking, best-effort.
  useEffect(() => {
    if (!enabled) return undefined;
    return () => {
      const s = store.getState();
      const convoId = selectVoiceConversationId(s, instanceId);
      if (!convoId) return;
      const turns = selectVoiceTurns(s, instanceId);
      const latency = selectVoiceLatencySummary(s, instanceId);
      const totalInterruptions = selectVoiceTotalInterruptions(s, instanceId);
      const voiceId = selectVoiceVoiceId(s, instanceId);
      const tools = selectVoiceTools(s, instanceId);
      const preset = selectVoicePreset(s, instanceId);

      void finalizeConversation({
        conversationId: convoId,
        totalTurns: turns.filter((t) => t.status !== "pending").length,
        totalInterruptions,
        latency,
        preset,
        voiceId,
        tools: [...tools],
      });
    };
  }, [enabled, store, instanceId]);
}

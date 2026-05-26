// features/voice-agent/state/selectors.ts
//
// Memoized selectors for the voice agent slice. Per-instance memoization uses
// the per-key cache pattern from `lib/redux/slices/voicePadSlice.ts:148-177`.

import { createSelector } from "@reduxjs/toolkit";
import type { VoiceAgentInstance, VoiceAgentState, VoiceTurn } from "../types";

type StateWithVoiceAgent = { voiceAgent: VoiceAgentState };

const EMPTY_INSTANCE: Readonly<VoiceAgentInstance> = Object.freeze({
  voiceId: "ara",
  instructions: "",
  tools: [],
  preset: "intro",
  persist: false,
  status: "idle",
  error: null,
  conversationId: null,
  persistedTurnIds: [],
  turns: [],
  totalInterruptions: 0,
  latencySamplesMs: [],
  sessionStartedAtMs: null,
}) as VoiceAgentInstance;

const EMPTY_TURNS: ReadonlyArray<VoiceTurn> = Object.freeze([]) as VoiceTurn[];

const getInstance = (
  state: StateWithVoiceAgent,
  instanceId: string,
): VoiceAgentInstance => state.voiceAgent.instances[instanceId] ?? EMPTY_INSTANCE;

export const selectVoiceInstanceExists = (
  state: StateWithVoiceAgent,
  instanceId: string,
): boolean => state.voiceAgent.instances[instanceId] !== undefined;

export const selectVoiceStatus = (
  state: StateWithVoiceAgent,
  instanceId: string,
) => getInstance(state, instanceId).status;

export const selectVoiceError = (
  state: StateWithVoiceAgent,
  instanceId: string,
) => getInstance(state, instanceId).error;

export const selectVoiceConversationId = (
  state: StateWithVoiceAgent,
  instanceId: string,
) => getInstance(state, instanceId).conversationId;

export const selectVoiceVoiceId = (
  state: StateWithVoiceAgent,
  instanceId: string,
) => getInstance(state, instanceId).voiceId;

export const selectVoiceInstructions = (
  state: StateWithVoiceAgent,
  instanceId: string,
) => getInstance(state, instanceId).instructions;

export const selectVoiceTools = (
  state: StateWithVoiceAgent,
  instanceId: string,
) => getInstance(state, instanceId).tools;

export const selectVoicePreset = (
  state: StateWithVoiceAgent,
  instanceId: string,
) => getInstance(state, instanceId).preset;

export const selectVoiceTurns = (
  state: StateWithVoiceAgent,
  instanceId: string,
): ReadonlyArray<VoiceTurn> => getInstance(state, instanceId).turns ?? EMPTY_TURNS;

export const selectVoiceTotalInterruptions = (
  state: StateWithVoiceAgent,
  instanceId: string,
) => getInstance(state, instanceId).totalInterruptions;

export const selectVoiceLatencySamples = (
  state: StateWithVoiceAgent,
  instanceId: string,
) => getInstance(state, instanceId).latencySamplesMs;

// ─── Memoized derived selectors (per-instance cache) ───────────────────────

type Selector<T> = (state: StateWithVoiceAgent) => T;

function perInstance<T>(
  factory: (instanceId: string) => Selector<T>,
): (state: StateWithVoiceAgent, instanceId: string) => T {
  const cache = new Map<string, Selector<T>>();
  return (state, instanceId) => {
    let sel = cache.get(instanceId);
    if (!sel) {
      sel = factory(instanceId);
      cache.set(instanceId, sel);
    }
    return sel(state);
  };
}

/** The most recent user turn, or undefined if none. Memoized per instance. */
export const selectVoiceLatestUserTurn = perInstance<VoiceTurn | undefined>(
  (instanceId) =>
    createSelector(
      [(s: StateWithVoiceAgent) => getInstance(s, instanceId).turns],
      (turns): VoiceTurn | undefined => {
        for (let i = turns.length - 1; i >= 0; i--) {
          if (turns[i].role === "user") return turns[i];
        }
        return undefined;
      },
    ),
);

/** The most recent assistant turn, or undefined if none. Memoized per instance. */
export const selectVoiceLatestAssistantTurn = perInstance<VoiceTurn | undefined>(
  (instanceId) =>
    createSelector(
      [(s: StateWithVoiceAgent) => getInstance(s, instanceId).turns],
      (turns): VoiceTurn | undefined => {
        for (let i = turns.length - 1; i >= 0; i--) {
          if (turns[i].role === "assistant") return turns[i];
        }
        return undefined;
      },
    ),
);

/** Completed turns whose ids are NOT yet in `persistedTurnIds`. Drives the writer. */
export const selectVoiceUnpersistedTurns = perInstance<ReadonlyArray<VoiceTurn>>(
  (instanceId) =>
    createSelector(
      [
        (s: StateWithVoiceAgent) => getInstance(s, instanceId).turns,
        (s: StateWithVoiceAgent) => getInstance(s, instanceId).persistedTurnIds,
      ],
      (turns, persistedIds): ReadonlyArray<VoiceTurn> => {
        if (turns.length === 0) return EMPTY_TURNS;
        const persistedSet = new Set(persistedIds);
        const unpersisted = turns.filter(
          (t) =>
            !persistedSet.has(t.id) &&
            (t.status === "completed" || t.status === "interrupted"),
        );
        return unpersisted.length === 0 ? EMPTY_TURNS : unpersisted;
      },
    ),
);

/** p50/p95 latency snapshot for the session metadata rollup. */
export interface LatencySummary {
  p50_ms: number | null;
  p95_ms: number | null;
  count: number;
}

export const selectVoiceLatencySummary = perInstance<LatencySummary>(
  (instanceId) =>
    createSelector(
      [(s: StateWithVoiceAgent) => getInstance(s, instanceId).latencySamplesMs],
      (samples): LatencySummary => {
        if (samples.length === 0) {
          return { p50_ms: null, p95_ms: null, count: 0 };
        }
        const sorted = [...samples].sort((a, b) => a - b);
        const p50 = sorted[Math.floor((sorted.length - 1) * 0.5)];
        const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)];
        return { p50_ms: p50, p95_ms: p95, count: samples.length };
      },
    ),
);

// features/voice-agent/state/voiceAgentSlice.ts
//
// Per-instance Redux state for the xAI voice agent. Keyed by `instanceId`
// (one per route preset — "intro" or "playground") so multiple voice surfaces
// can coexist without collision. Mirrors the multi-instance pattern from
// `lib/redux/slices/voicePadSlice.ts`.
//
// All actions are small and atomic per CLAUDE.md's Redux rules — no large
// object replacements. Selectors are exported from `./selectors.ts`.

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  VoiceAgentInstance,
  VoiceAgentPreset,
  VoiceAgentState,
  VoiceId,
  VoiceStatus,
  ToolName,
} from "../types";

const initialState: VoiceAgentState = {
  instances: {},
};

function getInstance(
  state: VoiceAgentState,
  instanceId: string,
): VoiceAgentInstance | undefined {
  return state.instances[instanceId];
}

interface InitInstancePayload {
  instanceId: string;
  voiceId: VoiceId;
  instructions: string;
  tools: ToolName[];
  preset: VoiceAgentPreset;
  persist: boolean;
}

interface InstanceIdPayload {
  instanceId: string;
}

interface AppendTurnPayload extends InstanceIdPayload {
  turnId: string;
  startedAtMs: number;
}

interface TranscriptDeltaPayload extends InstanceIdPayload {
  turnId: string;
  deltaText: string;
}

interface CompleteUserTurnPayload extends InstanceIdPayload {
  turnId: string;
  itemId?: string;
  endedAtMs: number;
}

interface CompleteAssistantTurnPayload extends InstanceIdPayload {
  turnId: string;
  itemId?: string;
  responseId?: string;
  endedAtMs: number;
  audioDurationMs?: number;
  speechTtfbMs?: number;
}

interface MarkInterruptedPayload extends InstanceIdPayload {
  turnId: string;
  endedAtMs: number;
  audioDurationMs?: number;
}

const voiceAgentSlice = createSlice({
  name: "voiceAgent",
  initialState,
  reducers: {
    initInstance(state, action: PayloadAction<InitInstancePayload>) {
      const {
        instanceId,
        voiceId,
        instructions,
        tools,
        preset,
        persist,
      } = action.payload;
      // Fresh state on every init — a re-entry into the route starts a new session.
      state.instances[instanceId] = {
        voiceId,
        instructions,
        tools,
        preset,
        persist,
        status: "idle",
        error: null,
        conversationId: null,
        persistedTurnIds: [],
        turns: [],
        totalInterruptions: 0,
        latencySamplesMs: [],
        sessionStartedAtMs: null,
      };
    },

    setStatus(
      state,
      action: PayloadAction<InstanceIdPayload & { status: VoiceStatus }>,
    ) {
      const inst = getInstance(state, action.payload.instanceId);
      if (!inst) return;
      inst.status = action.payload.status;
      // Errors are sticky — they don't auto-clear on status transitions. The
      // orchestrator's `start()` clears explicitly on a fresh attempt so the
      // user sees the previous failure until they actually retry.
    },

    setError(
      state,
      action: PayloadAction<
        InstanceIdPayload & { error: { code: string; message: string } | null }
      >,
    ) {
      const inst = getInstance(state, action.payload.instanceId);
      if (!inst) return;
      inst.error = action.payload.error;
      if (action.payload.error) inst.status = "error";
    },

    setSessionStartedAt(
      state,
      action: PayloadAction<InstanceIdPayload & { startedAtMs: number }>,
    ) {
      const inst = getInstance(state, action.payload.instanceId);
      if (!inst) return;
      inst.sessionStartedAtMs = action.payload.startedAtMs;
    },

    setConversationId(
      state,
      action: PayloadAction<InstanceIdPayload & { conversationId: string }>,
    ) {
      const inst = getInstance(state, action.payload.instanceId);
      if (!inst) return;
      inst.conversationId = action.payload.conversationId;
    },

    appendUserTurn(state, action: PayloadAction<AppendTurnPayload>) {
      const inst = getInstance(state, action.payload.instanceId);
      if (!inst) return;
      inst.turns.push({
        id: action.payload.turnId,
        role: "user",
        text: "",
        status: "pending",
        started_at_ms: action.payload.startedAtMs,
      });
    },

    updateUserTranscriptDelta(
      state,
      action: PayloadAction<TranscriptDeltaPayload>,
    ) {
      const inst = getInstance(state, action.payload.instanceId);
      if (!inst) return;
      const turn = inst.turns.find(
        (t) => t.id === action.payload.turnId && t.role === "user",
      );
      if (!turn) return;
      turn.text += action.payload.deltaText;
    },

    completeUserTurn(state, action: PayloadAction<CompleteUserTurnPayload>) {
      const inst = getInstance(state, action.payload.instanceId);
      if (!inst) return;
      const turn = inst.turns.find(
        (t) => t.id === action.payload.turnId && t.role === "user",
      );
      if (!turn) return;
      turn.status = "completed";
      turn.ended_at_ms = action.payload.endedAtMs;
      if (action.payload.itemId) turn.item_id = action.payload.itemId;
    },

    appendAssistantTurn(state, action: PayloadAction<AppendTurnPayload>) {
      const inst = getInstance(state, action.payload.instanceId);
      if (!inst) return;
      inst.turns.push({
        id: action.payload.turnId,
        role: "assistant",
        text: "",
        status: "pending",
        started_at_ms: action.payload.startedAtMs,
      });
    },

    updateAssistantTranscriptDelta(
      state,
      action: PayloadAction<TranscriptDeltaPayload>,
    ) {
      const inst = getInstance(state, action.payload.instanceId);
      if (!inst) return;
      const turn = inst.turns.find(
        (t) => t.id === action.payload.turnId && t.role === "assistant",
      );
      if (!turn) return;
      turn.text += action.payload.deltaText;
    },

    completeAssistantTurn(
      state,
      action: PayloadAction<CompleteAssistantTurnPayload>,
    ) {
      const inst = getInstance(state, action.payload.instanceId);
      if (!inst) return;
      const turn = inst.turns.find(
        (t) => t.id === action.payload.turnId && t.role === "assistant",
      );
      if (!turn) return;
      // Don't clobber 'interrupted' that arrived earlier from the speech_started path.
      if (turn.status !== "interrupted") turn.status = "completed";
      turn.ended_at_ms = action.payload.endedAtMs;
      if (action.payload.itemId) turn.item_id = action.payload.itemId;
      if (action.payload.responseId) turn.response_id = action.payload.responseId;
      if (action.payload.audioDurationMs !== undefined) {
        turn.audio_duration_ms = action.payload.audioDurationMs;
      }
      if (action.payload.speechTtfbMs !== undefined) {
        turn.speech_ttfb_ms = action.payload.speechTtfbMs;
      }
    },

    markTurnInterrupted(state, action: PayloadAction<MarkInterruptedPayload>) {
      const inst = getInstance(state, action.payload.instanceId);
      if (!inst) return;
      const turn = inst.turns.find((t) => t.id === action.payload.turnId);
      if (!turn) return;
      turn.status = "interrupted";
      turn.ended_at_ms = action.payload.endedAtMs;
      if (action.payload.audioDurationMs !== undefined) {
        turn.audio_duration_ms = action.payload.audioDurationMs;
      }
      inst.totalInterruptions += 1;
    },

    addLatencySample(
      state,
      action: PayloadAction<InstanceIdPayload & { ms: number }>,
    ) {
      const inst = getInstance(state, action.payload.instanceId);
      if (!inst) return;
      inst.latencySamplesMs.push(action.payload.ms);
    },

    markTurnPersisted(
      state,
      action: PayloadAction<InstanceIdPayload & { turnId: string }>,
    ) {
      const inst = getInstance(state, action.payload.instanceId);
      if (!inst) return;
      if (!inst.persistedTurnIds.includes(action.payload.turnId)) {
        inst.persistedTurnIds.push(action.payload.turnId);
      }
    },

    /** Updates config knobs for playground only. No-op for intro (which is locked). */
    updateConfig(
      state,
      action: PayloadAction<
        InstanceIdPayload & {
          voiceId?: VoiceId;
          instructions?: string;
          tools?: ToolName[];
        }
      >,
    ) {
      const inst = getInstance(state, action.payload.instanceId);
      if (!inst || inst.preset !== "playground") return;
      if (action.payload.voiceId) inst.voiceId = action.payload.voiceId;
      if (action.payload.instructions !== undefined) {
        inst.instructions = action.payload.instructions;
      }
      if (action.payload.tools) inst.tools = action.payload.tools;
    },

    disposeInstance(state, action: PayloadAction<InstanceIdPayload>) {
      delete state.instances[action.payload.instanceId];
    },
  },
});

export const {
  initInstance,
  setStatus,
  setError,
  setSessionStartedAt,
  setConversationId,
  appendUserTurn,
  updateUserTranscriptDelta,
  completeUserTurn,
  appendAssistantTurn,
  updateAssistantTranscriptDelta,
  completeAssistantTurn,
  markTurnInterrupted,
  addLatencySample,
  markTurnPersisted,
  updateConfig,
  disposeInstance,
} = voiceAgentSlice.actions;

export default voiceAgentSlice.reducer;

"use client";

// features/voice-agent/relay/useVoiceRelaySession.ts
//
// The Voice Communication Layer's composing hook: one realtime voice session
// (the Communicator — Mandate `voice.communicator`) speaking FOR one primary
// text agent (the brain — an ordinary execution-system conversation).
//
// Flow (THE ROUTING LAW; SoR: common-docs/systems/voice-communication-layer/
// FEATURE.md):
//   user speech  → transcript → setUserInputText + smartExecute on the
//                  primary conversation (the voice model never auto-answers)
//   brain busy   → one truthful narration cue after a short delay
//   brain done   → the answer text is cued into the realtime session and the
//                  Communicator speaks it, one question at a time, with the
//                  question ledger injected so nothing is lost.
//
// The surface gates on Mandate resolution BEFORE mounting this hook — an
// unresolvable mandate refuses; there is no fallback persona.

import { useEffect, useRef, useState } from "react";
import type { SourceFeature } from "@/types/python-generated/source-attribution";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { smartExecute } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import {
  selectIsExecuting,
  selectLatestAnswerText,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { useVoiceAgentInstance } from "../hooks/useVoiceAgentInstance";
import { useRealtimeAgentConfig } from "../hooks/useRealtimeAgentConfig";
import { useXaiVoiceSession, type VoiceSessionApi } from "../hooks/useXaiVoiceSession";
import { usePersistVoiceTranscript } from "../hooks/usePersistVoiceTranscript";
import { applyAgentConfig } from "../state/voiceAgentSlice";
import { selectVoiceTools } from "../state/selectors";
import {
  createVoiceRelayController,
  type VoiceRelayController,
} from "./relayController";
import {
  COMMUNICATION_LEDGER_TOOL,
  COMMUNICATION_LEDGER_TOOL_NAME,
  disposeLedger,
  getOrCreateLedger,
  registerCommunicationLedgerTool,
} from "./questionLedger";

/** The Communicator's Mandate — resolve it (and refuse loudly) in the surface. */
export const VOICE_COMMUNICATOR_MANDATE_KEY = "voice.communicator";

/** How long the brain may work silently before ONE narration cue is spoken. */
const NARRATION_DELAY_MS = 2500;

// Module-load side effect, idempotent: the ledger client tool is available to
// every relay session's tool loop.
registerCommunicationLedgerTool();

export interface UseVoiceRelaySessionOpts {
  /** Resolved Communicator agent id (from Mandate `voice.communicator`). */
  communicatorAgentId: string;
  /** The brain — the primary agent whose conversation this session voices. */
  primaryAgentId: string;
  /** Execution-system surface key for the primary conversation. */
  surfaceKey: string;
  sourceFeature: SourceFeature;
  /** DB surface for realtime tool resolution. Defaults to chat-voice. */
  surface?: string;
}

export interface VoiceRelaySessionApi extends VoiceSessionApi {
  /** Voice slice instance id (transcript view, debug panel). */
  instanceId: string;
  /** The primary agent's conversation id (render with <MarkdownStream/>). */
  primaryConversationId: string | null;
  /** True while the primary agent is thinking/streaming. */
  brainBusy: boolean;
  /** Route a text turn to the primary agent (kickoff, typed input). */
  sendToPrimary: (text: string) => void;
}

export function useVoiceRelaySession(
  opts: UseVoiceRelaySessionOpts,
): VoiceRelaySessionApi {
  const { communicatorAgentId, primaryAgentId, surfaceKey, sourceFeature, surface } =
    opts;
  const effectiveSurface = surface ?? "matrx-user/chat-voice";
  const dispatch = useAppDispatch();
  const store = useAppStore();

  // ── The mouth: the Communicator's realtime session ──────────────────────
  const instanceId = useVoiceAgentInstance({
    preset: "intro",
    agentId: communicatorAgentId,
  });
  useRealtimeAgentConfig({
    instanceId,
    agentId: communicatorAgentId,
    surface: effectiveSurface,
  });

  // ── The brain: an ordinary execution-system conversation ────────────────
  const { conversationId } = useAgentLauncher(primaryAgentId, {
    surfaceKey,
    sourceFeature,
    config: { responseDensity: "compact" },
    // A voice session outliving a remount must keep its brain conversation.
    retainOnUnmount: true,
  });
  const conversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    conversationIdRef.current = conversationId ?? null;
  }, [conversationId]);

  // ── The relay controller — created in an effect (never during render, per
  // the React Compiler ref rules); its callbacks read the conversation ref at
  // EVENT time. It exists before any human can tap the mic.
  const [controller, setController] = useState<VoiceRelayController | null>(null);
  useEffect(() => {
    const created = createVoiceRelayController({
      onUserUtterance: (transcript) => {
        const targetConversationId = conversationIdRef.current;
        if (!targetConversationId) {
          console.warn(
            "[voice-relay] utterance captured before the primary conversation " +
              "was ready — dropped (the brain has no address yet).",
          );
          return;
        }
        dispatch(setUserInputText({ conversationId: targetConversationId, text: transcript }));
        void dispatch(smartExecute({ conversationId: targetConversationId }));
      },
    });
    setController(created);
    return () => {
      created.dispose();
      disposeLedger(instanceId);
    };
  }, [dispatch, instanceId]);

  // ── Ledger tool: merge into the session's resolved tool set ─────────────
  // `useRealtimeAgentConfig` is the sole writer of server-resolved tools; the
  // ledger is a purely client-side capability of the relay, appended when
  // absent (the resolve hook overwrites on late arrival, so re-append then).
  const tools = useAppSelector((s) => selectVoiceTools(s, instanceId));
  useEffect(() => {
    if (tools.some((t) => t.name === COMMUNICATION_LEDGER_TOOL_NAME)) return;
    dispatch(
      applyAgentConfig({
        instanceId,
        tools: [...tools, COMMUNICATION_LEDGER_TOOL],
      }),
    );
  }, [dispatch, instanceId, tools]);

  // ── The realtime session, with the relay bound ──────────────────────────
  const session = useXaiVoiceSession({
    instanceId,
    agentId: communicatorAgentId,
    surface: effectiveSurface,
    relay: controller?.binding,
  });
  usePersistVoiceTranscript({ instanceId });

  // ── Brain watch: narrate the wait, deliver the answer ───────────────────
  const brainBusy = useAppSelector(
    conversationId ? selectIsExecuting(conversationId) : () => false,
  );
  const prevBusyRef = useRef(false);
  const narrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = brainBusy;
    if (!controller) return;

    if (brainBusy && !wasBusy) {
      // Rule 2b — one truthful narration cue if the brain takes a while.
      narrationTimerRef.current = setTimeout(() => {
        controller.speakNarration("Passing that along — one moment.");
      }, NARRATION_DELAY_MS);
      return;
    }

    if (!brainBusy && wasBusy && conversationId) {
      if (narrationTimerRef.current) {
        clearTimeout(narrationTimerRef.current);
        narrationTimerRef.current = null;
      }
      const answer = selectLatestAnswerText(conversationId)(store.getState());
      if (answer.trim().length > 0) {
        controller.speakDelivery(answer, {
          ledgerSummary: getOrCreateLedger(instanceId).serialize(),
        });
      }
    }
  }, [brainBusy, conversationId, controller, instanceId, store]);

  useEffect(() => {
    return () => {
      if (narrationTimerRef.current) clearTimeout(narrationTimerRef.current);
    };
  }, []);

  const sendToPrimary = (text: string): void => {
    const targetConversationId = conversationIdRef.current;
    if (!targetConversationId || !text.trim()) return;
    controller?.markAwaitingBrain();
    dispatch(setUserInputText({ conversationId: targetConversationId, text }));
    void dispatch(smartExecute({ conversationId: targetConversationId }));
  };

  return {
    ...session,
    instanceId,
    primaryConversationId: conversationId ?? null,
    brainBusy,
    sendToPrimary,
  };
}

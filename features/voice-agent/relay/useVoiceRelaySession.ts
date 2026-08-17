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
import { selectLatestAnswerText } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
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
import { composeBrainMessage } from "./sideChannel";
import type { QuestionPacing } from "./types";

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
  /**
   * Question pacing (ruling 3 — configuration, never dogma). The surface sets
   * this default; user-visible control layers on top. Named in every delivery
   * cue so the Communicator knows the active mode.
   */
  questionPacing?: QuestionPacing;
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
  const {
    communicatorAgentId,
    primaryAgentId,
    surfaceKey,
    sourceFeature,
    surface,
    questionPacing,
  } = opts;
  const effectiveSurface = surface ?? "matrx-user/chat-voice";
  const pacingRef = useRef<QuestionPacing>(questionPacing ?? "one_at_a_time");
  useEffect(() => {
    pacingRef.current = questionPacing ?? "one_at_a_time";
  }, [questionPacing]);
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
        // THE SIDE CHANNEL (ruling 6): the brain gets the user's verbatim
        // words, preceded by everything spoken in the voice layer since its
        // last turn (<voice_exchange> block) — so it always sees what the
        // Communicator asked/mirrored on its behalf.
        const message = composeBrainMessage(
          created.drainVoiceExchange(),
          transcript,
        );
        dispatch(setUserInputText({ conversationId: targetConversationId, text: message }));
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
  // Keyed on the conversation's full InstanceStatus, NOT the boolean
  // executing flag: "paused" (client-tool delegation) must not deliver a
  // partial answer, and "error"/"cancelled" must never be spoken as if the
  // brain finished successfully.
  const brainStatus = useAppSelector((s) =>
    conversationId
      ? (s.conversations?.byConversationId[conversationId]?.status ?? "ready")
      : "ready",
  );
  const brainBusy =
    brainStatus === "running" ||
    brainStatus === "streaming" ||
    brainStatus === "paused";
  const prevStatusRef = useRef<string>("ready");
  const narrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = brainStatus;
    if (!controller || brainStatus === prev) return;

    const clearNarrationTimer = () => {
      if (narrationTimerRef.current) {
        clearTimeout(narrationTimerRef.current);
        narrationTimerRef.current = null;
      }
    };
    // "paused" counts as active: a resumed turn may settle from it directly.
    const wasActive =
      prev === "running" || prev === "streaming" || prev === "paused";

    if ((brainStatus === "running" || brainStatus === "streaming") && !wasActive) {
      // Turn started — rule 2b: one truthful narration cue if it takes a while.
      clearNarrationTimer();
      narrationTimerRef.current = setTimeout(() => {
        controller.speakNarration("Passing that along — one moment.");
      }, NARRATION_DELAY_MS);
      return;
    }

    if (!wasActive) return;
    clearNarrationTimer();

    switch (brainStatus) {
      case "paused":
        // Client-tool delegation — the brain is mid-turn, NOT done. No
        // delivery; keep awaiting; one truthful line so the pause isn't dead air.
        controller.speakNarration(
          "The primary agent is finishing a step before answering.",
        );
        return;
      case "error":
      case "cancelled":
        // A failed/aborted turn is never spoken as an answer. Truthful status,
        // then disarm the watchdog (no delivery is coming for this turn).
        controller.speakNarration(
          brainStatus === "error"
            ? "The primary agent hit a problem with that message — the user can try again."
            : "That request was stopped — the user can continue whenever they like.",
        );
        controller.clearAwaitingBrain();
        return;
      case "complete": {
        if (!conversationId) return;
        const answer = selectLatestAnswerText(conversationId)(store.getState());
        if (answer.trim().length > 0) {
          controller.speakDelivery(answer, {
            ledgerSummary: getOrCreateLedger(instanceId).serialize(),
            pacing: pacingRef.current,
          });
        } else {
          // Settled with nothing to say — disarm rather than leave the
          // watchdog armed against a delivery that will never come.
          controller.clearAwaitingBrain();
        }
        return;
      }
      default:
        return;
    }
  }, [brainStatus, controller, conversationId, instanceId, store]);

  useEffect(() => {
    return () => {
      if (narrationTimerRef.current) clearTimeout(narrationTimerRef.current);
    };
  }, []);

  const sendToPrimary = (text: string): void => {
    const targetConversationId = conversationIdRef.current;
    if (!targetConversationId || !text.trim()) return;
    controller?.markAwaitingBrain();
    const message = controller
      ? composeBrainMessage(controller.drainVoiceExchange(), text)
      : text;
    dispatch(setUserInputText({ conversationId: targetConversationId, text: message }));
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

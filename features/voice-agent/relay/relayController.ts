// features/voice-agent/relay/relayController.ts
//
// The React-free heart of the Voice Communication Layer: routes user speech
// AWAY from the voice model (to a primary text agent) and cues the voice
// model to speak the primary agent's answers. Attach it to a session via
// `useXaiVoiceSession`'s `relay` option; drive it from `useVoiceRelaySession`.
//
// Invariants owned here (SoR: common-docs/systems/voice-communication-layer/
// FEATURE.md, THE ROUTING LAW):
//   1. A user transcript is forwarded to `onUserUtterance` — never answered
//      by the voice model. The session runs with
//      `turn_detection.create_response: false`.
//   2. The voice model speaks only on `speakDelivery` / `speakNarration`.
//   3. Watchdog: while awaiting the brain, any `response.created` this
//      controller did not request is cancelled and SCREAMS — a recovery
//      firing means the create_response gate silently broke.
//      Outside the awaiting window, unexpected responses are allowed: the
//      realtime tool loop legitimately continues a turn after a client tool
//      (the ledger) resolves.
//   4. Barge-in cancels speech, never work — the controller never aborts the
//      primary agent's run.
//   5. Sliding window: cue items beyond `windowItems` are pruned via
//      `conversation.item.delete` (client-minted ids), best-effort.

import {
  buildConversationItemDelete,
  buildConversationTextItem,
  buildResponseCreate,
} from "../transport/clientEvents";
import type { XaiServerEvent } from "../transport/serverEvents";
import { buildDeliveryCueText, buildNarrationCueText } from "./relayProtocol";
import {
  createVoiceExchangeLog,
  formatVoiceExchange,
  type VoiceExchangeTurn,
} from "./sideChannel";
import type { DeliveryCueOptions, RelaySessionHandle } from "./types";

/** How many injected cue items the realtime session keeps before pruning. */
export const RELAY_CONTEXT_WINDOW_ITEMS = 8;

export interface VoiceRelayControllerOptions {
  /** The user's completed utterance transcript → route to the primary agent. */
  onUserUtterance: (transcript: string) => void;
  /** Loud-recovery callback (in addition to the console scream). */
  onUnsolicitedResponse?: () => void;
  /**
   * Fires whenever the voice-exchange log changes, with the CURRENT
   * serialized `<voice_exchange>` block (empty string when the log is
   * empty). The hook publishes it into the brain conversation's deferred
   * context so every send — typed or spoken — carries it.
   */
  onExchangeUpdated?: (serializedBlock: string) => void;
  windowItems?: number;
  log?: (kind: "info" | "warn", code: string, detail: string) => void;
}

export interface VoiceRelayController {
  /** Wire into `useXaiVoiceSession({ relay })`. */
  binding: { attach(handle: RelaySessionHandle): () => void };
  /** Cue the Communicator to speak the primary agent's response. */
  speakDelivery(primaryAgentResponse: string, opts?: DeliveryCueOptions): void;
  /** Cue one short truthful progress line while the brain works. */
  speakNarration(narration: string): void;
  /** True between a captured user utterance and the next delivery cue. */
  isAwaitingBrain(): boolean;
  /** Mark that the brain started/kept working without a user utterance (e.g. kickoff turn). */
  markAwaitingBrain(): void;
  /** Disarm the watchdog when a turn settles with nothing to deliver. */
  clearAwaitingBrain(): void;
  /**
   * THE SIDE CHANNEL: everything spoken in the voice layer since the brain's
   * last turn (the Communicator's spoken transcripts + any user utterances the
   * caller routed back here). Drained by the hook when composing the next
   * brain message — see sideChannel.composeBrainMessage.
   */
  drainVoiceExchange(): VoiceExchangeTurn[];
  /** Record a user utterance that was HANDLED in the voice layer (side path). */
  recordSideChannelUserTurn(text: string): void;
  dispose(): void;
}

export function createVoiceRelayController(
  options: VoiceRelayControllerOptions,
): VoiceRelayController {
  const windowItems = options.windowItems ?? RELAY_CONTEXT_WINDOW_ITEMS;
  const log =
    options.log ??
    ((kind, code, detail) => {
      const line = `[voice-relay] ${code}: ${detail}`;
      if (kind === "warn") console.warn(line);
    });

  let handle: RelaySessionHandle | null = null;
  let detachEvents: (() => void) | null = null;
  let disposed = false;

  // THE SIDE CHANNEL — spoken turns since the brain's last message.
  const exchangeLog = createVoiceExchangeLog();
  function notifyExchangeChanged(): void {
    options.onExchangeUpdated?.(formatVoiceExchange(exchangeLog.peek()));
  }

  let awaitingBrain = false;
  /** Responses this controller requested and has not yet seen created. */
  let expectedResponses = 0;
  /** Client-minted cue item ids, oldest first, for window pruning. */
  const cueItemIds: string[] = [];
  let cueSeq = 1;

  function handleEvent(event: XaiServerEvent): void {
    if (disposed) return;
    switch (event.type) {
      case "conversation.item.input_audio_transcription.completed": {
        const transcript = event.transcript?.trim();
        if (!transcript) return;
        awaitingBrain = true;
        log("info", "utterance.captured", transcript.slice(0, 120));
        options.onUserUtterance(transcript);
        return;
      }
      // The Communicator's own spoken words — recorded so the brain sees
      // exactly what was said aloud on its behalf (ruling 6). Both wire
      // spellings of the transcript-done event are aliases.
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done": {
        if (event.transcript?.trim()) {
          exchangeLog.record("communicator", event.transcript);
          notifyExchangeChanged();
        }
        return;
      }
      case "response.created": {
        if (expectedResponses > 0) {
          expectedResponses -= 1;
          return;
        }
        if (awaitingBrain) {
          // The create_response gate failed — the voice model tried to answer
          // the user itself. Cancel and SCREAM: this is the exact failure the
          // layer exists to prevent, and a silent cancel would hide a broken
          // gate.
          log(
            "warn",
            "unsolicited-response.cancelled",
            "voice model started a response while awaiting the primary agent — " +
              "create_response gate breached; cancelling. Investigate session config.",
          );
          handle?.cancelResponse();
          options.onUnsolicitedResponse?.();
        }
        // Not awaiting → a legitimate continuation (tool-loop response.create
        // after a ledger call) — allow.
        return;
      }
      default:
        return;
    }
  }

  function sendCue(text: string, role: "user" | "assistant" = "user"): void {
    if (!handle) {
      log("warn", "cue.dropped", "no live session handle — cue not sent");
      return;
    }
    const itemId = `relay_cue_${cueSeq++}`;
    handle.sendRaw(buildConversationTextItem(itemId, role, text));
    cueItemIds.push(itemId);
    // Best-effort sliding window — the brain's conversation is the durable
    // record; these items are delivery context only.
    while (cueItemIds.length > windowItems) {
      const oldest = cueItemIds.shift();
      if (oldest) {
        try {
          handle.sendRaw(buildConversationItemDelete(oldest));
        } catch {
          // Pruning is best-effort; a provider that rejects deletes just
          // keeps a longer window.
        }
      }
    }
    expectedResponses += 1;
    handle.sendRaw(buildResponseCreate());
  }

  return {
    binding: {
      attach(sessionHandle: RelaySessionHandle): () => void {
        handle = sessionHandle;
        detachEvents = sessionHandle.onEvent(handleEvent);
        log("info", "attached", "relay attached to realtime session");
        return () => {
          detachEvents?.();
          detachEvents = null;
          handle = null;
          awaitingBrain = false;
          expectedResponses = 0;
          cueItemIds.length = 0;
          log("info", "detached", "relay detached from realtime session");
        };
      },
    },
    speakDelivery(primaryAgentResponse: string, opts?: DeliveryCueOptions): void {
      awaitingBrain = false;
      sendCue(buildDeliveryCueText(primaryAgentResponse, opts));
    },
    speakNarration(narration: string): void {
      // Narration does NOT clear awaitingBrain — the brain is still working.
      sendCue(buildNarrationCueText(narration));
    },
    isAwaitingBrain(): boolean {
      return awaitingBrain;
    },
    markAwaitingBrain(): void {
      awaitingBrain = true;
    },
    clearAwaitingBrain(): void {
      // A turn settled with nothing to deliver (failed / cancelled / empty
      // answer) — disarm the watchdog so it pairs strictly with a pending
      // delivery. The user's NEXT utterance re-arms it.
      awaitingBrain = false;
    },
    drainVoiceExchange(): VoiceExchangeTurn[] {
      const drained = exchangeLog.drain();
      if (drained.length > 0) notifyExchangeChanged();
      return drained;
    },
    recordSideChannelUserTurn(text: string): void {
      exchangeLog.record("user", text);
      notifyExchangeChanged();
    },
    dispose(): void {
      disposed = true;
      detachEvents?.();
      detachEvents = null;
      handle = null;
    },
  };
}

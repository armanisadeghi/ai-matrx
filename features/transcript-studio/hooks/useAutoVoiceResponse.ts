"use client";

// useAutoVoiceResponse — speak assistant responses aloud AS THEY STREAM IN.
//
// Built for the Agent+ tab (voice-in / voice-out). When a new assistant turn
// begins streaming, we open a Cartesia live-stream context and feed it the
// completed sentences as the response grows — so audio starts mid-response, not
// after it finishes. Buffering / sentence-boundary detection lives in the
// streaming speaker (`streamText`).
//
// Critical rules:
//   • Only turns that STREAM IN while enabled are auto-spoken. Pre-existing
//     history (and turns that land already-complete, e.g. on mount/reload) are
//     NEVER auto-played — they require a manual click. We baseline the current
//     latest assistant message as "handled" the moment we enable.
//   • One utterance per assistant message id, de-duped so re-renders or late
//     status echoes can't restart playback.

import { useEffect, useRef } from "react";
import { useAppStore, useAppSelector } from "@/lib/redux/hooks";
import {
  selectLatestAssistantMessageId,
  selectMessageClientStatus,
  selectMessageById,
  extractFlatText,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { useCartesiaStreamingSpeaker } from "@/features/tts/hooks/useCartesiaStreamingSpeaker";

interface UseAutoVoiceResponseOptions {
  conversationId: string | null | undefined;
  /** When false, the hook is dormant (no speaking). */
  enabled: boolean;
}

export function useAutoVoiceResponse({
  conversationId,
  enabled,
}: UseAutoVoiceResponseOptions) {
  const store = useAppStore();
  const speaker = useCartesiaStreamingSpeaker({ processMarkdown: true });

  // Messages already fully handled (spoken, or skipped because they predate us
  // / arrived complete). Keyed by message id.
  const handledIdRef = useRef<Set<string>>(new Set());
  // The id we are currently streaming speech for, if any.
  const activeIdRef = useRef<string | null>(null);
  // Per-conversation baseline guard — so we mark history handled exactly once.
  const baselinedConvRef = useRef<string | null>(null);

  const latestId = useAppSelector((s) =>
    conversationId
      ? selectLatestAssistantMessageId(conversationId)(s)
      : undefined,
  );
  const status = useAppSelector((s) =>
    conversationId && latestId
      ? selectMessageClientStatus(conversationId, latestId)(s)
      : undefined,
  );
  const text = useAppSelector((s) =>
    conversationId && latestId
      ? extractFlatText(selectMessageById(conversationId, latestId)(s))
      : "",
  );

  // Baseline: when enabled (re)engages for a conversation, treat whatever is
  // currently the latest assistant message as already-handled so we never
  // replay it. Reset when the conversation changes.
  useEffect(() => {
    if (!enabled || !conversationId) {
      baselinedConvRef.current = null;
      return;
    }
    if (baselinedConvRef.current === conversationId) return;
    baselinedConvRef.current = conversationId;
    handledIdRef.current = new Set();
    activeIdRef.current = null;
    const currentLatest = selectLatestAssistantMessageId(conversationId)(
      store.getState(),
    );
    if (currentLatest) handledIdRef.current.add(currentLatest);
  }, [enabled, conversationId, store]);

  useEffect(() => {
    if (!enabled || !conversationId || !latestId) return;
    // Wait until the baseline effect has claimed this conversation.
    if (baselinedConvRef.current !== conversationId) return;
    if (handledIdRef.current.has(latestId)) return;

    if (activeIdRef.current !== latestId) {
      // A new, not-yet-handled assistant message.
      if (status === "complete") {
        // Landed complete without us ever streaming it — do NOT auto-play.
        handledIdRef.current.add(latestId);
        return;
      }
      // It's streaming in — open a live context and feed what we have.
      activeIdRef.current = latestId;
      void speaker.beginStream();
      void speaker.streamText(text);
      return;
    }

    // Continuing the message we're already streaming.
    if (status === "complete") {
      void speaker.finishStream(text);
      handledIdRef.current.add(latestId);
      activeIdRef.current = null;
    } else {
      void speaker.streamText(text);
    }
  }, [enabled, conversationId, latestId, status, text, speaker]);

  // When auto-voice is switched off, cut any in-flight playback immediately.
  useEffect(() => {
    if (!enabled) {
      activeIdRef.current = null;
      void speaker.stop();
    }
  }, [enabled, speaker]);

  return speaker;
}

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
  selectPrimaryRequest,
  selectSpokenText,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { useCartesiaStreamingSpeaker } from "@/features/tts/hooks/useCartesiaStreamingSpeaker";
import { SCRIBE_DICTIONARY_SURFACE } from "@/features/dictionary/constants";
import {
  setVoicePlayback,
  clearVoicePlayback,
} from "../state/voicePlaybackBus";

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
  // Small first chunk = fastest first audio; the rest stream in larger pieces.
  const speaker = useCartesiaStreamingSpeaker({
    processMarkdown: true,
    firstChunkMax: 90,
    nextChunkMax: 300,
    dictionarySurfaceKey: SCRIBE_DICTIONARY_SURFACE,
  });

  // Requests already fully handled (spoken, or skipped because they predate us
  // / arrived complete). Keyed by request id.
  const handledIdRef = useRef<Set<string>>(new Set());
  // The request id we are currently streaming speech for, if any.
  const activeIdRef = useRef<string | null>(null);
  // Per-conversation baseline guard — so we mark history handled exactly once.
  const baselinedConvRef = useRef<string | null>(null);

  // Drive off the LIVE active request, not the committed message. The message
  // slice only receives the assistant turn at end-of-stream, so reading it here
  // delayed all audio until the response finished. The active request's render
  // blocks (`selectAccumulatedText`) grow token-by-token as the stream lands —
  // exactly what the conversation column renders — so feeding the speaker from
  // here makes audio start mid-response.
  const request = useAppSelector((s) =>
    conversationId ? selectPrimaryRequest(conversationId)(s) : undefined,
  );
  const requestId = request?.requestId;
  const status = request?.status;
  // Spoken text only — never the model's reasoning. selectSpokenText drops ALL
  // thinking blocks (not just the first), so later thinking is never read aloud.
  const text = useAppSelector((s) =>
    conversationId && requestId ? selectSpokenText(requestId)(s) : "",
  );

  // Baseline: when enabled (re)engages for a conversation, treat whatever is
  // currently the latest request as already-handled so we never replay it.
  // Reset when the conversation changes.
  useEffect(() => {
    if (!enabled || !conversationId) {
      baselinedConvRef.current = null;
      return;
    }
    if (baselinedConvRef.current === conversationId) return;
    baselinedConvRef.current = conversationId;
    handledIdRef.current = new Set();
    activeIdRef.current = null;
    const current = selectPrimaryRequest(conversationId)(store.getState());
    if (current?.requestId) handledIdRef.current.add(current.requestId);
  }, [enabled, conversationId, store]);

  useEffect(() => {
    if (!enabled || !conversationId || !requestId) return;
    // Wait until the baseline effect has claimed this conversation.
    if (baselinedConvRef.current !== conversationId) return;
    if (handledIdRef.current.has(requestId)) return;

    const isLive =
      status === "pending" ||
      status === "connecting" ||
      status === "streaming" ||
      status === "awaiting-tools";
    const isDone = status === "complete";
    const isFailed =
      status === "error" || status === "cancelled" || status === "timeout";

    if (activeIdRef.current !== requestId) {
      // A new, not-yet-handled request. Only auto-speak if it's genuinely
      // streaming in this session — anything already terminal we skip (a manual
      // click replays it). New requests baseline-guarded above never reach here.
      if (isFailed || isDone) {
        handledIdRef.current.add(requestId);
        return;
      }
      if (!isLive) return; // not started yet — wait for the first chunk
      activeIdRef.current = requestId;
      void speaker.beginStream();
      if (text) void speaker.streamText(text);
      return;
    }

    // Continuing the request we're already streaming.
    if (isDone) {
      void speaker.finishStream(text);
      handledIdRef.current.add(requestId);
      activeIdRef.current = null;
    } else if (isFailed) {
      void speaker.stop();
      handledIdRef.current.add(requestId);
      activeIdRef.current = null;
    } else if (text) {
      void speaker.streamText(text);
    }
  }, [enabled, conversationId, requestId, status, text, speaker]);

  // When auto-voice is switched off, cut any in-flight playback immediately.
  useEffect(() => {
    if (!enabled) {
      activeIdRef.current = null;
      void speaker.stop();
    }
  }, [enabled, speaker]);

  // Publish playback state to the header bus so a global stop control can show
  // up and halt audio from anywhere (the speaker instance lives here).
  useEffect(() => {
    setVoicePlayback({
      active: speaker.isPlaying || speaker.isLoading,
      playing: speaker.isPlaying,
      stop: () => void speaker.stop(),
    });
  }, [speaker.isPlaying, speaker.isLoading, speaker]);

  useEffect(() => clearVoicePlayback, []);

  return speaker;
}

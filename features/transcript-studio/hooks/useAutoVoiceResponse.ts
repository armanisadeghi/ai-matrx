"use client";

// useAutoVoiceResponse — speak assistant responses aloud as they complete.
//
// Built for the Agent+ tab, where there is no text input and the whole loop is
// voice-in / voice-out: the user records a turn, the agent answers, and the
// answer should stream back as speech automatically. We watch the latest
// assistant message in the conversation; when its client status flips to
// "complete", we read its text through the streaming Cartesia speaker (which
// chunks + plays progressively, so playback starts well before the full
// utterance is synthesized).
//
// Completion-granularity (not token-granularity): the streaming speaker takes a
// full string and handles progressive send/playback internally, so feeding it
// the finished message once is both correct and lowest-latency-to-coherent
// speech. Re-firing per token would restart playback on every delta.

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
  /** When false, the hook is dormant (no speaking, no subscriptions act). */
  enabled: boolean;
}

export function useAutoVoiceResponse({
  conversationId,
  enabled,
}: UseAutoVoiceResponseOptions) {
  const store = useAppStore();
  const speaker = useCartesiaStreamingSpeaker({ processMarkdown: true });

  // The message id we last spoke (or are speaking) — so a re-render or a late
  // status echo never double-fires the same turn.
  const spokenIdRef = useRef<string | null>(null);

  const latestAssistantId = useAppSelector((s) =>
    conversationId
      ? selectLatestAssistantMessageId(conversationId)(s)
      : undefined,
  );
  const latestStatus = useAppSelector((s) =>
    conversationId && latestAssistantId
      ? selectMessageClientStatus(conversationId, latestAssistantId)(s)
      : undefined,
  );

  useEffect(() => {
    if (!enabled || !conversationId || !latestAssistantId) return;
    if (latestStatus !== "complete") return;
    if (spokenIdRef.current === latestAssistantId) return;

    const record = selectMessageById(
      conversationId,
      latestAssistantId,
    )(store.getState());
    const text = extractFlatText(record).trim();
    if (!text) return;

    spokenIdRef.current = latestAssistantId;
    void speaker.speak(text);
  }, [
    enabled,
    conversationId,
    latestAssistantId,
    latestStatus,
    store,
    speaker,
  ]);

  // When auto-voice is turned off, cut any in-flight playback immediately.
  useEffect(() => {
    if (!enabled) void speaker.stop();
  }, [enabled, speaker]);

  return speaker;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useMicVAD, utils } from "@ricky0123/vad-react";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { acquireMicStream, releaseMicStream } from "@/features/audio/micStream";
import { beginRecordingSession } from "@/features/audio/session/audioSessionRegistry";
import type { PlaybackSessionHandle } from "@/features/audio/session/types";
import { getPlaybackSnapshot, skipPlayback, subscribePlayback } from "@/features/audio/playback/playbackQueue";
import { speak } from "@/features/audio/service/speak";
import { transcribe } from "@/features/audio/service/transcribe";

const AUTO_SLEEP_MS = 60_000;
export type VoiceChatPhase = "starting" | "listening" | "hearing" | "thinking" | "speaking" | "sleeping" | "paused" | "error";
export interface VoiceChatTurn { id: string; user: string; assistant: string }

export function useVoiceChat() {
  const { launchChat } = useAgentLauncher();
  const [phase, setPhase] = useState<VoiceChatPhase>("starting");
  const [turns, setTurns] = useState<VoiceChatTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingRef = useRef<PlaybackSessionHandle | null>(null);
  const playbackIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  const clearSleepTimer = () => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    sleepTimerRef.current = null;
  };
  const armSleepTimer = () => {
    clearSleepTimer();
    sleepTimerRef.current = setTimeout(() => {
      if (!busyRef.current) {
        setPhase("sleeping");
        void vad.pause();
      }
    }, AUTO_SLEEP_MS);
  };

  const processSpeech = async (audio: Float32Array) => {
    if (busyRef.current) return;
    busyRef.current = true;
    clearSleepTimer();
    recordingRef.current?.end();
    recordingRef.current = null;
    try {
      setPhase("thinking");
      const transcript = await transcribe({
        kind: "blob",
        blob: new Blob([utils.encodeWAV(audio)], { type: "audio/wav" }),
        fileName: "hands-free-turn.wav",
      });
      const userText = transcript.text.trim();
      if (!userText) { setPhase("listening"); return; }
      const result = await launchChat({
        surfaceKey: "hands-free-voice-chat",
        sourceFeature: "voice-agent",
        initiation: "auto",
        isEphemeral: true,
        config: { autoRun: true, displayMode: "direct", hideReasoning: true },
        runtime: { userInput: userText, surfaceName: "matrx-user/voice-chat" },
      });
      const assistantText = result.responseText?.trim() ?? "";
      setTurns((current) => [...current, { id: result.conversationId, user: userText, assistant: assistantText }]);
      if (assistantText) {
        const playback = speak({ text: assistantText, purpose: "assistant", label: "Voice chat reply" });
        playbackIdRef.current = playback.id;
        setPhase("speaking");
      } else setPhase("listening");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Voice chat failed");
      setPhase("error");
    } finally {
      busyRef.current = false;
      armSleepTimer();
    }
  };

  const vad = useMicVAD({
    model: "v5", startOnLoad: false,
    positiveSpeechThreshold: 0.6, negativeSpeechThreshold: 0.45,
    minSpeechMs: 400, redemptionMs: 800, preSpeechPadMs: 500,
    baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/",
    onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/",
    getStream: acquireMicStream,
    pauseStream: async () => releaseMicStream(),
    resumeStream: async () => acquireMicStream(),
    onSpeechStart: () => {
      setError(null); clearSleepTimer();
      if (playbackIdRef.current) void skipPlayback();
      recordingRef.current?.end();
      recordingRef.current = beginRecordingSession({ label: "Hands-free voice chat", controls: { stop: () => void vad.pause() } });
      setPhase("hearing");
    },
    onSpeechEnd: processSpeech,
    onVADMisfire: () => {
      recordingRef.current?.end(); recordingRef.current = null;
      setPhase("listening"); armSleepTimer();
    },
  });

  useEffect(() => subscribePlayback((snapshot) => {
    const id = playbackIdRef.current;
    if (!id) return;
    const item = snapshot.items.find((candidate) => candidate.id === id);
    if (item?.status === "done") { playbackIdRef.current = null; setPhase("listening"); armSleepTimer(); }
    else if (item?.status === "error") { playbackIdRef.current = null; setError(item.error ?? "Voice playback failed"); setPhase("error"); }
  }), []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) { clearSleepTimer(); void vad.pause(); setPhase("paused"); }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [vad]);

  useEffect(() => () => {
    clearSleepTimer(); recordingRef.current?.end();
    if (playbackIdRef.current) void skipPlayback();
  }, []);

  const start = async () => { setError(null); await vad.start(); setPhase("listening"); armSleepTimer(); };
  const sleep = async () => {
    clearSleepTimer();
    if (getPlaybackSnapshot().currentId === playbackIdRef.current) await skipPlayback();
    await vad.pause(); setPhase("sleeping");
  };
  return {
    phase: vad.errored ? "error" as const : phase,
    turns,
    error: vad.errored || error,
    userSpeaking: vad.userSpeaking,
    start,
    sleep,
    isListening: vad.listening,
  };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createAudioCapture } from "../audio/audioCapture";
import { createAudioPlayback } from "../audio/audioPlayback";
import { int16BufferToBase64 } from "../audio/pcmEncoding";
import { createGoogleRealtimeClient } from "../transport/googleRealtimeClient";
import type { VoiceStatus } from "../types";

export interface GoogleLiveTranscriptTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface GoogleLiveOptions {
  model?: string;
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
  turnCoverage?: "TURN_INCLUDES_ONLY_ACTIVITY" | "TURN_INCLUDES_ALL_INPUT";
  responseModalities?: Array<"TEXT" | "AUDIO">;
  vadConfig?: Record<string, unknown>;
  systemInstruction?: string;
}

const DEFAULT_MODEL = "gemini-3.1-flash-live-preview";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function visitRecords(
  value: unknown,
  visitor: (record: Record<string, unknown>) => void,
): void {
  if (Array.isArray(value)) {
    for (const child of value) visitRecords(child, visitor);
    return;
  }
  if (!isRecord(value)) return;
  visitor(value);
  for (const child of Object.values(value)) visitRecords(child, visitor);
}

function mergeTranscriptText(previous: string, incoming: string): string {
  if (!previous) return incoming;
  if (incoming.startsWith(previous)) return incoming;
  if (previous.endsWith(incoming)) return previous;
  return `${previous}${incoming}`;
}

export function useGoogleLiveSession(options: GoogleLiveOptions = {}) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [turns, setTurns] = useState<GoogleLiveTranscriptTurn[]>([]);
  const clientRef = useRef<ReturnType<
    typeof createGoogleRealtimeClient
  > | null>(null);
  const captureRef = useRef(createAudioCapture({ sampleRateHz: 16_000 }));
  const playbackRef = useRef(createAudioPlayback());
  const activeTurnIds = useRef<Record<"user" | "assistant", string | null>>({
    user: null,
    assistant: null,
  });

  const appendTranscript = useCallback(
    (role: "user" | "assistant", text: string) => {
      if (!text) return;
      let id = activeTurnIds.current[role];
      if (!id) {
        id = crypto.randomUUID();
        activeTurnIds.current[role] = id;
      }
      const turnId = id;
      setTurns((current) => {
        const existing = current.find((turn) => turn.id === turnId);
        if (!existing) return [...current, { id: turnId, role, text }];
        return current.map((turn) =>
          turn.id === turnId
            ? { ...turn, text: mergeTranscriptText(turn.text, text) }
            : turn,
        );
      });
    },
    [],
  );

  const consumeProviderEvent = useCallback(
    (wire: Record<string, unknown>) => {
      const providerEvent = wire.event;
      let sawAudio = false;
      let sawModelContent = false;
      let sawUserTranscription = false;
      let turnComplete = false;
      let interrupted = false;
      const transcriptionNodes = new WeakSet<object>();
      visitRecords(providerEvent, (record) => {
        const mimeType = record.mime_type ?? record.mimeType;
        if (
          typeof record.data === "string" &&
          typeof mimeType === "string" &&
          mimeType.startsWith("audio/")
        ) {
          playbackRef.current.enqueue(record.data);
          sawAudio = true;
          sawModelContent = true;
        }

        const input = record.input_transcription ?? record.inputTranscription;
        const output =
          record.output_transcription ?? record.outputTranscription;
        if (isRecord(input) && typeof input.text === "string") {
          transcriptionNodes.add(input);
          appendTranscript("user", input.text);
          sawUserTranscription = true;
        }
        if (isRecord(output) && typeof output.text === "string") {
          transcriptionNodes.add(output);
          appendTranscript("assistant", output.text);
          sawModelContent = true;
        }
        // TEXT-response model-turn parts are plain `{text: ...}` records and
        // do not necessarily emit an audio-transcription event.
        if (
          typeof record.text === "string" &&
          !transcriptionNodes.has(record)
        ) {
          appendTranscript("assistant", record.text);
          sawModelContent = true;
        }

        if (record.turn_complete === true || record.turnComplete === true) {
          turnComplete = true;
        }
        if (record.interrupted === true) interrupted = true;
      });

      if (interrupted) {
        playbackRef.current.interrupt();
        activeTurnIds.current.assistant = null;
        setStatus("listening");
      } else if (sawAudio) {
        setStatus("speaking");
      } else if (sawModelContent && !turnComplete) {
        setStatus((current) =>
          current === "listening" ? "thinking" : current,
        );
      } else if (sawUserTranscription && !turnComplete) {
        setStatus("thinking");
      }
      if (turnComplete) {
        playbackRef.current.markTurnEnded();
        activeTurnIds.current.user = null;
        activeTurnIds.current.assistant = null;
        setStatus("listening");
      }
    },
    [appendTranscript],
  );

  const stop = useCallback(async () => {
    clientRef.current?.close();
    clientRef.current = null;
    await captureRef.current.stop();
    await playbackRef.current.stop();
    activeTurnIds.current = { user: null, assistant: null };
    setMicMuted(false);
    setStatus("idle");
  }, []);

  const start = useCallback(() => {
    setError(null);
    setStatus("requesting-mic");
    captureRef.current.warmupSync();
    playbackRef.current.warmupSync();

    const client = createGoogleRealtimeClient("live", {
      model: options.model ?? DEFAULT_MODEL,
      options: {
        thinking_level: options.thinkingLevel ?? "minimal",
        turn_coverage: options.turnCoverage ?? "TURN_INCLUDES_ONLY_ACTIVITY",
        response_modalities: options.responseModalities ?? ["AUDIO"],
        vad_config: options.vadConfig ?? {},
        system_instruction: options.systemInstruction,
      },
    });
    clientRef.current = client;
    const offEvent = client.onEvent((event) => {
      if (event.type === "provider_event") consumeProviderEvent(event);
    });
    const offState = client.onState((next, detail) => {
      if (next === "ready") {
        captureRef.current.setLive((pcm) => {
          client.send({
            type: "audio",
            data: int16BufferToBase64(pcm),
            mime_type: "audio/pcm;rate=16000",
          });
        });
        setStatus("listening");
      } else if (next === "connecting" || next === "reconnecting") {
        setStatus("connecting");
      } else if (next === "error") {
        setError(detail ?? "Google Live session failed.");
        setStatus("error");
      }
    });

    void Promise.all([captureRef.current.start(), client.connect()]).catch(
      (reason: unknown) => {
        offEvent();
        offState();
        const message =
          reason instanceof Error ? reason.message : String(reason);
        void stop().then(() => {
          setError(message);
          setStatus("error");
        });
      },
    );
  }, [consumeProviderEvent, options, stop]);

  const toggle = useCallback(() => {
    if (status === "idle" || status === "error") start();
    else void stop();
  }, [start, status, stop]);

  const toggleMute = useCallback(() => {
    const next = !captureRef.current.isMuted();
    captureRef.current.setMuted(next);
    setMicMuted(next);
  }, []);

  useEffect(() => () => void stop(), [stop]);

  return { status, error, micMuted, turns, toggle, toggleMute };
}

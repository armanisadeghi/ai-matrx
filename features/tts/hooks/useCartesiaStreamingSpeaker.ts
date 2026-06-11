/**
 * useCartesiaStreamingSpeaker
 *
 * Drop-in streaming variant of useCartesiaSpeaker. Public API is identical:
 *
 *   const { speak, pause, resume, stop, phase, isLoading, isPlaying, isPaused }
 *     = useCartesiaStreamingSpeaker({ processMarkdown });
 *
 * Key differences from the non-streaming hook:
 *
 *   1. **Progressive send.** Input text is split into sentence-scale chunks.
 *      The first chunk is tiny (~160 chars) — time-to-first-audio is dominated
 *      by Cartesia's generation latency on the FIRST send, so we keep that send
 *      as small as possible. Subsequent chunks (up to ~400 chars each) stream
 *      into the SAME audio source via `ws.continue({ contextId, ... })`.
 *
 *   2. **Shared WebPlayer source.** The WebSocket response from the first send
 *      returns a single `source`. Every follow-up `ws.continue` pushes more
 *      audio chunks into that same source. The player begins playback as soon
 *      as the first byte arrives — we never await full generation.
 *
 *   3. **Abortable.** Each speak session gets an AbortController. stop() aborts
 *      any in-flight continue sends, closes the source, stops the player.
 *
 *   4. **initialLoading.** Option to start the `phase` at `"fetching-token"`
 *      instead of `"idle"`. Lets consumers that auto-start on mount render the
 *      "Connecting…" button on the very first frame, avoiding a flash of the
 *      idle play icon before the speak() effect fires.
 *
 * Bundle cost: this hook is expected to live inside a dynamically-imported
 * module (see StreamingSpeakerLive). The @cartesia/cartesia-js SDK is imported
 * statically here — it's pulled in with the code-split chunk the consumer
 * already has to lazy-load, so there's no second roundtrip.
 */

"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { CartesiaClient, WebPlayer } from "@cartesia/cartesia-js";
import { useAppSelector } from "@/lib/redux/hooks";
import { parseMarkdownToText } from "@/utils/markdown-processors/parse-markdown-for-speech";
import { toast } from "sonner";
import { chunkTextForSpeech } from "../utils/chunk-text-for-speech";
import {
  buildGenerationConfig,
  CARTESIA_API_VERSION,
  resolveVoiceId,
  TTS_MODEL_ID,
  TTS_STREAMING_BUFFER_SEC,
} from "@/lib/cartesia/config";

export type SpeakerPhase =
  | "idle"
  | "fetching-token"
  | "connecting"
  | "sending"
  | "playing"
  | "paused"
  | "error";

export interface UseCartesiaStreamingSpeakerOptions {
  processMarkdown?: boolean;
  /** Start the hook in a loading phase so the very first render shows the
   *  "Connecting…" button instead of the idle play icon. Use this when the
   *  consumer triggers speak() on mount. */
  initialLoading?: boolean;
  /** Override the small-first-chunk size (default 160 chars). */
  firstChunkMax?: number;
  /** Override the subsequent-chunk size (default 400 chars). */
  nextChunkMax?: number;
}

type CartesiaWs = ReturnType<CartesiaClient["tts"]["websocket"]>;

export function useCartesiaStreamingSpeaker({
  processMarkdown = true,
  initialLoading = false,
  firstChunkMax,
  nextChunkMax,
}: UseCartesiaStreamingSpeakerOptions = {}) {
  const [phase, setPhase] = useState<SpeakerPhase>(
    initialLoading ? "fetching-token" : "idle",
  );

  const websocketRef = useRef<CartesiaWs | null>(null);
  const playerRef = useRef<WebPlayer | null>(null);
  const hasPlayedRef = useRef(false);
  const mountedRef = useRef(true);
  /** AbortController for the current speak session. */
  const sessionRef = useRef<AbortController | null>(null);

  // ── Incremental streaming session ──────────────────────────────────────
  // For live TTS that is fed text as it arrives (token deltas), rather than the
  // one-shot `speak(fullText)`. We open ONE Cartesia context and push completed
  // sentence-scale chunks into it via ws.send (first) / ws.continue (rest) as
  // they become available, so audio starts before the response is finished.
  interface StreamSession {
    session: AbortController;
    contextId: string;
    baseRequest: {
      modelId: string;
      voice: { mode: "id"; id: string };
      language: string;
      contextId: string;
      generationConfig: ReturnType<typeof buildGenerationConfig>;
    };
    /** Chars of the RAW cumulative text already dispatched to TTS. */
    sentLen: number;
    /** Whether the first ws.send has happened (subsequent use ws.continue). */
    started: boolean;
    /** Whether player.play() has been kicked off for this session's source. */
    playStarted: boolean;
    /** Whether the context has been closed (continue:false sent). */
    finished: boolean;
  }
  const streamRef = useRef<StreamSession | null>(null);
  // Serializes begin → push* → finish so async sends never race or reorder.
  const opQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const enqueueOp = useCallback((fn: () => Promise<void>): Promise<unknown> => {
    opQueueRef.current = opQueueRef.current.then(fn, fn);
    return opQueueRef.current;
  }, []);

  // Primitive selectors — each returns a scalar so unrelated userPreferences
  // updates don't re-render the speaker.
  const voiceId = useAppSelector((s) =>
    resolveVoiceId(s.userPreferences.voice?.voice, "assistant"),
  );
  const language = useAppSelector(
    (s) => s.userPreferences.voice?.language || "en",
  );
  const speed = useAppSelector((s) => s.userPreferences.voice?.speed ?? 0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current?.abort();
      sessionRef.current = null;
      streamRef.current?.session.abort();
      streamRef.current = null;
      if (websocketRef.current) {
        try {
          websocketRef.current.disconnect();
        } catch {
          /* ignore */
        }
        websocketRef.current = null;
      }
      if (playerRef.current && hasPlayedRef.current) {
        playerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const setPhaseIfMounted = useCallback((p: SpeakerPhase) => {
    if (mountedRef.current) setPhase(p);
  }, []);

  /**
   * Fetches a token, opens the WebSocket, and ensures a WebPlayer exists.
   * Idempotent — subsequent calls are no-ops once the WS is open.
   */
  const ensureConnection = useCallback(async () => {
    if (websocketRef.current) return;

    setPhaseIfMounted("fetching-token");
    let tokenData: { token: string };
    try {
      const res = await fetch("/api/cartesia");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Token fetch failed: ${res.status}`);
      }
      tokenData = await res.json();
    } catch (err) {
      setPhaseIfMounted("error");
      throw err;
    }

    setPhaseIfMounted("connecting");
    try {
      const client = new CartesiaClient({
        cartesiaVersion: CARTESIA_API_VERSION as unknown as "2024-06-10",
      });
      const ws = client.tts.websocket({
        container: "raw",
        encoding: "pcm_f32le",
        sampleRate: 44100,
      });

      const ctx = await ws.connect({ accessToken: tokenData.token });
      ctx.on("close", () => {
        websocketRef.current = null;
        setPhaseIfMounted("idle");
      });

      websocketRef.current = ws;
    } catch (err) {
      setPhaseIfMounted("error");
      throw err;
    }

    if (!playerRef.current) {
      // Lower buffer for real-time streaming (latency-sensitive), centralized in
      // lib/cartesia/config so it can't drift back to a stutter-prone value.
      playerRef.current = new WebPlayer({
        bufferDuration: TTS_STREAMING_BUFFER_SEC,
      });
    }
  }, [setPhaseIfMounted]);

  /**
   * Speak the given text with progressive streaming. Any prior speak() session
   * is cancelled first so the latest click always wins.
   */
  const speak = useCallback(
    async (inputText: string) => {
      const processed = processMarkdown
        ? parseMarkdownToText(inputText)
        : inputText;
      if (!processed.trim()) {
        toast.error("Nothing to speak");
        return;
      }

      sessionRef.current?.abort();
      const session = new AbortController();
      sessionRef.current = session;

      try {
        await ensureConnection();
        if (session.signal.aborted) return;

        setPhaseIfMounted("sending");

        const chunks = chunkTextForSpeech(processed, {
          lang: language,
          firstChunkMax,
          nextChunkMax,
        });
        if (chunks.length === 0) {
          setPhaseIfMounted("idle");
          return;
        }

        const contextId = cryptoRandomId();
        const baseRequest = {
          modelId: TTS_MODEL_ID,
          voice: { mode: "id" as const, id: voiceId },
          language,
          contextId,
          generationConfig: buildGenerationConfig({ speed }),
        };

        const ws = websocketRef.current!;
        const player = playerRef.current!;

        const firstResp = await ws.send({
          ...baseRequest,
          transcript: chunks[0],
          continue: chunks.length > 1,
        });

        if (session.signal.aborted) return;

        hasPlayedRef.current = true;
        setPhaseIfMounted("playing");

        const playPromise = player
          .play(firstResp.source)
          .catch((err: unknown) => {
            if (!session.signal.aborted) {
              console.error("[useCartesiaStreamingSpeaker] play failed:", err);
            }
          });

        for (let i = 1; i < chunks.length; i++) {
          if (session.signal.aborted) return;
          await ws.continue({
            ...baseRequest,
            transcript: chunks[i],
            continue: i < chunks.length - 1,
          });
        }

        await playPromise;

        if (!session.signal.aborted) setPhaseIfMounted("idle");
      } catch (err) {
        if (session.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "Speech failed";
        console.error("[useCartesiaStreamingSpeaker]", msg);
        toast.error("Speech playback failed", { description: msg });
        setPhaseIfMounted("error");
      }
    },
    [
      processMarkdown,
      voiceId,
      language,
      speed,
      firstChunkMax,
      nextChunkMax,
      ensureConnection,
      setPhaseIfMounted,
    ],
  );

  // Low-level: push one already-cleaned chunk into the live stream context.
  const dispatchChunk = useCallback(
    async (chunk: string, isLast: boolean) => {
      const st = streamRef.current;
      if (!st || st.session.signal.aborted) return;
      const ws = websocketRef.current;
      const player = playerRef.current;
      if (!ws || !player) return;
      const req = { ...st.baseRequest, transcript: chunk, continue: !isLast };
      if (!st.started) {
        st.started = true;
        const resp = await ws.send(req);
        if (st.session.signal.aborted) return;
        if (!st.playStarted) {
          st.playStarted = true;
          hasPlayedRef.current = true;
          setPhaseIfMounted("playing");
          player.play(resp.source).catch((err: unknown) => {
            if (!st.session.signal.aborted) {
              console.error(
                "[useCartesiaStreamingSpeaker] stream play failed:",
                err,
              );
            }
          });
        }
      } else {
        await ws.continue(req);
      }
    },
    [setPhaseIfMounted],
  );

  /**
   * Open a fresh live-stream context. Cancels any prior speak/stream session.
   * Resolves once the WebSocket is connected and the session is ready to
   * receive `streamText` / `finishStream`.
   */
  const beginStream = useCallback(() => {
    return enqueueOp(async () => {
      sessionRef.current?.abort();
      streamRef.current?.session.abort();
      const session = new AbortController();
      sessionRef.current = session;
      await ensureConnection();
      if (session.signal.aborted) return;
      const contextId = cryptoRandomId();
      streamRef.current = {
        session,
        contextId,
        baseRequest: {
          modelId: TTS_MODEL_ID,
          voice: { mode: "id", id: voiceId },
          language,
          contextId,
          generationConfig: buildGenerationConfig({ speed }),
        },
        sentLen: 0,
        started: false,
        playStarted: false,
        finished: false,
      };
      setPhaseIfMounted("sending");
    });
  }, [
    enqueueOp,
    ensureConnection,
    voiceId,
    language,
    speed,
    setPhaseIfMounted,
  ]);

  /**
   * Feed the cumulative response text so far. Only the newly-completed
   * sentences (since the last call) are dispatched; an incomplete trailing
   * sentence is buffered until it completes or grows past a soft cap.
   */
  const streamText = useCallback(
    (fullText: string) => {
      return enqueueOp(async () => {
        const st = streamRef.current;
        if (!st || st.finished || st.session.signal.aborted) return;

        const unsent = fullText.slice(st.sentLen);
        let cut = lastSentenceBoundary(unsent);
        if (cut < 0) {
          // No complete sentence yet — flush at a space once the buffer is big
          // enough to keep latency bounded; otherwise wait for more text.
          if (unsent.length <= 400) return;
          const sp = unsent.lastIndexOf(" ", 400);
          cut = sp > 40 ? sp : 400;
        }
        const ready = unsent.slice(0, cut);
        st.sentLen += cut;

        const cleaned = processMarkdown ? parseMarkdownToText(ready) : ready;
        if (!cleaned.trim()) return;
        const chunks = chunkTextForSpeech(cleaned, {
          lang: language,
          firstChunkMax,
          nextChunkMax,
        });
        for (const c of chunks) {
          if (st.session.signal.aborted) return;
          await dispatchChunk(c, false);
        }
      });
    },
    [
      enqueueOp,
      processMarkdown,
      language,
      firstChunkMax,
      nextChunkMax,
      dispatchChunk,
    ],
  );

  /**
   * Flush any remaining buffered text as the final chunk and close the context.
   * Pass the final cumulative text. Idempotent.
   */
  const finishStream = useCallback(
    (fullText: string) => {
      return enqueueOp(async () => {
        const st = streamRef.current;
        if (!st || st.finished || st.session.signal.aborted) return;
        st.finished = true;

        const remaining = fullText.slice(st.sentLen);
        st.sentLen = fullText.length;
        const cleaned = processMarkdown
          ? parseMarkdownToText(remaining)
          : remaining;
        const chunks = cleaned.trim()
          ? chunkTextForSpeech(cleaned, {
              lang: language,
              firstChunkMax,
              nextChunkMax,
            })
          : [];

        if (chunks.length === 0) {
          // Nothing left to say — close the context if we ever opened it.
          if (st.started && !st.session.signal.aborted) {
            try {
              await websocketRef.current?.continue({
                ...st.baseRequest,
                transcript: "",
                continue: false,
              });
            } catch {
              /* ignore close error */
            }
          }
          return;
        }
        for (let i = 0; i < chunks.length; i++) {
          if (st.session.signal.aborted) return;
          await dispatchChunk(chunks[i], i === chunks.length - 1);
        }
      });
    },
    [
      enqueueOp,
      processMarkdown,
      language,
      firstChunkMax,
      nextChunkMax,
      dispatchChunk,
    ],
  );

  const pause = useCallback(async () => {
    if (playerRef.current && phase === "playing") {
      try {
        await playerRef.current.pause();
        setPhaseIfMounted("paused");
      } catch (err) {
        console.error("[useCartesiaStreamingSpeaker] pause failed:", err);
        setPhaseIfMounted("idle");
      }
    }
  }, [phase, setPhaseIfMounted]);

  const resume = useCallback(async () => {
    if (playerRef.current && phase === "paused") {
      try {
        await playerRef.current.resume();
        setPhaseIfMounted("playing");
      } catch (err) {
        console.error("[useCartesiaStreamingSpeaker] resume failed:", err);
        setPhaseIfMounted("idle");
      }
    }
  }, [phase, setPhaseIfMounted]);

  const stop = useCallback(async () => {
    sessionRef.current?.abort();
    sessionRef.current = null;
    streamRef.current?.session.abort();
    streamRef.current = null;
    if (playerRef.current && hasPlayedRef.current) {
      try {
        await playerRef.current.stop();
      } catch (err) {
        console.error("[useCartesiaStreamingSpeaker] stop failed:", err);
      }
    }
    setPhaseIfMounted("idle");
  }, [setPhaseIfMounted]);

  const isLoading =
    phase === "fetching-token" || phase === "connecting" || phase === "sending";
  const isPlaying = phase === "playing";
  const isPaused = phase === "paused";

  return {
    phase,
    isLoading,
    isPlaying,
    isPaused,
    speak,
    beginStream,
    streamText,
    finishStream,
    pause,
    resume,
    stop,
  };
}

/**
 * Index just past the last COMPLETED sentence in `text`, or -1 if none. A
 * sentence is "complete" only when its terminator is followed by whitespace
 * (so we don't cut "3.14" or an in-progress sentence mid-stream). Newlines also
 * count as a hard boundary.
 */
function lastSentenceBoundary(text: string): number {
  let last = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") {
      last = i + 1;
    } else if (
      (c === "." || c === "!" || c === "?" || c === "…") &&
      i + 1 < text.length &&
      /\s/.test(text[i + 1])
    ) {
      last = i + 1;
    }
  }
  return last;
}

function cryptoRandomId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `cx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

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

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { CartesiaClient, WebPlayer } from '@cartesia/cartesia-js';
import { useAppSelector } from '@/lib/redux/hooks';
import { parseMarkdownToText } from '@/utils/markdown-processors/parse-markdown-for-speech';
import { toast } from 'sonner';
import { chunkTextForSpeech } from '../utils/chunk-text-for-speech';
import {
  buildGenerationConfig,
  CARTESIA_API_VERSION,
  resolveVoiceId,
  TTS_MODEL_ID,
  TTS_STREAMING_BUFFER_SEC,
} from '@/lib/cartesia/config';

export type SpeakerPhase =
  | 'idle'
  | 'fetching-token'
  | 'connecting'
  | 'sending'
  | 'playing'
  | 'paused'
  | 'error';

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

type CartesiaWs = ReturnType<CartesiaClient['tts']['websocket']>;

export function useCartesiaStreamingSpeaker(
  {
    processMarkdown = true,
    initialLoading = false,
    firstChunkMax,
    nextChunkMax,
  }: UseCartesiaStreamingSpeakerOptions = {},
) {
  const [phase, setPhase] = useState<SpeakerPhase>(
    initialLoading ? 'fetching-token' : 'idle',
  );

  const websocketRef = useRef<CartesiaWs | null>(null);
  const playerRef = useRef<WebPlayer | null>(null);
  const hasPlayedRef = useRef(false);
  const mountedRef = useRef(true);
  /** AbortController for the current speak session. */
  const sessionRef = useRef<AbortController | null>(null);

  // Primitive selectors — each returns a scalar so unrelated userPreferences
  // updates don't re-render the speaker.
  const voiceId = useAppSelector((s) =>
    resolveVoiceId(s.userPreferences.voice?.voice, 'assistant'),
  );
  const language = useAppSelector(
    (s) => s.userPreferences.voice?.language || 'en',
  );
  const speed = useAppSelector((s) => s.userPreferences.voice?.speed ?? 0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current?.abort();
      sessionRef.current = null;
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

    setPhaseIfMounted('fetching-token');
    let tokenData: { token: string };
    try {
      const res = await fetch('/api/cartesia');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Token fetch failed: ${res.status}`);
      }
      tokenData = await res.json();
    } catch (err) {
      setPhaseIfMounted('error');
      throw err;
    }

    setPhaseIfMounted('connecting');
    try {
      const client = new CartesiaClient({
        cartesiaVersion: CARTESIA_API_VERSION as unknown as '2024-06-10',
      });
      const ws = client.tts.websocket({
        container: 'raw',
        encoding: 'pcm_f32le',
        sampleRate: 44100,
      });

      const ctx = await ws.connect({ accessToken: tokenData.token });
      ctx.on('close', () => {
        websocketRef.current = null;
        setPhaseIfMounted('idle');
      });

      websocketRef.current = ws;
    } catch (err) {
      setPhaseIfMounted('error');
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
        toast.error('Nothing to speak');
        return;
      }

      sessionRef.current?.abort();
      const session = new AbortController();
      sessionRef.current = session;

      try {
        await ensureConnection();
        if (session.signal.aborted) return;

        setPhaseIfMounted('sending');

        const chunks = chunkTextForSpeech(processed, {
          lang: language,
          firstChunkMax,
          nextChunkMax,
        });
        if (chunks.length === 0) {
          setPhaseIfMounted('idle');
          return;
        }

        const contextId = cryptoRandomId();
        const baseRequest = {
          modelId: TTS_MODEL_ID,
          voice: { mode: 'id' as const, id: voiceId },
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
        setPhaseIfMounted('playing');

        const playPromise = player.play(firstResp.source).catch((err: unknown) => {
          if (!session.signal.aborted) {
            console.error('[useCartesiaStreamingSpeaker] play failed:', err);
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

        if (!session.signal.aborted) setPhaseIfMounted('idle');
      } catch (err) {
        if (session.signal.aborted) return;
        const msg = err instanceof Error ? err.message : 'Speech failed';
        console.error('[useCartesiaStreamingSpeaker]', msg);
        toast.error('Speech playback failed', { description: msg });
        setPhaseIfMounted('error');
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

  const pause = useCallback(async () => {
    if (playerRef.current && phase === 'playing') {
      try {
        await playerRef.current.pause();
        setPhaseIfMounted('paused');
      } catch (err) {
        console.error('[useCartesiaStreamingSpeaker] pause failed:', err);
        setPhaseIfMounted('idle');
      }
    }
  }, [phase, setPhaseIfMounted]);

  const resume = useCallback(async () => {
    if (playerRef.current && phase === 'paused') {
      try {
        await playerRef.current.resume();
        setPhaseIfMounted('playing');
      } catch (err) {
        console.error('[useCartesiaStreamingSpeaker] resume failed:', err);
        setPhaseIfMounted('idle');
      }
    }
  }, [phase, setPhaseIfMounted]);

  const stop = useCallback(async () => {
    sessionRef.current?.abort();
    sessionRef.current = null;
    if (playerRef.current && hasPlayedRef.current) {
      try {
        await playerRef.current.stop();
      } catch (err) {
        console.error('[useCartesiaStreamingSpeaker] stop failed:', err);
      }
    }
    setPhaseIfMounted('idle');
  }, [setPhaseIfMounted]);

  const isLoading =
    phase === 'fetching-token' || phase === 'connecting' || phase === 'sending';
  const isPlaying = phase === 'playing';
  const isPaused = phase === 'paused';

  return {
    phase,
    isLoading,
    isPlaying,
    isPaused,
    speak,
    pause,
    resume,
    stop,
  };
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * useCartesiaSpeaker
 *
 * Lazy Cartesia TTS engine. Does absolutely nothing until speak() is called.
 * Manages: token fetch → websocket → send → WebPlayer playback lifecycle.
 *
 * Designed to be shared by any UI component that needs TTS controls.
 */

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { CartesiaClient, WebPlayer } from '@cartesia/cartesia-js';
import { useAppSelector } from '@/lib/redux/hooks';
import { selectVoicePreferences } from '@/lib/redux/preferences/userPreferenceSelectors';
import { parseMarkdownToText } from '@/utils/markdown-processors/parse-markdown-for-speech';
import {
  buildGenerationConfig,
  CARTESIA_API_VERSION,
  resolveVoiceId,
  TTS_MODEL_ID,
  TTS_PLAYBACK_BUFFER_SEC,
  type VoicePurpose,
} from '@/lib/cartesia/config';
import { toast } from 'sonner';

export type SpeakerPhase =
  | 'idle'
  | 'fetching-token'
  | 'connecting'
  | 'sending'
  | 'playing'
  | 'paused'
  | 'error';

export interface UseCartesiaSpeakerOptions {
  processMarkdown?: boolean;
  /** Which default voice applies when the user hasn't set one. */
  purpose?: VoicePurpose;
}

export function useCartesiaSpeaker({
  processMarkdown = true,
  purpose = 'assistant',
}: UseCartesiaSpeakerOptions = {}) {
  const [phase, setPhase] = useState<SpeakerPhase>('idle');

  const websocketRef = useRef<ReturnType<typeof CartesiaClient.prototype.tts.websocket> | null>(null);
  const playerRef = useRef<WebPlayer | null>(null);
  const hasPlayedRef = useRef(false);
  const mountedRef = useRef(true);

  const voicePrefs = useAppSelector(selectVoicePreferences);
  const voiceId = resolveVoiceId(voicePrefs.voice, purpose);
  const language = voicePrefs.language || 'en';
  const speed = voicePrefs.speed;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (websocketRef.current) {
        websocketRef.current.disconnect();
        websocketRef.current = null;
      }
      if (playerRef.current && hasPlayedRef.current) {
        playerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const ensureConnection = useCallback(async () => {
    if (websocketRef.current) return;

    if (mountedRef.current) setPhase('fetching-token');

    let data: { token: string };
    try {
      const res = await fetch('/api/cartesia');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Token fetch failed: ${res.status}`);
      }
      data = await res.json();
    } catch (err) {
      if (mountedRef.current) setPhase('error');
      throw err;
    }

    if (mountedRef.current) setPhase('connecting');

    try {
      const client = new CartesiaClient({
        cartesiaVersion: CARTESIA_API_VERSION as unknown as '2024-06-10',
      });
      const ws = client.tts.websocket({
        container: 'raw',
        encoding: 'pcm_f32le',
        sampleRate: 44100,
      });

      const ctx = await ws.connect({ accessToken: data.token });
      ctx.on('close', () => {
        websocketRef.current = null;
        if (mountedRef.current) setPhase('idle');
      });

      websocketRef.current = ws;
    } catch (err) {
      if (mountedRef.current) setPhase('error');
      throw err;
    }
  }, []);

  const speak = useCallback(async (inputText: string) => {
    const processed = processMarkdown ? parseMarkdownToText(inputText) : inputText;
    if (!processed.trim()) {
      toast.error('Nothing to speak');
      return;
    }

    try {
      await ensureConnection();

      if (mountedRef.current) setPhase('sending');

      const resp = await websocketRef.current!.send({
        modelId: TTS_MODEL_ID,
        voice: { mode: 'id' as const, id: voiceId },
        language,
        transcript: processed,
        generationConfig: buildGenerationConfig({ speed }),
      });

      if (!playerRef.current) {
        playerRef.current = new WebPlayer({
          bufferDuration: TTS_PLAYBACK_BUFFER_SEC,
        });
      }

      if (mountedRef.current) setPhase('playing');

      hasPlayedRef.current = true;
      await playerRef.current.play(resp.source);

      if (mountedRef.current) setPhase('idle');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Speech failed';
      console.error('[useCartesiaSpeaker]', msg);
      toast.error('Speech playback failed', { description: msg });
      if (mountedRef.current) setPhase('error');
    }
  }, [voiceId, language, speed, processMarkdown, ensureConnection]);

  const pause = useCallback(async () => {
    if (playerRef.current && phase === 'playing') {
      try {
        await playerRef.current.pause();
        if (mountedRef.current) setPhase('paused');
      } catch (err) {
        console.error('[useCartesiaSpeaker] pause failed:', err);
        if (mountedRef.current) setPhase('idle');
      }
    }
  }, [phase]);

  const resume = useCallback(async () => {
    if (playerRef.current && phase === 'paused') {
      try {
        await playerRef.current.resume();
        if (mountedRef.current) setPhase('playing');
      } catch (err) {
        console.error('[useCartesiaSpeaker] resume failed:', err);
        if (mountedRef.current) setPhase('idle');
      }
    }
  }, [phase]);

  const stop = useCallback(async () => {
    if (playerRef.current && hasPlayedRef.current) {
      try {
        await playerRef.current.stop();
      } catch (err) {
        console.error('[useCartesiaSpeaker] stop failed:', err);
      }
    }
    if (mountedRef.current) setPhase('idle');
  }, []);

  const isLoading = phase === 'fetching-token' || phase === 'connecting' || phase === 'sending';
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

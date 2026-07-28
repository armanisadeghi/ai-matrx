/**
 * useCartesiaSpeaker
 *
 * Lazy Cartesia TTS engine. Does absolutely nothing until speak() is called.
 * Manages: token fetch → websocket → send → SinkAwarePlayer playback lifecycle.
 *
 * Designed to be shared by any UI component that needs TTS controls.
 */

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { SinkAwarePlayer } from '@/features/audio/sinkAwarePlayer';
import { connectCartesiaTts } from '@/lib/cartesia/connection';
import { useAppSelector } from '@/lib/redux/hooks';
import { selectVoicePreferences } from '@/lib/redux/preferences/userPreferenceSelectors';
import { parseMarkdownToText } from '@/utils/markdown-processors/parse-markdown-for-speech';
import {
  buildGenerationConfig,
  resolveVoiceId,
  TTS_MODEL_ID,
  TTS_PLAYBACK_BUFFER_SEC,
  type VoicePurpose,
} from '@/lib/cartesia/config';
import { toast } from "@/lib/toast";
import { usePlaybackSessionController } from '@/features/audio/session/usePlaybackSessionController';

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
  /**
   * Custom Dictionary surface whose resolved pronunciations rewrite the spoken
   * text before synthesis. When omitted (the default), pronunciations follow the
   * ONE global active context (personal + global + active org/scopes). Pass a
   * specific surface key only to scope it to that surface's own selection.
   * See features/dictionary/activeContextBridge.ts.
   */
  dictionarySurfaceKey?: string;
}

export function useCartesiaSpeaker({
  processMarkdown = true,
  purpose = 'assistant',
  dictionarySurfaceKey,
}: UseCartesiaSpeakerOptions = {}) {
  const [phase, setPhase] = useState<SpeakerPhase>('idle');
  // Last spoken text — labels this utterance's row in the Audio panel.
  const [lastText, setLastText] = useState('');

  const websocketRef = useRef<Awaited<ReturnType<typeof connectCartesiaTts>>['ws'] | null>(null);
  const playerRef = useRef<SinkAwarePlayer | null>(null);
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

    if (mountedRef.current) setPhase('connecting');

    try {
      const { ws, ctx } = await connectCartesiaTts();
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
    setLastText(inputText);
    let pronunciations: Awaited<ReturnType<typeof import('@/features/dictionary/ttsBridge').resolveDictionaryTtsAliases>> = [];
    try {
      if (dictionarySurfaceKey) {
        const { resolveDictionaryTtsAliases } = await import('@/features/dictionary/ttsBridge');
        pronunciations = await resolveDictionaryTtsAliases(dictionarySurfaceKey);
      } else {
        const { resolveActiveContextTtsAliases } = await import('@/features/dictionary/activeContextBridge');
        pronunciations = await resolveActiveContextTtsAliases();
      }
    } catch {
      pronunciations = [];
    }
    const processed = processMarkdown
      ? parseMarkdownToText(inputText, pronunciations.length ? { pronunciations } : undefined)
      : inputText;
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
        playerRef.current = new SinkAwarePlayer({
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
  }, [voiceId, language, speed, processMarkdown, dictionarySurfaceKey, ensureConnection]);

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
    // Idempotent teardown: claim the player synchronously so a concurrent stop
    // is a no-op, and drop the ref so the next speak() builds a fresh player
    // rather than replaying a dead context. (SinkAwarePlayer.stop() itself
    // no-ops on an already-closed context, unlike the SDK WebPlayer it forked.)
    const player = playerRef.current;
    playerRef.current = null;
    hasPlayedRef.current = false;
    if (player) {
      try {
        await player.stop();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Benign double-teardown — the context is already gone. Anything else
        // is a real failure worth surfacing.
        if (!/closed AudioContext/i.test(msg)) {
          console.error('[useCartesiaSpeaker] stop failed:', err);
        }
      }
    }
    if (mountedRef.current) setPhase('idle');
  }, []);

  const isLoading = phase === 'fetching-token' || phase === 'connecting' || phase === 'sending';
  const isPlaying = phase === 'playing';
  const isPaused = phase === 'paused';

  // Join the single audio system: register a session + claim the playback lock
  // while busy, so every consumer of this hook (cx-chat, Scribe, …) is visible
  // in the Audio panel and can't overlap another voice. No consumer changes.
  usePlaybackSessionController({
    source: 'chat-tts',
    label: previewSpeechLabel(lastText),
    active: isLoading || isPlaying || isPaused,
    status: isPlaying ? 'active' : isPaused ? 'paused' : 'loading',
    errored: phase === 'error',
    controls: { pause, resume, stop },
  });

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

/** Short, human label for the Audio panel row. */
function previewSpeechLabel(text: string): string {
  const t = text.trim();
  if (!t) return 'Read-aloud';
  return t.length > 60 ? `${t.slice(0, 60)}…` : t;
}

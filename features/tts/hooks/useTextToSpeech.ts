/**
 * Text-to-Speech Hook
 * 
 * Handles text-to-speech generation via Groq API
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import { parseMarkdownToText } from '@/utils/markdown-processors/parse-markdown-for-speech';
import { useMediaElementPlaybackSession } from '@/features/audio/session/useMediaElementPlaybackSession';
import type { TTSOptions, EnglishVoice } from '../types';

export interface UseTextToSpeechProps {
  defaultVoice?: EnglishVoice;
  autoPlay?: boolean;
  processMarkdown?: boolean;
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onError?: (error: string) => void;
}

export function useTextToSpeech({
  defaultVoice = 'Cheyenne-PlayAI',
  autoPlay = false,
  processMarkdown = true,
  onPlaybackStart,
  onPlaybackEnd,
  onError,
}: UseTextToSpeechProps = {}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  // Last spoken text — labels this utterance's row in the Audio panel.
  const [lastText, setLastText] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentVoiceRef = useRef<EnglishVoice>(defaultVoice);

  // Join the single audio system: claim the playback lock + register a session
  // while the generated <audio> plays, so AudioPlayerButton (and any other
  // consumer) is visible in the Audio panel and can't overlap another voice.
  useMediaElementPlaybackSession({
    elementRef: audioRef,
    isPlaying,
    source: 'other',
    label: lastText.trim()
      ? lastText.trim().length > 60
        ? `${lastText.trim().slice(0, 60)}…`
        : lastText.trim()
      : 'Speech',
    trackKey: audioUrl ?? undefined,
  });

  // Cleanup audio resources
  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentTime(0);
  }, [audioUrl]);

  // Generate speech from text
  const generateSpeech = useCallback(async (
    text: string,
    options?: TTSOptions
  ): Promise<string | null> => {
    setLastText(text);
    setIsGenerating(true);
    setError(null);

    try {
      // Process text based on options
      const shouldProcess = options?.processMarkdown ?? processMarkdown;
      const processedText = shouldProcess ? parseMarkdownToText(text) : text;

      if (!processedText.trim()) {
        throw new Error('No text to convert to speech');
      }

      // Get voice
      const voice = options?.voice || currentVoiceRef.current;
      const model = options?.model || 'playai-tts';

      // Call TTS API
      const response = await fetch('/api/audio/text-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: processedText,
          voice,
          model,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Speech generation failed');
      }

      // Get audio blob
      const audioBlob = await response.blob();
      const url = URL.createObjectURL(audioBlob);

      // Cleanup old audio
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      setAudioUrl(url);
      return url;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      onError?.(errorMessage);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [processMarkdown, audioUrl, onError]);

  // Play generated speech
  const play = useCallback(async (url?: string) => {
    const audioSrc = url || audioUrl;
    if (!audioSrc) {
      const errorMsg = 'No audio available to play';
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    try {
      // Create or reuse audio element
      if (!audioRef.current) {
        audioRef.current = new Audio(audioSrc);
        
        // Setup event listeners
        audioRef.current.addEventListener('loadedmetadata', () => {
          setDuration(audioRef.current?.duration || 0);
        });

        audioRef.current.addEventListener('timeupdate', () => {
          setCurrentTime(audioRef.current?.currentTime || 0);
        });

        audioRef.current.addEventListener('play', () => {
          setIsPlaying(true);
          setIsPaused(false);
          onPlaybackStart?.();
        });

        audioRef.current.addEventListener('pause', () => {
          setIsPlaying(false);
          setIsPaused(true);
        });

        audioRef.current.addEventListener('ended', () => {
          setIsPlaying(false);
          setIsPaused(false);
          setCurrentTime(0);
          onPlaybackEnd?.();
        });

        audioRef.current.addEventListener('error', (e) => {
          const errorMsg = 'Audio playback failed';
          setError(errorMsg);
          onError?.(errorMsg);
          cleanup();
        });
      }

      await audioRef.current.play();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Playback failed';
      setError(errorMsg);
      onError?.(errorMsg);
    }
  }, [audioUrl, onPlaybackStart, onPlaybackEnd, onError, cleanup]);

  // Pause playback
  const pause = useCallback(() => {
    if (audioRef.current && isPlaying) {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  const resume = useCallback(async () => {
    if (audioRef.current && isPaused) {
      try {
        await audioRef.current.play();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Resume failed';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    }
  }, [isPaused, onError]);

  // Stop and cleanup
  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  // Speak - generate and optionally play
  const speak = useCallback(async (text: string, options?: TTSOptions) => {
    const url = await generateSpeech(text, options);
    if (url && autoPlay) {
      await play(url);
    }
    return url;
  }, [generateSpeech, autoPlay, play]);

  // Change voice
  const setVoice = useCallback((voice: EnglishVoice) => {
    currentVoiceRef.current = voice;
  }, []);

  return {
    // State
    isGenerating,
    isPlaying,
    isPaused,
    error,
    audioUrl,
    duration,
    currentTime,
    
    // Actions
    generateSpeech,
    speak,
    play,
    pause,
    resume,
    stop,
    setVoice,
    cleanup,
  };
}


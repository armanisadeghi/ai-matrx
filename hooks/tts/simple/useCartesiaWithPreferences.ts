"use client";
import type CartesiaWebsocket from "@cartesia/cartesia-js/wrapper/Websocket";
import { SinkAwarePlayer } from "@/features/audio/sinkAwarePlayer";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { parseMarkdownToText } from "@/utils/markdown-processors/parse-markdown-for-speech";
import { connectCartesiaTts } from "@/lib/cartesia/connection";
import {
  buildGenerationConfig,
  resolveVoiceId,
  TTS_MODEL_ID,
  TTS_PLAYBACK_BUFFER_SEC,
} from "@/lib/cartesia/config";

type ConnectionState = "connecting" | "ready" | "disconnected";
type PlayerState = "idle" | "playing" | "paused";

export interface UseCartesiaWithPreferencesOptions {
  autoPlay?: boolean;
  processMarkdown?: boolean;
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onError?: (error: string) => void;
}

export function useCartesiaWithPreferences({
  autoPlay = false,
  processMarkdown = true,
  onPlaybackStart,
  onPlaybackEnd,
  onError,
}: UseCartesiaWithPreferencesOptions = {}) {
  const websocketRef = useRef<CartesiaWebsocket | null>(null);
  const playerRef = useRef<SinkAwarePlayer | null>(null);
  // Track whether play() has been called — the player's AudioContext is lazy-initialized on first play
  const hasPlayedRef = useRef(false);
  // The hook connects on mount, so "connecting" is the true initial state.
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [playerState, setPlayerState] = useState<PlayerState>("idle");

  // Get voice preferences from Redux
  const voicePreferences = useAppSelector((state) => state.userPreferences.voice);
  const voiceId = resolveVoiceId(voicePreferences.voice, "assistant");
  const language = voicePreferences.language || "en";
  const speed = voicePreferences.speed;
  const modelId = TTS_MODEL_ID;

  const connect = useCallback(() => {
    connectCartesiaTts()
      .then(({ ws, ctx }) => {
        websocketRef.current = ws;

        setConnectionState("ready");
        ctx.on("close", () => {
          setConnectionState("disconnected");
          websocketRef.current = null;
        });
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : "Failed to connect to audio service";
        setConnectionState("disconnected");
        onError?.(errorMessage);
      });
  }, []); // Remove onError from dependencies to prevent infinite loop

  useEffect(() => {
    connect();
    
    return () => {
      if (websocketRef.current) {
        websocketRef.current.disconnect();
      }
      // Only stop if play() has been called — the player throws 'AudioContext not initialized' otherwise
      if (playerRef.current && hasPlayedRef.current) {
        playerRef.current.stop();
      }
    };
  }, []); // Only connect once on mount

  const speak = useCallback(
    async (text: string) => {
      const ctx = websocketRef.current;
      if (!ctx) {
        onError?.("Not connected to audio service");
        return;
      }

      if (!text?.trim()) {
        onError?.("No text to speak");
        return;
      }

      try {
        // Process markdown if enabled
        const processedText = processMarkdown ? parseMarkdownToText(text) : text;

        // Create a new player for streaming playback
        if (!playerRef.current || playerState === "idle") {
          playerRef.current = new SinkAwarePlayer({ bufferDuration: TTS_PLAYBACK_BUFFER_SEC });
        }

        // If player is paused, resume instead of starting new speech
        if (playerState === "paused") {
          await playerRef.current.resume();
          setPlayerState("playing");
          return;
        }

        onPlaybackStart?.();

        const resp = await ctx.send({
          modelId: modelId,
          voice: { mode: "id", id: voiceId },
          language: language,
          transcript: processedText,
          generationConfig: buildGenerationConfig({ speed }),
        });

        setPlayerState("playing");
        
        try {
          hasPlayedRef.current = true;
          await playerRef.current.play(resp.source);
          setPlayerState("idle");
          onPlaybackEnd?.();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Playback failed";
          console.error("Error playing audio:", error);
          setPlayerState("idle");
          onError?.(errorMessage);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Speech generation failed";
        console.error("Error generating speech:", error);
        setPlayerState("idle");
        onError?.(errorMessage);
      }
    },
    [voiceId, language, speed, modelId, playerState, processMarkdown, onPlaybackStart, onPlaybackEnd, onError]
  );

  const pause = useCallback(async () => {
    if (playerRef.current && playerState === "playing") {
      try {
        await playerRef.current.pause();
        setPlayerState("paused");
      } catch (error) {
        console.error("Error pausing audio:", error);
      }
    }
  }, [playerState]);

  const resume = useCallback(async () => {
    if (playerRef.current && playerState === "paused") {
      try {
        await playerRef.current.resume();
        setPlayerState("playing");
      } catch (error) {
        console.error("Error resuming audio:", error);
      }
    }
  }, [playerState]);

  const toggle = useCallback(async () => {
    if (!playerRef.current) return;

    try {
      await playerRef.current.toggle();
      setPlayerState((prevState) =>
        prevState === "playing" ? "paused" : prevState === "paused" ? "playing" : prevState
      );
    } catch (error) {
      console.error("Error toggling audio:", error);
    }
  }, []);

  const stop = useCallback(async () => {
    if (playerRef.current && (playerState === "playing" || playerState === "paused")) {
      try {
        await playerRef.current.stop();
        setPlayerState("idle");
      } catch (error) {
        console.error("Error stopping audio:", error);
      }
    }
  }, [playerState]);

  return {
    // State
    connectionState,
    playerState,
    isGenerating: playerState === "playing" && connectionState === "ready",
    isPlaying: playerState === "playing",
    isPaused: playerState === "paused",
    isConnected: connectionState === "ready",
    
    // Actions
    speak,
    pause,
    resume,
    toggle,
    stop,
  };
}

export default useCartesiaWithPreferences;


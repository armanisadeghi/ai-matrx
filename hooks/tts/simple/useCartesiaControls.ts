"use client";
import { CartesiaClient, WebPlayer } from "@cartesia/cartesia-js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Emotion } from "@/components/audio/VoiceConfigSelects";
import {
    buildGenerationConfig,
    CARTESIA_API_VERSION,
    READING_VOICE_ID,
    TTS_MODEL_ID,
    TTS_PLAYBACK_BUFFER_SEC,
} from "@/lib/cartesia/config";

type ConnectionState = "idle" | "fetching-token" | "connecting" | "ready" | "disconnected";
type PlayerState = "idle" | "playing" | "paused";

export function useCartesiaControls() {
    const websocketRef = useRef<ReturnType<typeof CartesiaClient.prototype.tts.websocket> | null>(null);
    const playerRef = useRef<WebPlayer | null>(null);
    // Track whether play() has been called — WebPlayer's AudioContext is lazy-initialized on first play
    const hasPlayedRef = useRef(false);
    const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
    const [playerState, setPlayerState] = useState<PlayerState>("idle");
    const [script, setScript] = useState("Hi. This is AI Matrix.");
    const [voiceId, setVoiceId] = useState(READING_VOICE_ID);
    const [emotions, setEmotions] = useState<Emotion[]>([]);
    const [language, setLanguage] = useState("en");
    const [speed, setSpeed] = useState<number>(0);
    const [modelId, setModelId] = useState(TTS_MODEL_ID);

    const connect = useCallback(async () => {
        try {
            setConnectionState("fetching-token");
            const res = await fetch("/api/cartesia");
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `Token fetch failed: ${res.status}`);
            }
            const data = await res.json();
            setConnectionState("connecting");
            const cartesia = new CartesiaClient({
                // MATRX-EXCEPTION: the installed @cartesia/cartesia-js SDK
                // hard-pins `cartesiaVersion` to the literal "2024-06-10" —
                // its type lags the released API version we intentionally
                // pin to (see lib/cartesia/config.ts). Vendor type
                // limitation, not a contract we control.
                cartesiaVersion: CARTESIA_API_VERSION as unknown as "2024-06-10",
            });
            websocketRef.current = cartesia.tts.websocket({
                container: "raw",
                encoding: "pcm_f32le",
                sampleRate: 44100,
            });
            const ctx = await websocketRef.current?.connect({
                accessToken: data.token,
            });
            setConnectionState("ready");
            ctx.on("close", () => {
                setConnectionState("disconnected");
                websocketRef.current = null;
            });
        } catch (error) {
            console.error("[useCartesiaControls] Connection failed:", error);
            setConnectionState("disconnected");
        }
    }, []);

    useEffect(() => {
        connect();
    }, []); // Only connect once on mount

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

    const speak = useCallback(
        async (optionalScript?: string) => {
            const ctx = websocketRef.current;
            if (!ctx) {
                console.error("Not connected");
                return;
            }

            // Create a new player if one doesn't exist or if we're starting a new speech
            if (!playerRef.current || playerState === "idle") {
                playerRef.current = new WebPlayer({ bufferDuration: TTS_PLAYBACK_BUFFER_SEC });
            }

            // If player is paused, resume instead of starting new speech
            if (playerState === "paused") {
                await resume();
                return;
            }

            // Use the optionalScript if provided, otherwise use the state script
            const textToSpeak = optionalScript !== undefined ? optionalScript : script;

            // Update the script state if optionalScript is provided
            if (optionalScript !== undefined) {
                setScript(optionalScript);
            }

            const resp = await ctx.send({
                modelId: modelId,
                voice: { mode: "id", id: voiceId },
                language: language,
                transcript: textToSpeak,
                generationConfig: buildGenerationConfig({ speed }),
            });

            setPlayerState("playing");
            try {
                hasPlayedRef.current = true;
                await playerRef.current.play(resp.source);
                setPlayerState("idle");
            } catch (error) {
                console.error("Error playing audio:", error);
                setPlayerState("idle");
            }
        },
        [voiceId, emotions, language, speed, modelId, playerState, script, resume]
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

    const toggle = useCallback(async () => {
        if (!playerRef.current || !hasPlayedRef.current) return;

        try {
            await playerRef.current.toggle();
            setPlayerState((prevState) => (prevState === "playing" ? "paused" : prevState === "paused" ? "playing" : prevState));
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

    const handleScriptChange = (newScript: string) => {
        setScript(newScript);
    };

    const handleVoiceChange = (newVoiceId: string) => {
        setVoiceId(newVoiceId);
    };

    const handleEmotionsChange = (newEmotions: Emotion[]) => {
        setEmotions(newEmotions);
    };

    const handleLanguageChange = (newLanguage: string) => {
        setLanguage(newLanguage);
    };

    const handleSpeedChange = (newSpeed: number) => {
        setSpeed(newSpeed);
    };

    const handleModelChange = (newModelId: string) => {
        setModelId(newModelId);
    };

    return {
        connectionState,
        playerState,
        speak,
        pause,
        resume,
        toggle,
        stop,
        handleScriptChange,
        handleVoiceChange,
        handleEmotionsChange,
        handleLanguageChange,
        handleSpeedChange,
        handleModelChange,
        script,
        voiceId,
        emotions,
        language,
        speed,
        modelId,
    };
}

export default useCartesiaControls;
export type CartesiaControls = ReturnType<typeof useCartesiaControls>;

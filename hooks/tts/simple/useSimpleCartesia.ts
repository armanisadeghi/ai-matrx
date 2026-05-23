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

export function useSimpleCartesia() {
    const websocketRef = useRef<ReturnType<typeof CartesiaClient.prototype.tts.websocket> | null>(null);
    const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
    const [playerState, setPlayerState] = useState<"idle" | "playing">("idle");
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
            console.error("[useSimpleCartesia] Connection failed:", error);
            setConnectionState("disconnected");
        }
    }, []);

    useEffect(() => {
        connect();
    }, [connect]);

    const speak = useCallback(async () => {
        const ctx = websocketRef.current;
        if (!ctx) {
            console.error("Not connected");
            return;
        }

        try {
            const resp = await ctx.send({
                modelId: modelId,
                voice: { mode: "id", id: voiceId },
                language: language,
                transcript: script,
                generationConfig: buildGenerationConfig({ speed }),
            });
            const player = new WebPlayer({ bufferDuration: TTS_PLAYBACK_BUFFER_SEC });
            setPlayerState("playing");
            await player.play(resp.source);
            setPlayerState("idle");
        } catch (error) {
            console.error("[useSimpleCartesia] Speech failed:", error);
            setPlayerState("idle");
        }
    }, [script, voiceId, emotions, language, speed, modelId]);

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

export default useSimpleCartesia;

export type SimpleCartesia = ReturnType<typeof useSimpleCartesia>;

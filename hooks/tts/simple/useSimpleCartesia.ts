"use client";
import type CartesiaWebsocket from "@cartesia/cartesia-js/wrapper/Websocket";
import { SinkAwarePlayer } from "@/features/audio/sinkAwarePlayer";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Emotion } from "@/components/audio/VoiceConfigSelects";
import { connectCartesiaTts } from "@/lib/cartesia/connection";
import {
    buildGenerationConfig,
    READING_VOICE_ID,
    TTS_MODEL_ID,
    TTS_PLAYBACK_BUFFER_SEC,
} from "@/lib/cartesia/config";

type ConnectionState = "connecting" | "ready" | "disconnected";

export function useSimpleCartesia() {
    const websocketRef = useRef<CartesiaWebsocket | null>(null);
    // The hook connects on mount, so "connecting" is the true initial state.
    const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
    const [playerState, setPlayerState] = useState<"idle" | "playing">("idle");
    const [script, setScript] = useState("Hi. This is AI Matrix.");
    const [voiceId, setVoiceId] = useState(READING_VOICE_ID);
    const [emotions, setEmotions] = useState<Emotion[]>([]);
    const [language, setLanguage] = useState("en");
    const [speed, setSpeed] = useState<number>(0);
    const [modelId, setModelId] = useState(TTS_MODEL_ID);

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
                console.error("[useSimpleCartesia] Connection failed:", error);
                setConnectionState("disconnected");
            });
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
            const player = new SinkAwarePlayer({ bufferDuration: TTS_PLAYBACK_BUFFER_SEC });
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

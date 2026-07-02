'use client';
import {useState, useEffect, useCallback, useRef} from 'react';
import cartesia from "@/lib/cartesia/client";
import {
    OutputContainer,
    AudioEncoding,
    ModelId,
    VoiceOptions,
    Language,
    VoiceSpeed,
    Emotion,
    Intensity,
    EmotionName,
    EmotionLevel
} from '@/lib/cartesia/cartesia.types';
import {WebPlayer} from "@cartesia/cartesia-js";
import Source from '@cartesia/cartesia-js/wrapper/source';
import type CartesiaWebsocket from '@cartesia/cartesia-js/wrapper/Websocket';
import type {TtsRequestVoiceSpecifier} from '@cartesia/cartesia-js/api/resources/tts/types/TtsRequestVoiceSpecifier';
import {
    buildGenerationConfig,
    READING_VOICE_ID,
    TTS_DEFAULT_SPEED,
    TTS_MODEL_ID,
} from '@/lib/cartesia/config';

const VOICE_SPEED_TO_NUMBER: Record<VoiceSpeed, number> = {
    [VoiceSpeed.SLOWEST]: 0.6,
    [VoiceSpeed.SLOW]: 0.85,
    [VoiceSpeed.NORMAL]: TTS_DEFAULT_SPEED,
    [VoiceSpeed.FAST]: 1.35,
    [VoiceSpeed.FASTEST]: 1.5,
};

// The SDK's wire type requires a literal, non-optional `mode` ("id" | "embedding"),
// while our app-facing `VoiceOptions` leaves `mode` optional (defaults to "id").
// Normalize at the send boundary instead of widening the app-facing type.
function toVoiceSpecifier(voice: VoiceOptions): TtsRequestVoiceSpecifier {
    // `mode` is optional on both variants, so it can't discriminate the union
    // when undefined — the presence of `embedding` can.
    if ("embedding" in voice) {
        return {mode: "embedding", embedding: voice.embedding};
    }
    return {mode: "id", id: voice.id};
}

interface UseCartesiaProps {
    container?: OutputContainer;
    encoding?: AudioEncoding;
    sampleRate?: number;
    modelId?: ModelId;
    voice?: VoiceOptions;
    language?: Language;
    bufferDuration?: number;
}

interface UseCartesiaResult {
    sendMessage: (transcript: string, speed?: VoiceSpeed, voice?: VoiceOptions, emotions?: Array<{
        emotion: EmotionName,
        intensity?: EmotionLevel
    }>) => Promise<void>;
    messages: string[];
    isConnected: boolean;
    error: Error | null;
    pausePlayback: () => Promise<void>;
    resumePlayback: () => Promise<void>;
    togglePlayback: () => Promise<void>;
    stopPlayback: () => Promise<void>;
    updateConfigs: (newConfigs: Partial<UseCartesiaProps>) => void;
    initializeAudio: () => Promise<void>; // New method to initialize audio
    isAudioInitialized: boolean; // Track if audio has been initialized
}

export function useCartesia(
    {
        container = OutputContainer.Raw,
        encoding = AudioEncoding.PCM_F32LE,
        sampleRate = 44100,
        modelId = TTS_MODEL_ID as ModelId,
        voice = {mode: "id", id: READING_VOICE_ID},
        language = Language.EN,
        bufferDuration = 1,
    }: UseCartesiaProps = {}): UseCartesiaResult {
    // MATRX-EXCEPTION: `cartesia.tts` is typed as the base `Tts` class in the
    // installed @cartesia/cartesia-js — `.websocket(...)` (called below) only
    // exists on `StreamingTTSClient`/the runtime object, not the declared
    // type (SDK type/version drift). Once past that call, the resolved
    // handle is the fully-typed `Websocket` class.
    const [websocket, setWebsocket] = useState<CartesiaWebsocket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [messages, setMessages] = useState<string[]>([]);
    const [error, setError] = useState<Error | null>(null);
    const [isAudioInitialized, setIsAudioInitialized] = useState(false);
    const [config, setConfig] = useState<UseCartesiaProps>({
        container,
        encoding,
        sampleRate,
        modelId,
        voice,
        language,
        bufferDuration
    });
    
    const playerRef = useRef<WebPlayer | null>(null);
    // Track whether play() has been called at least once (AudioContext is lazy-initialized on first play)
    const hasPlayedRef = useRef(false);
    // Create a silent audio buffer to unlock Web Audio API
    const silentSourceRef = useRef<Source | null>(null);

    // Initialize websocket connection
    useEffect(() => {
        // MATRX-EXCEPTION: see the `websocket` state declaration above —
        // `.websocket(...)` isn't on the declared `Tts` type.
        const ws: CartesiaWebsocket = cartesia.tts.websocket({
            container: config.container,
            encoding: config.encoding,
            sampleRate: config.sampleRate ?? 44100,
        });
        
        ws.connect()
            .then(() => {
                setIsConnected(true);
                setWebsocket(ws);
                // Create the player but don't start AudioContext yet
                if (!playerRef.current) {
                    playerRef.current = new WebPlayer({bufferDuration: config.bufferDuration ?? 1});
                }
            })
            .catch((err: Error) => {
                console.error(`Failed to connect to Cartesia: ${err}`);
                setError(err);
            });

        return () => {
            if (ws) {
                ws.disconnect();
            }
            // Only stop if play() has been called — WebPlayer throws 'AudioContext not initialized' otherwise
            if (playerRef.current && hasPlayedRef.current) {
                playerRef.current.stop().catch(console.error);
            }
        };
    }, []);

    // Method to initialize Audio
    // This tricks the browser into activating the AudioContext through a user gesture
    const initializeAudio = useCallback(async () => {
        if (!playerRef.current) {
            throw new Error("Player not initialized");
        }
        
        if (!websocket || !isConnected) {
            throw new Error("WebSocket is not connected");
        }
        
        try {
            // Create a silent source to "warm up" the AudioContext
            // This is a workaround since WebPlayer doesn't expose the AudioContext directly
            if (!silentSourceRef.current) {
                // Create a tiny silent audio buffer
                const silentResponse = await websocket.send({
                    modelId: modelId,
                    voice: toVoiceSpecifier(config.voice ?? {mode: "id", id: READING_VOICE_ID}),
                    transcript: " ", // Just a space - minimal audio
                    language,
                });
                
                silentSourceRef.current = silentResponse.source;
            }
            
            // Play and immediately stop the silent source
            // This will initialize the AudioContext but not produce audible sound
            if (silentSourceRef.current) {
                hasPlayedRef.current = true;
                await playerRef.current.play(silentSourceRef.current);
                await playerRef.current.stop();
                setIsAudioInitialized(true);
            }
        } catch (err) {
            console.error("Error initializing audio:", err);
            setError(err instanceof Error ? err : new Error('Failed to initialize audio'));
            throw err;
        }
    }, [websocket, isConnected, modelId, language, config.voice]);

    const updateConfigs = useCallback((newConfigs: Partial<UseCartesiaProps>) => {
        setConfig((prevConfig) => ({
            ...prevConfig,
            ...newConfigs,
        }));
    }, []);

    const sendMessage = useCallback(async (
        transcript: string,
        speed: VoiceSpeed = VoiceSpeed.NORMAL,
        voice: VoiceOptions = {mode: "id", id: READING_VOICE_ID},
        emotions?: Array<{ emotion: EmotionName, intensity?: EmotionLevel }>
    ) => {
        if (!websocket || !isConnected) {
            throw new Error("WebSocket is not connected");
        }
        
        // Make sure Audio is initialized before playing
        if (!isAudioInitialized) {
            try {
                await initializeAudio();
            } catch (err) {
                console.error("Failed to initialize audio:", err);
                throw err;
            }
        }
        
        try {
            // Sonic 3.5 is multilingual, so no model switch is needed. Speed and
            // emotion go through the latest generation_config format.
            const response = await websocket.send({
                modelId,
                voice: toVoiceSpecifier(voice),
                transcript,
                language,
                generationConfig: buildGenerationConfig({
                    speed: VOICE_SPEED_TO_NUMBER[speed] ?? TTS_DEFAULT_SPEED,
                    emotion: emotions?.[0]?.emotion,
                }),
            });
            
            response.on("message", (message: string) => {
                setMessages((prevMessages) => [...prevMessages, message]);
            });
            
            if (playerRef.current && response.source instanceof Source) {
                hasPlayedRef.current = true;
                await playerRef.current.play(response.source);
            } else {
                throw new Error("Player not initialized or invalid source");
            }
        } catch (err) {
            console.error("Error sending message:", err);
            setError(err instanceof Error ? err : new Error('Unknown error occurred'));
        }
    }, [websocket, isConnected, modelId, voice, language, isAudioInitialized, initializeAudio]);

    const pausePlayback = useCallback(async () => {
        if (!playerRef.current) return;
        
        try {
            await playerRef.current.pause();
        } catch (err) {
            console.error("Error pausing playback:", err);
            setError(err instanceof Error ? err : new Error('Unknown error occurred while pausing'));
        }
    }, []);

    const resumePlayback = useCallback(async () => {
        if (!playerRef.current) return;
        
        // Check if Audio is initialized before resuming
        if (!isAudioInitialized) {
            try {
                await initializeAudio();
            } catch (err) {
                console.error("Failed to initialize audio before resuming:", err);
                throw err;
            }
        }
        
        try {
            await playerRef.current.resume();
        } catch (err) {
            console.error("Error resuming playback:", err);
            setError(err instanceof Error ? err : new Error('Unknown error occurred while resuming'));
        }
    }, [isAudioInitialized, initializeAudio]);

    const togglePlayback = useCallback(async () => {
        if (!playerRef.current) return;
        
        // Check if Audio is initialized before toggling
        if (!isAudioInitialized) {
            try {
                await initializeAudio();
            } catch (err) {
                console.error("Failed to initialize audio before toggling:", err);
                throw err;
            }
        }
        
        try {
            await playerRef.current.toggle();
        } catch (err) {
            console.error("Error toggling playback:", err);
            setError(err instanceof Error ? err : new Error('Unknown error occurred while toggling'));
        }
    }, [isAudioInitialized, initializeAudio]);

    const stopPlayback = useCallback(async () => {
        if (!playerRef.current || !hasPlayedRef.current) return;
        
        try {
            await playerRef.current.stop();
        } catch (err) {
            console.error("Error stopping playback:", err);
            setError(err instanceof Error ? err : new Error('Unknown error occurred while stopping'));
        }
    }, []);

    return {
        sendMessage,
        messages,
        isConnected,
        error,
        pausePlayback,
        resumePlayback,
        togglePlayback,
        stopPlayback,
        updateConfigs,
        isAudioInitialized,
        initializeAudio,
    };
}
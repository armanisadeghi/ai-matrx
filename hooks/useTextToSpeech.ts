import { useState, useCallback, useEffect, useRef } from 'react';
import { WebPlayer } from '@cartesia/cartesia-js';
import type Source from '@cartesia/cartesia-js/wrapper/source';
import cartesia from '@/lib/cartesia/client';
import {
    VoiceSpeed,
    AudioEncoding,
    Language,
    VoiceOptions,
    StreamRequest,
    EmotionControl
} from '@/lib/cartesia/cartesia.types';

interface UseTextToSpeechOptions {
    text: string;
    voiceId: string;
    speed: VoiceSpeed;
    emotions: EmotionControl[];
    language?: Language;
    modelId?: string;
}

const useTextToSpeech = (options: UseTextToSpeechOptions) => {
    const { text, voiceId, speed, emotions, language = Language.EN, modelId = 'sonic-english' } = options;

    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackStatus, setPlaybackStatus] = useState<'inactive' | 'playing' | 'paused' | 'finished'>('inactive');

    // MATRX-EXCEPTION: `cartesia.tts` is typed as the base `Tts` class in the
    // installed @cartesia/cartesia-js — `.websocket(...)` (used below) only
    // exists on `StreamingTTSClient`/the runtime object, not the declared
    // type (SDK type/version drift, see escalation brief). Typing this ref
    // honestly is blocked on that upstream gap.
    const websocketRef = useRef<any>(null);
    const playerRef = useRef<WebPlayer | null>(null);
    const sourceRef = useRef<Source | null>(null);
    // Track whether play() has been called — WebPlayer's AudioContext is lazy-initialized on first play
    const hasPlayedRef = useRef(false);

    useEffect(() => {
        websocketRef.current = cartesia.tts.websocket({
            container: "raw",
            encoding: AudioEncoding.PCM_F32LE,
            sampleRate: 44100,
        });

        playerRef.current = new WebPlayer(websocketRef.current);

        return () => {
            websocketRef.current?.disconnect();
            // Only stop if play() has been called — WebPlayer throws 'AudioContext not initialized' otherwise
            if (playerRef.current && hasPlayedRef.current) {
                playerRef.current.stop();
            }
        };
    }, []);

    const play = useCallback(async () => {
        if (!websocketRef.current) {
            console.error("WebSocket is not initialized");
            return;
        }

        try {
            await websocketRef.current.connect();

            const voiceOptions: VoiceOptions = {
                mode: "id",
                id: voiceId,
                __experimental_controls: {
                    speed: speed,
                    emotion: emotions,
                },
            };

            const request: StreamRequest = {
                modelId: modelId,
                transcript: text,
                voice: voiceOptions,
                language,
            };

            const response = await websocketRef.current.send(request);
            sourceRef.current = response.source;

            if (!sourceRef.current) {
                throw new Error("No audio source returned from Cartesia");
            }

            setIsPlaying(true);
            setPlaybackStatus('playing');
            hasPlayedRef.current = true;
            await playerRef.current?.play(sourceRef.current);
            setPlaybackStatus('finished');
        } catch (error) {
            console.error("Error playing audio:", error);
            setPlaybackStatus('inactive');
        } finally {
            setIsPlaying(false);
        }
    }, [text, modelId, voiceId, language, speed, emotions]);

    const pause = useCallback(() => {
        if (playerRef.current && hasPlayedRef.current) {
            playerRef.current.pause();
            setIsPlaying(false);
            setPlaybackStatus('paused');
        }
    }, []);

    const resume = useCallback(() => {
        if (playerRef.current && hasPlayedRef.current) {
            playerRef.current.resume();
            setIsPlaying(true);
            setPlaybackStatus('playing');
        }
    }, []);

    const stop = useCallback(() => {
        if (playerRef.current && hasPlayedRef.current) {
            playerRef.current.stop();
            setIsPlaying(false);
            setPlaybackStatus('inactive');
        }
    }, []);

    return {
        play,
        pause,
        resume,
        stop,
        isPlaying,
        playbackStatus,
    };
};

export default useTextToSpeech;
'use client';

import React, { useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw } from 'lucide-react';
import { useCartesiaSpeaker } from '@/features/tts/hooks/useCartesiaSpeaker';

interface TextToSpeechPlayerProps {
    text: string;
    autoPlay?: boolean;
    onPlaybackEnd?: () => void;
}

// Kept for backward-compat — imported by TextToSpeechPlayerThree.
export type TtsStatus =
    'initialLoad'
    | 'websocketConnected'
    | 'readyForAutoPlay'
    | 'connectedNoAutoPlay'
    | 'disconnected'
    | 'reconnected'
    | 'buffering'
    | 'playing'
    | 'paused'
    | 'finished'
    | 'error';

/**
 * Thin wrapper over the canonical TTS hook (useCartesiaSpeaker): Sonic 3.5, the
 * latest API format, and the user's voice preference (reading default: Skylar).
 * Replaces the old hand-rolled `sonic-english` player that broke when Cartesia
 * deprecated the legacy models.
 */
const TextToSpeechPlayer: React.FC<TextToSpeechPlayerProps> = ({
    text,
    autoPlay = false,
    onPlaybackEnd,
}) => {
    const { phase, isLoading, isPlaying, isPaused, speak, pause, resume } =
        useCartesiaSpeaker({ purpose: 'reading' });

    const autoPlayedRef = useRef(false);
    useEffect(() => {
        if (autoPlay && !autoPlayedRef.current) {
            autoPlayedRef.current = true;
            void speak(text);
        }
    }, [autoPlay, speak, text]);

    // Fire onPlaybackEnd once playback returns to idle after being active.
    const wasActiveRef = useRef(false);
    useEffect(() => {
        if (isLoading || isPlaying || isPaused) {
            wasActiveRef.current = true;
        } else if (wasActiveRef.current) {
            wasActiveRef.current = false;
            onPlaybackEnd?.();
        }
    }, [isLoading, isPlaying, isPaused, onPlaybackEnd]);

    return (
        <div className="flex flex-col items-center">
            <div className="flex space-x-4">
                <Button onClick={() => void speak(text)} disabled={isLoading || isPlaying || isPaused}>
                    <Play className="mr-2 h-4 w-4" /> Play
                </Button>
                <Button onClick={() => void pause()} disabled={!isPlaying}>
                    <Pause className="mr-2 h-4 w-4" /> Pause
                </Button>
                <Button onClick={() => void resume()} disabled={!isPaused}>
                    <Play className="mr-2 h-4 w-4" /> Resume
                </Button>
                <Button onClick={() => void speak(text)} disabled={isLoading || isPlaying}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Replay
                </Button>
            </div>
            <div className="mt-2 text-sm">Playback status: {phase}</div>
        </div>
    );
};

export default TextToSpeechPlayer;

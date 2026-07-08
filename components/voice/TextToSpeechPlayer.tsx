'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { CartesiaClient } from '@cartesia/cartesia-js';
import { SinkAwarePlayer } from '@/features/audio/sinkAwarePlayer';
import { Play, Pause, RotateCcw } from 'lucide-react';

interface TextToSpeechPlayerProps {
    text: string;
    autoPlay?: boolean;
    onPlaybackEnd?: () => void;
}

const TextToSpeechPlayer: React.FC<TextToSpeechPlayerProps> = ({ text, autoPlay = false, onPlaybackEnd }) => {
    const apiKey = process.env.NEXT_PUBLIC_CARTESIA_API_KEY;
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackStatus, setPlaybackStatus] = useState('');
    const cartesiaRef = useRef<CartesiaClient | null>(null);
    const websocketRef = useRef<any>(null);
    const playerRef = useRef<SinkAwarePlayer | null>(null);
    const sourceRef = useRef<any>(null);



    useEffect(() => {
        cartesiaRef.current = new CartesiaClient({ apiKey: apiKey || '' });
        websocketRef.current = cartesiaRef.current.tts.websocket({
            container: "raw",
            encoding: "pcm_f32le",
            sampleRate: 44100
        });

        playerRef.current = new SinkAwarePlayer({ bufferDuration: 1 }); // 1 second buffer

        if (autoPlay) {
            handlePlay();
        }

        return () => {
            websocketRef.current?.disconnect();
        };
    }, [apiKey, autoPlay]);

    const handlePlay = useCallback(async () => {
        if (!apiKey || !websocketRef.current || !playerRef.current) {
            console.error("Cartesia API key is not set or WebSocket/Player is not initialized");
            return;
        }

        try {
            setIsPlaying(true);
            setPlaybackStatus('Connecting...');
            await websocketRef.current.connect();

            setPlaybackStatus('Buffering audio...');
            const response = await websocketRef.current.send({
                modelId: "sonic-english",
                voice: {
                    mode: "id",
                    id: "156fb8d2-335b-4950-9cb3-a2d33befec77",
                    __experimental_controls: {
                        "speed": "normal",
                        "emotion": [
                            "positivity:high",
                            "curiosity"
                        ]
                    },

                },
                transcript: text
            });

            sourceRef.current = response.source;

            setPlaybackStatus('Playing audio...');
            await playerRef.current.play(sourceRef.current);
            setPlaybackStatus('Playback finished');
        } catch (error) {
            console.error("Error playing audio:", error);
            setPlaybackStatus('Error occurred');
        } finally {
            setIsPlaying(false);
            onPlaybackEnd?.();
        }
    }, [text, onPlaybackEnd, apiKey]);

    const handlePause = useCallback(async () => {
        if (playerRef.current) {
            await playerRef.current.pause();
            setIsPlaying(false);
            setPlaybackStatus('Paused');
        }
    }, []);

    const handleResume = useCallback(async () => {
        if (playerRef.current) {
            await playerRef.current.resume();
            setIsPlaying(true);
            setPlaybackStatus('Playing audio...');
        }
    }, []);

    const handleReplay = useCallback(async () => {
        if (playerRef.current && sourceRef.current) {
            setIsPlaying(true);
            setPlaybackStatus('Playing audio...');
            await playerRef.current.play(sourceRef.current);
            setPlaybackStatus('Playback finished');
            setIsPlaying(false);
        }
    }, []);

    if (!apiKey) return <div>API key not set. Unable to play audio.</div>;

    return (
        <div className="flex flex-col items-center">
            <div className="flex space-x-4">
                {isPlaying ? (
                    <Button onClick={handlePause}>
                        <Pause className="mr-2 h-4 w-4" /> Pause
                    </Button>
                ) : (
                    <Button onClick={handleResume}>
                        <Play className="mr-2 h-4 w-4" /> Play
                    </Button>
                )}
                <Button onClick={handleReplay}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Replay
                </Button>
            </div>
            <div className="mt-2 text-sm">
                Voice Status: {playbackStatus}
            </div>
        </div>
    );
};

export default TextToSpeechPlayer;

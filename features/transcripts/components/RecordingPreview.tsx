'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, Volume2, Gauge, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TranscriptSegment } from '../types';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ProTextarea } from "@/components/official/ProTextarea";

interface RecordingPreviewProps {
    audioUrl: string;
    title: string;
    description: string;
    segments: TranscriptSegment[];
    onTitleChange: (title: string) => void;
    onDescriptionChange: (description: string) => void;
    onSegmentsChange: (segments: TranscriptSegment[]) => void;
}

export function RecordingPreview({
    audioUrl,
    title,
    description,
    segments,
    onTitleChange,
    onDescriptionChange,
    onSegmentsChange,
}: RecordingPreviewProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const audioRef = useRef<HTMLAudioElement>(null);

    const speedOptions = [0.75, 1, 1.25, 1.5, 1.75, 2, 3];

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const formatSpeed = (speed: number) => {
        if (speed === 1) return '1.0×';
        if (speed === 2) return '2.0×';
        if (speed === 3) return '3.0×';
        return `${speed.toFixed(2)}×`;
    };

    const togglePlay = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
        }
    };

    const handleSeek = (value: number[]) => {
        if (audioRef.current) {
            audioRef.current.currentTime = value[0];
            setCurrentTime(value[0]);
        }
    };

    const handleVolumeChange = (value: number[]) => {
        if (audioRef.current) {
            audioRef.current.volume = value[0];
            setVolume(value[0]);
        }
    };

    const handleSpeedChange = (speed: number) => {
        if (audioRef.current) {
            audioRef.current.playbackRate = speed;
            setPlaybackSpeed(speed);
        }
    };

    return (
        <div className="space-y-6">
            {/* Title and Description */}
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="preview-title">Title</Label>
                    <Input
                        id="preview-title"
                        value={title}
                        onChange={(e) => onTitleChange(e.target.value)}
                        placeholder="Recording title"
                        style={{ fontSize: '16px' }}
                        className="border border-border"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="preview-description">Description (Optional)</Label>
                    <ProTextarea
                        id="preview-description"
                        value={description}
                        onChange={(e) => onDescriptionChange(e.target.value)}
                        placeholder="Add a description..."
                        rows={2}
                        style={{ fontSize: '16px' }}
                        className="border border-border"
                    />
                </div>
            </div>

            {/* Audio Player */}
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Audio Preview</span>
                    <span className="text-xs text-muted-foreground font-mono">
                        {formatTime(duration)}
                    </span>
                </div>

                <audio
                    ref={audioRef}
                    src={audioUrl}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onEnded={() => setIsPlaying(false)}
                />

                <div className="flex items-center gap-2">
                    <Button
                        size="icon"
                        variant="outline"
                        className="h-9 w-9 rounded-full shrink-0"
                        onClick={togglePlay}
                    >
                        {isPlaying ? (
                            <Pause className="h-4 w-4" />
                        ) : (
                            <Play className="h-4 w-4 ml-0.5" />
                        )}
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-9 px-2 md:px-3 shrink-0 font-mono text-xs md:text-sm min-w-[52px] md:min-w-[60px]"
                            >
                                <Gauge className="h-3 w-3 md:h-3.5 md:w-3.5 mr-1 md:mr-1.5" />
                                {formatSpeed(playbackSpeed)}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="min-w-[140px]">
                            {speedOptions.map((speed) => (
                                <DropdownMenuItem
                                    key={speed}
                                    onSelect={() => handleSpeedChange(speed)}
                                    className="font-mono cursor-pointer"
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <span>{formatSpeed(speed)}</span>
                                        {playbackSpeed === speed && (
                                            <Check className="h-4 w-4 ml-2 text-primary" />
                                        )}
                                    </div>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
                        <Slider
                            value={[currentTime]}
                            max={duration || 100}
                            step={0.1}
                            onValueChange={handleSeek}
                            className="cursor-pointer"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground font-mono">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>

                    <div className="hidden sm:flex items-center gap-2 w-20 md:w-24 shrink-0">
                        <Volume2 className="h-4 w-4 text-muted-foreground" />
                        <Slider
                            value={[volume]}
                            max={1}
                            step={0.1}
                            onValueChange={handleVolumeChange}
                        />
                    </div>
                </div>
            </div>

            {/* Transcript Preview */}
            <div className="space-y-2">
                <Label>Transcript ({segments.length} segments)</Label>
                <div className="border rounded-md p-4 max-h-64 overflow-y-auto bg-background">
                    {segments.length > 0 ? (
                        <div className="space-y-2 text-sm">
                            {segments.map((segment, index) => (
                                <div key={segment.id} className="flex gap-2">
                                    <span className="text-muted-foreground font-mono text-xs shrink-0">
                                        [{segment.timecode}]
                                    </span>
                                    <span>{segment.text}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            No transcript available
                        </p>
                    )}
                </div>
                <p className="text-xs text-muted-foreground">
                    You can edit the transcript after saving by opening it from the sidebar.
                </p>
            </div>
        </div>
    );
}


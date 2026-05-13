'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranscriptsContext } from '../context/TranscriptsContext';
import AdvancedTranscriptViewer, { TranscriptSegment } from '@/components/mardown-display/blocks/transcripts/AdvancedTranscriptViewer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Edit2, Save, X, Play, Pause, SkipBack, SkipForward, Volume2, Loader2, RotateCw, FileText, Gauge, Check } from 'lucide-react';
import { useToastManager } from '@/hooks/useToastManager';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useFileSrc } from '@/features/files/handler/hooks/useFileSrc';
import type { FileSource } from '@/features/files/handler/types';
import { Slider } from '@/components/ui/slider';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PromoteToStudioButton } from '@/features/transcript-studio/components/conversion/PromoteToStudioButton';
import { ContentActionBar } from '@/components/content-actions/ContentActionBar';

export function TranscriptViewer() {
    const { activeTranscript, updateTranscript } = useTranscriptsContext();
    const toast = useToastManager('transcripts');

    const [isEditingMetadata, setIsEditingMetadata] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');

    // Audio Player State
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const audioRef = useRef<HTMLAudioElement>(null);

    // Playback speed options
    const speedOptions = [0.75, 1, 1.25, 1.5, 1.75, 2, 3];

    // Get signed URL for audio. The handler auto-refreshes before expiry.
    const audioSource: FileSource | null = activeTranscript?.audio_file_path
        ? { kind: "file_id", fileId: activeTranscript.audio_file_path }
        : null;
    const audioUrl = useFileSrc(audioSource);
    const isLoadingUrl = !audioUrl && !!audioSource;
    const urlError: string | null = null;

    useEffect(() => {
        if (activeTranscript) {
            setEditTitle(activeTranscript.title);
            setEditDescription(activeTranscript.description);
            // Reset player when transcript changes
            setIsPlaying(false);
            setCurrentTime(0);
            setPlaybackSpeed(1);
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
                audioRef.current.playbackRate = 1;
            }
        }
    }, [activeTranscript]);

    const handleUpdateMetadata = async () => {
        if (!activeTranscript) return;

        try {
            await updateTranscript(activeTranscript.id, {
                title: editTitle,
                description: editDescription,
            });
            setIsEditingMetadata(false);
            toast.success('Transcript details updated');
        } catch (error) {
            toast.error('Failed to update details');
        }
    };

    const handleUpdateSegments = async (segments: TranscriptSegment[]) => {
        if (!activeTranscript) return;

        try {
            await updateTranscript(activeTranscript.id, {
                segments: segments,
            });
            // Toast is handled by the viewer context menu mostly, but good to confirm
        } catch (error) {
            toast.error('Failed to update segments');
        }
    };

    // Audio Player Handlers
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

    const formatSpeed = (speed: number) => {
        // Format speed consistently to avoid UI shifts
        if (speed === 1) return '1.0×';
        if (speed === 2) return '2.0×';
        if (speed === 3) return '3.0×';
        return `${speed.toFixed(2)}×`;
    };

    const handleTranscriptTimeClick = (seconds: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = seconds;
            setCurrentTime(seconds);
            if (!isPlaying) {
                audioRef.current.play();
                setIsPlaying(true);
            }
        }
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    // Construct the transcript content string for the viewer if segments exist
    const transcriptContent = React.useMemo(() => {
        if (!activeTranscript?.segments) return '';
        // Reconstruct content from segments for the viewer
        return activeTranscript.segments
            .map(s => {
                let line = `[${s.timecode}]`;
                if (s.speaker) line += ` ${s.speaker}:`;
                line += ` ${s.text}`;
                return line;
            })
            .join('\n\n');
    }, [activeTranscript]);

    if (!activeTranscript) {
        return (
            <div className="flex-1 flex items-center justify-center text-muted-foreground bg-background">
                <div className="text-center">
                    <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                    <p>Select a transcript to view</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
            {/* Header */}
            <div className="px-4 md:px-6 py-3 md:py-4 border-b border-border shrink-0">
                {isEditingMetadata ? (
                    <div className="space-y-3">
                        <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="font-semibold text-base md:text-lg"
                            style={{ fontSize: '16px' }}
                        />
                        <Textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="Description"
                            rows={2}
                            className="text-sm"
                            style={{ fontSize: '16px' }}
                        />
                        <div className="flex gap-2">
                            <Button size="sm" onClick={handleUpdateMetadata}>
                                <Save className="h-4 w-4 mr-1" /> Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setIsEditingMetadata(false)}>
                                <X className="h-4 w-4 mr-1" /> Cancel
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-xl font-bold text-foreground">{activeTranscript.title}</h1>
                            {activeTranscript.description && (
                                <p className="text-sm text-muted-foreground mt-1">{activeTranscript.description}</p>
                            )}
                            <div className="flex gap-2 mt-2">
                                {activeTranscript.tags.map((tag) => (
                                    <span key={tag} className="px-2 py-0.5 bg-secondary text-secondary-foreground rounded-full text-xs">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {transcriptContent.trim().length > 0 && (
                                <ContentActionBar
                                    content={transcriptContent}
                                    title={activeTranscript.title}
                                    metadata={{
                                        source: 'transcripts',
                                        transcript_id: activeTranscript.id,
                                        description: activeTranscript.description,
                                        tags: activeTranscript.tags,
                                    }}
                                    instanceKey={`transcript-${activeTranscript.id}`}
                                    hideSpeaker
                                    hidePencil
                                />
                            )}
                            <PromoteToStudioButton transcript={activeTranscript} />
                            <Button variant="ghost" size="icon" onClick={() => setIsEditingMetadata(true)}>
                                <Edit2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Audio Player */}
            {activeTranscript.source_type === 'audio' && (
                <div className="px-4 md:px-6 py-2 md:py-3 bg-muted/50 border-b border-border shrink-0">
                    <div className="flex flex-col gap-2">
                        {/* Hidden Audio Element */}
                        {audioUrl && (
                            <audio
                                ref={audioRef}
                                src={audioUrl}
                                onTimeUpdate={handleTimeUpdate}
                                onLoadedMetadata={handleLoadedMetadata}
                                onEnded={() => setIsPlaying(false)}
                            />
                        )}

                        <div className="flex items-center gap-2 md:gap-4">
                            <Button
                                size="icon"
                                variant="outline"
                                className="h-9 w-9 md:h-10 md:w-10 rounded-full shrink-0"
                                onClick={togglePlay}
                                disabled={!audioUrl}
                            >
                                {isLoadingUrl ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : isPlaying ? (
                                    <Pause className="h-4 w-4" />
                                ) : (
                                    <Play className="h-4 w-4 ml-0.5" />
                                )}
                            </Button>

                            {/* Playback Speed Dropdown */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-9 px-2 md:px-3 shrink-0 font-mono text-xs md:text-sm min-w-[52px] md:min-w-[60px]"
                                        disabled={!audioUrl}
                                        title="Playback speed"
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

                            {/* Volume Control - Hidden on mobile */}
                            <div className="hidden sm:flex items-center gap-2 w-20 md:w-24 shrink-0">
                                <Volume2 className="h-4 w-4 text-muted-foreground" />
                                <Slider
                                    value={[volume]}
                                    max={1}
                                    step={0.1}
                                    onValueChange={handleVolumeChange}
                                />
                            </div>

                            {activeTranscript.audio_file_path && !audioUrl && !isLoadingUrl && (
                                <div className="text-xs text-red-500 flex items-center shrink-0">
                                    <X className="h-3 w-3 mr-1" />
                                    Failed to load audio
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-muted/30 pb-safe">
                <Card className="border-0 shadow-none bg-transparent">
                    <CardContent className="p-0">
                        {/* We pass the reconstructed string content, BUT AdvancedTranscriptViewer 
                            should ideally accept segments directly to avoid re-parsing. 
                            However, the current simplified version takes content string. 
                            
                            Fix: The viewer we just updated (if I recall correctly from my thought process) 
                            accepts `content` string and parses it. 
                            
                            Actually, passing segments directly would be more efficient if we already have them.
                            But `AdvancedTranscriptViewer` is designed to parse raw text.
                            
                            Wait, I can modify `AdvancedTranscriptViewer` to accept `segments` prop as override?
                            Or just rely on the content string reconstruction which I did above.
                            
                            The `AdvancedTranscriptViewer` uses `onUpdateTranscript` to pass back edits.
                            
                            For now, relying on string reconstruction `transcriptContent` is fine, 
                            as long as `AdvancedTranscriptViewer` can parse it back to segments.
                         */}
                        <AdvancedTranscriptViewer
                            content={transcriptContent}
                            hideTitle={true}
                            onUpdateTranscript={handleUpdateSegments}
                            onTimeClick={handleTranscriptTimeClick}
                            currentTime={currentTime}
                        />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

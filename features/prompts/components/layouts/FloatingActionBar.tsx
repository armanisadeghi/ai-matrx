"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, SlidersHorizontal, Plus, X, Mic } from "lucide-react";
import { useRecordAndTranscribe } from "@/features/audio/hooks/useRecordAndTranscribe";
import { Button } from "@/components/ui/button";
import { TranscriptionResult } from "@/features/audio/types";
import { RecordingOverlay } from "@/features/audio/components/RecordingOverlay";
import { TranscriptionLoader } from "@/features/audio/components/TranscriptionLoader";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

interface FloatingActionBarProps {
    searchValue: string;
    onSearchChange: (value: string) => void;
    onFilterClick: () => void;
    onNewClick: () => void;
    showFilterBadge?: boolean;
}

export function FloatingActionBar({
    searchValue,
    onSearchChange,
    onFilterClick,
    onNewClick,
    showFilterBadge = false,
}: FloatingActionBarProps) {
    const isMobile = useIsMobile();
    const [isSearchActive, setIsSearchActive] = useState(false);
    const [localSearchValue, setLocalSearchValue] = useState(searchValue);

    useEffect(() => {
        setLocalSearchValue(searchValue);
    }, [searchValue]);

    // Handle transcription completion
    const handleTranscriptionComplete = useCallback((result: TranscriptionResult) => {
        if (result.success && result.text) {
            setIsSearchActive(true);
            handleSearchChange(result.text);
        }
    }, []);

    // Recording and transcription hook
    const {
        isRecording,
        isPaused,
        isTranscribing,
        duration,
        audioLevel,
        startRecording,
        stopRecording,
        pauseRecording,
        resumeRecording,
        reset,
    } = useRecordAndTranscribe({
        onTranscriptionComplete: handleTranscriptionComplete,
        onError: (error) => {
            console.error('Voice input error:', error);
            toast.error('Voice input failed', { description: error, duration: 8000 });
        },
        autoTranscribe: true,
    });

    // Only show on mobile
    if (!isMobile) {
        return null;
    }

    const handleSearchActivate = () => {
        setIsSearchActive(true);
    };

    const handleSearchCancel = () => {
        setIsSearchActive(false);
        setLocalSearchValue("");
        onSearchChange("");
    };

    const handleSearchChange = (value: string) => {
        setLocalSearchValue(value);
        onSearchChange(value);
    };

    const handleMicClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isRecording && !isTranscribing) {
            await startRecording();
        }
    };

    // Show recording overlay if recording
    if (isRecording) {
        return (
            <RecordingOverlay
                duration={duration}
                audioLevel={audioLevel}
                isPaused={isPaused}
                onStop={stopRecording}
                onPause={pauseRecording}
                onResume={resumeRecording}
                onCancel={reset}
            />
        );
    }

    // Show transcribing state
    if (isTranscribing) {
        return (
            <>
                <div className="fixed inset-0 bg-background/60 backdrop-blur-md z-50" />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="matrx-glass-thin-border rounded-3xl p-8 flex flex-col items-center gap-4">
                        <TranscriptionLoader duration={duration} size="lg" />
                        <div className="text-sm text-muted-foreground">
                            Transcribing...
                        </div>
                    </div>
                </div>
            </>
        );
    }

    // Default state - compact bar with matrx-glass-thin-border elements
    if (!isSearchActive) {
        return (
            <>
                <div className="fixed bottom-0 left-0 right-0 pb-safe z-40">
                    <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 max-w-[1800px] pb-4">
                        <div className="flex items-center gap-2 p-2">
                            {/* Filter Button — matrx-glass-thin-border pill */}
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onFilterClick}
                                className="h-10 w-10 flex-shrink-0 matrx-glass-thin-border relative border-0"
                            >
                                <SlidersHorizontal className="h-5 w-5" />
                                {showFilterBadge && (
                                    <span className="absolute top-1 right-1 h-2 w-2 bg-primary rounded-full" />
                                )}
                            </Button>

                            {/* Compact Search Bar — matrx-glass-thin-border */}
                            <button
                                onClick={handleSearchActivate}
                                className="flex-1 flex items-center gap-2 h-10 px-3 rounded-full matrx-glass-thin-border transition-colors"
                            >
                                <Search className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground truncate">
                                    {localSearchValue || "Search prompts..."}
                                </span>
                                <button
                                    onClick={handleMicClick}
                                    className="ml-auto p-1.5 rounded-full matrx-glass-card transition-colors"
                                >
                                    <Mic className="h-4 w-4 text-muted-foreground" />
                                </button>
                            </button>

                            {/* New Button — solid primary accent */}
                            <Button
                                size="icon"
                                onClick={onNewClick}
                                className="h-10 w-10 flex-shrink-0 rounded-full bg-primary hover:bg-primary/90"
                            >
                                <Plus className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    // Search Active State - Full width search with matrx-glass-thin-border
    return (
        <>
            {/* Backdrop blur overlay */}
            <div
                className="fixed inset-0 bg-background/60 backdrop-blur-sm z-30"
                onClick={handleSearchCancel}
            />

            {/* Active Search Bar — matrx-glass-thin-border container */}
            <div className="fixed bottom-0 left-0 right-0 pb-safe z-40">
                <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 max-w-[1800px] pb-4">
                    <div className="flex items-center gap-2 p-2 rounded-full matrx-glass-thin-border">
                        {/* Search Input Container */}
                        <div className="flex-1 flex items-center gap-2 h-10 px-3">
                            <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <input
                                type="text"
                                value={localSearchValue}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                placeholder="Search prompts..."
                                autoFocus
                                style={{ fontSize: '16px' }}
                                className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
                            />
                            <button
                                onClick={handleMicClick}
                                className="flex-shrink-0 p-1.5 rounded-full matrx-glass-card transition-colors"
                            >
                                <Mic className="h-4 w-4 text-muted-foreground" />
                            </button>
                        </div>

                        {/* Clear/Cancel Button */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={localSearchValue ? () => handleSearchChange("") : handleSearchCancel}
                            className="h-10 w-10 flex-shrink-0 rounded-full matrx-glass-card border-0"
                        >
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}


"use client";

import { useState, useCallback } from "react";
import { Search, Mic, Plus, X } from "lucide-react";
import { useRecordAndTranscribe } from "@/features/audio/hooks/useRecordAndTranscribe";
import { Button } from "@/components/ui/button";
import { TranscriptionResult } from "@/features/audio/types";
import { RecordingOverlay } from "@/features/audio/components/RecordingOverlay";
import { TranscriptionLoader } from "@/features/audio/components/TranscriptionLoader";
import { toast } from "sonner";

interface DesktopSearchBarProps {
    searchValue: string;
    onSearchChange: (value: string) => void;
    onNewClick: () => void;
    /** @deprecated No longer used — filter button moved to DesktopFilterPanel */
    onFilterClick?: () => void;
    /** @deprecated */
    showFilterBadge?: boolean;
    /** @deprecated */
    activeFilterCount?: number;
}

export function DesktopSearchBar({
    searchValue,
    onSearchChange,
    onNewClick,
}: DesktopSearchBarProps) {
    const [localSearchValue, setLocalSearchValue] = useState(searchValue);

    // Handle transcription completion
    const handleTranscriptionComplete = useCallback((result: TranscriptionResult) => {
        if (result.success && result.text) {
            setLocalSearchValue(result.text);
            onSearchChange(result.text);
        }
    }, [onSearchChange]);

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

    const handleSearchChange = (value: string) => {
        setLocalSearchValue(value);
        onSearchChange(value);
    };

    const handleMicClick = async () => {
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
                <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-50" />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="bg-background/95 backdrop-blur-xl rounded-3xl border border-border/50 shadow-2xl p-8 flex flex-col items-center gap-4">
                        <TranscriptionLoader duration={duration} size="lg" />
                        <div className="text-sm text-muted-foreground">
                            Transcribing...
                        </div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 relative">
                <div className="flex items-center gap-3 p-1 rounded-full matrx-glass-thin-border hover:shadow-xl transition-shadow">
                    <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <input
                        type="text"
                        value={localSearchValue}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        placeholder="Search prompts..."
                        className="flex-1 bg-transparent border-0 outline-none text-base text-foreground placeholder:text-muted-foreground"
                    />
                    {localSearchValue && (
                        <button
                            onClick={() => handleSearchChange("")}
                            className="p-1.5 hover:bg-muted/50 rounded-lg transition-colors flex-shrink-0"
                        >
                            <X className="h-4 w-4 text-muted-foreground" />
                        </button>
                    )}
                    <button
                        onClick={handleMicClick}
                        className="p-1.5 hover:bg-muted/50 rounded-lg transition-colors flex-shrink-0"
                    >
                        <Mic className="h-4 w-4 text-muted-foreground" />
                    </button>
                </div>
            </div>

            <Button
                size="sm"
                onClick={onNewClick}
                className="h-8 px-3 rounded-full matrx-glass-thin-border hover:shadow-xl bg-primary hover:bg-primary/90"
            >
                <Plus className="h-4 w-4" />
                New
            </Button>
        </div>
    );
}


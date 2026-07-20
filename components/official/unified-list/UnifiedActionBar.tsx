"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, SlidersHorizontal, Plus, X, Mic } from "lucide-react";
import { useRecordAndTranscribe } from "@/features/audio/hooks/useRecordAndTranscribe";
import { Button } from "@/components/ui/button";
import { TranscriptionResult } from "@/features/audio/types";
import { toast } from "@/lib/toast";
import { RecordingOverlay } from "@/features/audio/components/RecordingOverlay";
import { TranscriptionLoader } from "@/features/audio/components/TranscriptionLoader";
import { BaseListItem, UnifiedListLayoutConfig } from "./types";

interface UnifiedActionBarProps<T extends BaseListItem> {
    mode: "mobile" | "desktop";
    config: UnifiedListLayoutConfig<T>;
    searchValue: string;
    onSearchChange: (value: string) => void;
    onFilterClick: () => void;
    showFilterBadge?: boolean;
}

/**
 * UnifiedActionBar
 * 
 * Renders the appropriate action bar based on mode (mobile/desktop).
 * 
 * Mobile:
 * - Compact mode: Filter | Search (compact) | Primary Action
 * - Search-active mode: Full-width search input
 * - Recording mode: Voice input overlay
 * - Transcribing mode: Processing overlay
 * 
 * Desktop:
 * - Prominent search bar (flex-1)
 * - Filter button with badge
 * - Action buttons
 * - Voice input integrated
 * 
 * Preserves all features from FloatingActionBar and DesktopSearchBar.
 */
export function UnifiedActionBar<T extends BaseListItem>({
    mode,
    config,
    searchValue,
    onSearchChange,
    onFilterClick,
    showFilterBadge = false,
}: UnifiedActionBarProps<T>) {
    const [isSearchActive, setIsSearchActive] = useState(false);
    const [localSearchValue, setLocalSearchValue] = useState(searchValue);

    useEffect(() => {
        setLocalSearchValue(searchValue);
    }, [searchValue]);

    // Voice input configuration
    const voiceEnabled = config.voice?.enabled ?? config.search.enabled;

    // Handle transcription completion
    const handleTranscriptionComplete = useCallback(
        (result: TranscriptionResult) => {
            if (result.success && result.text) {
                if (mode === "mobile") {
                    setIsSearchActive(true);
                }
                handleSearchChange(result.text);
                
                // Call custom handler if provided
                if (config.voice?.onTranscriptionComplete) {
                    config.voice.onTranscriptionComplete(result.text);
                }
            }
        },
        [mode, config.voice]
    );

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
            console.error("Voice input error:", error);
            toast.error("Voice input failed", { description: error, duration: 8000 });
            if (config.voice?.onError) {
                const err = typeof error === 'string' ? new Error(error) : error;
                config.voice.onError(err);
            }
        },
        autoTranscribe: config.voice?.autoTranscribe ?? true,
    });

    const handleSearchChange = (value: string) => {
        setLocalSearchValue(value);
        onSearchChange(value);
    };

    const handleMicClick = async (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!isRecording && !isTranscribing && voiceEnabled) {
            await startRecording();
        }
    };

    // Show recording overlay if recording
    if (isRecording && voiceEnabled) {
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
    if (isTranscribing && voiceEnabled) {
        return (
            <>
                <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-50" />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="bg-background/95 backdrop-blur-xl rounded-3xl border border-border/50 shadow-2xl p-8 flex flex-col items-center gap-4">
                        <TranscriptionLoader duration={duration} size="lg" />
                        <div className="text-sm text-muted-foreground">Transcribing...</div>
                    </div>
                </div>
            </>
        );
    }

    // ========================================================================
    // MOBILE MODE
    // ========================================================================

    if (mode === "mobile") {
        // Search Active State - Full width search
        if (isSearchActive) {
            return (
                <>
                    {/* Backdrop blur overlay */}
                    <div
                        className="fixed inset-0 bg-background/60 backdrop-blur-sm z-30"
                        onClick={() => {
                            setIsSearchActive(false);
                            setLocalSearchValue("");
                            onSearchChange("");
                        }}
                    />

                    {/* Active Search Bar */}
                    <div className="fixed bottom-0 left-0 right-0 pb-safe z-40">
                        <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 max-w-[1800px] pb-4">
                            <div className="flex items-center gap-2 p-2 rounded-full bg-background/95 backdrop-blur-xl border border-border shadow-2xl">
                                {/* Search Input Container */}
                                <div className="flex-1 flex items-center gap-2 h-10 px-3">
                                    <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    <input
                                        type="text"
                                        value={localSearchValue}
                                        onChange={(e) => handleSearchChange(e.target.value)}
                                        placeholder={config.search.placeholder}
                                        autoFocus
                                        style={{ fontSize: "16px" }}
                                        className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
                                    />
                                    {voiceEnabled && (
                                        <button
                                            onClick={handleMicClick}
                                            className="flex-shrink-0 p-1 hover:bg-muted/30 rounded-full transition-colors"
                                        >
                                            <Mic className="h-4 w-4 text-muted-foreground" />
                                        </button>
                                    )}
                                </div>

                                {/* Clear/Cancel Button */}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        if (localSearchValue) {
                                            handleSearchChange("");
                                        } else {
                                            setIsSearchActive(false);
                                        }
                                    }}
                                    className="h-10 w-10 flex-shrink-0 rounded-full"
                                >
                                    <X className="h-5 w-5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </>
            );
        }

        // Compact Mode - Default floating bar
        return (
            <div className="fixed bottom-0 left-0 right-0 pb-safe z-40">
                <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 max-w-[1800px] pb-4">
                    <div className="flex items-center gap-2 p-2 rounded-full bg-background/80 backdrop-blur-xl border border-border/50 shadow-lg">
                        {/* Filter Button */}
                        {config.filters && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onFilterClick}
                                className="h-10 w-10 flex-shrink-0 rounded-full relative"
                            >
                                <SlidersHorizontal className="h-5 w-5" />
                                {showFilterBadge && (
                                    <span className="absolute top-1 right-1 h-2 w-2 bg-primary rounded-full" />
                                )}
                            </Button>
                        )}

                        {/* Compact Search Bar */}
                        <button
                            onClick={() => setIsSearchActive(true)}
                            className="flex-1 flex items-center gap-2 h-10 px-3 rounded-full bg-muted/50 hover:bg-muted/70 transition-colors"
                        >
                            <Search className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground truncate">
                                {localSearchValue || config.search.placeholder}
                            </span>
                            {voiceEnabled && (
                                <button
                                    onClick={handleMicClick}
                                    className="ml-auto p-1 hover:bg-background/50 rounded-full transition-colors"
                                >
                                    <Mic className="h-4 w-4 text-muted-foreground" />
                                </button>
                            )}
                        </button>

                        {/* Primary Action Button (first action marked for mobile) */}
                        {config.actions
                            .filter((action) => action.showOnMobile !== false)
                            .slice(0, 1)
                            .map((action) => (
                                <Button
                                    key={action.id}
                                    size="icon"
                                    onClick={action.onClick}
                                    disabled={action.disabled}
                                    className="h-10 w-10 flex-shrink-0 rounded-full bg-primary hover:bg-primary/90"
                                >
                                    <action.icon className="h-5 w-5" />
                                </Button>
                            ))}
                    </div>
                </div>
            </div>
        );
    }

    // ========================================================================
    // DESKTOP MODE
    // ========================================================================

    return (
        <div className="mb-8">
            {/* Main Search and Action Bar */}
            <div className="flex items-center gap-3">
                {/* Search Container - Prominent and Beautiful */}
                <div className="flex-1 relative">
                    <div className="flex items-center gap-3 p-3 rounded-2xl bg-background/80 backdrop-blur-xl border border-border/50 shadow-lg hover:shadow-xl transition-shadow">
                        <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        <input
                            type="text"
                            value={localSearchValue}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder={config.search.placeholder}
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
                        {voiceEnabled && (
                            <button
                                onClick={() => handleMicClick()}
                                className="p-1.5 hover:bg-muted/50 rounded-lg transition-colors flex-shrink-0"
                            >
                                <Mic className="h-4 w-4 text-muted-foreground" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Filter Button */}
                {config.filters && (
                    <Button
                        variant="outline"
                        size="lg"
                        onClick={onFilterClick}
                        className="h-[52px] px-5 rounded-2xl border-border/50 shadow-lg hover:shadow-xl backdrop-blur-xl bg-background/80 relative"
                    >
                        <SlidersHorizontal className="h-5 w-5 mr-2" />
                        Filter
                        {showFilterBadge && (
                            <span className="absolute top-2 right-2 h-2 w-2 bg-primary rounded-full" />
                        )}
                    </Button>
                )}

                {/* Action Buttons */}
                {config.actions
                    .filter((action) => action.showOnDesktop !== false)
                    .map((action) => {
                        const Icon = action.icon;
                        const isPrimary = action.variant === "primary" || action.id === "new";
                        
                        // Map 'primary' to 'default' for Button component
                        const buttonVariant = action.variant === "primary" 
                            ? "default" 
                            : action.variant || (isPrimary ? "default" : "outline");

                        return (
                            <Button
                                key={action.id}
                                size="lg"
                                variant={buttonVariant}
                                onClick={action.onClick}
                                disabled={action.disabled}
                                className={`h-[52px] px-5 rounded-2xl shadow-lg hover:shadow-xl ${
                                    isPrimary
                                        ? "bg-primary hover:bg-primary/90"
                                        : "backdrop-blur-xl bg-background/80"
                                }`}
                                title={action.tooltip}
                            >
                                <Icon className="h-5 w-5 mr-2" />
                                {action.label}
                                {action.badge && (
                                    <span className="ml-2 px-2 py-0.5 text-xs bg-primary/20 rounded-full">
                                        {action.badge}
                                    </span>
                                )}
                            </Button>
                        );
                    })}
            </div>
        </div>
    );
}


"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, SlidersHorizontal, Plus, X, Mic, Loader2 } from "lucide-react";
import { useRecordAndTranscribe } from "@/features/audio/hooks/useRecordAndTranscribe";
import { Button } from "@/components/ui/button";
import { TranscriptionResult } from "@/features/audio/types";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileActionBarProps } from "./types";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * MobileActionBar - Reusable mobile search/filter/action component
 *
 * Features:
 * - Search with voice input support
 * - Filter button with badge indicator
 * - Primary action button (e.g., "New", "Add", etc.)
 * - No backdrop on search (results remain visible)
 * - Proper mobile UX with safe area padding
 *
 * @example
 * ```tsx
 * <MobileActionBar
 *   searchValue={searchTerm}
 *   onSearchChange={setSearchTerm}
 *   totalCount={prompts.length}
 *   filteredCount={filteredPrompts.length}
 *   onPrimaryAction={() => setIsNewModalOpen(true)}
 *   primaryActionLabel="New Prompt"
 *   primaryActionIcon={<Plus />}
 *   showFilterButton
 *   showVoiceSearch
 *   isFilterModalOpen={isFilterModalOpen}
 *   setIsFilterModalOpen={setIsFilterModalOpen}
 * />
 * ```
 */
export function MobileActionBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  totalCount,
  filteredCount,
  onPrimaryAction,
  primaryActionLabel,
  primaryActionIcon = <Plus className="h-5 w-5" />,
  showFilterButton = true,
  showVoiceSearch = true,
  isFilterModalOpen = false,
  setIsFilterModalOpen,
}: MobileActionBarProps) {
  const isMobile = useIsMobile();
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [localSearchValue, setLocalSearchValue] = useState(searchValue);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalSearchValue(searchValue);
  }, [searchValue]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setLocalSearchValue(value);
      onSearchChange(value);
    },
    [onSearchChange],
  );

  // Handle transcription completion - controlled input pattern
  const handleTranscriptionComplete = useCallback(
    (result: TranscriptionResult) => {
      if (result.success && result.text) {
        // Activate search view to show input
        setIsSearchActive(true);

        // Update React state - let React handle the DOM
        const newValue = result.text;
        setLocalSearchValue(newValue);
        onSearchChange(newValue);
      }
    },
    [onSearchChange],
  );

  // Recording and transcription hook
  const {
    isRecording,
    isTranscribing,
    audioLevel,
    startRecording,
    stopRecording,
  } = useRecordAndTranscribe({
    onTranscriptionComplete: handleTranscriptionComplete,
    onError: (error) => {
      console.error("Voice input error:", error);
      toast.error("Voice input failed", { description: error, duration: 8000 });
    },
    autoTranscribe: true,
  });

  // Show recording or transcribing state inline - no heavy modals
  const isVoiceActive = isRecording || isTranscribing;

  // Auto-activate search when voice recording starts
  // IMPORTANT: This hook must be called before any conditional returns (Rules of Hooks)
  useEffect(() => {
    if (isVoiceActive && !isSearchActive) {
      setIsSearchActive(true);
    }
  }, [isVoiceActive, isSearchActive]);

  // All callbacks must be defined before conditional return (Rules of Hooks)
  const handleMicClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isRecording) {
        stopRecording();
      } else if (!isTranscribing) {
        await startRecording();
      }
    },
    [isRecording, isTranscribing, startRecording, stopRecording],
  );

  // Only show on mobile - conditional return AFTER all hooks
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

  const handleFilterClick = () => {
    if (setIsFilterModalOpen) {
      setIsFilterModalOpen(true);
    }
  };

  // Determine if there are active filters (filtered count differs from total)
  const hasActiveFilters = filteredCount !== totalCount || searchValue !== "";

  // Default state - compact bar
  if (!isSearchActive) {
    return (
      <div className="fixed bottom-0 left-0 right-0 pb-safe z-40">
        <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 max-w-[1800px]">
          <div className="flex items-center gap-2 p-2 rounded-full matrx-glass-core">
            {/* Filter Button */}
            {showFilterButton && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleFilterClick}
                className="h-10 w-10 flex-shrink-0 rounded-full matrx-shell-glass relative"
              >
                <SlidersHorizontal className="h-5 w-5" />
                {hasActiveFilters && (
                  <span className="absolute top-1 right-1 h-2 w-2 bg-primary rounded-full" />
                )}
              </Button>
            )}

            {/* Compact Search Bar */}
            <div
              onClick={handleSearchActivate}
              className="flex-1 flex items-center gap-2 h-10 px-3 rounded-full matrx-shell-glass cursor-pointer"
            >
              <Search className="h-4 w-4 text-glass-foreground" />
              <span className="text-sm text-glass-foreground truncate">
                {localSearchValue || searchPlaceholder}
              </span>
              {showVoiceSearch && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMicClick(e);
                  }}
                  className="ml-auto p-1 hover:bg-background/50 rounded-full transition-colors"
                >
                  <Mic className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Primary Action Button */}
            {onPrimaryAction && (
              <Button
                size="icon"
                onClick={onPrimaryAction}
                className="h-10 w-10 flex-shrink-0 rounded-full matrx-shell-glass bg-primary hover:bg-primary/90"
                aria-label={primaryActionLabel}
              >
                {primaryActionIcon}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Search Active State - MOVED TO TOP for mobile keyboard visibility
  // KEY UX FIX: Fixed to top instead of bottom so keyboard doesn't cover it
  return (
    <div className="fixed top-0 left-0 right-0 z-50 matrx-shell-glass">
      <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 max-w-[1800px] py-3">
        <div className="flex items-center gap-2 p-2 rounded-full matrx-shell-glass">
          {/* Search Input Container */}
          <div className="flex-1 flex items-center gap-2 h-10 px-3">
            <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={localSearchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              autoFocus
              style={{ fontSize: "16px" }}
              className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
            />
            {showVoiceSearch && (
              <button
                type="button"
                onClick={handleMicClick}
                disabled={isTranscribing && !isRecording}
                className={cn(
                  "flex-shrink-0 p-1.5 rounded-full transition-colors",
                  isRecording
                    ? "bg-red-100 dark:bg-red-900/30"
                    : isTranscribing
                      ? "bg-blue-100 dark:bg-blue-900/30 cursor-not-allowed opacity-50"
                      : "hover:bg-muted/30",
                )}
              >
                {isTranscribing && !isRecording ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                ) : (
                  <Mic
                    className={cn(
                      "h-4 w-4",
                      isRecording
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground",
                    )}
                    style={
                      isRecording
                        ? {
                            filter: `drop-shadow(0 0 ${Math.min(audioLevel / 10, 8)}px currentColor)`,
                          }
                        : undefined
                    }
                  />
                )}
              </button>
            )}
          </div>

          {/* Clear/Cancel Button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={
              localSearchValue
                ? () => handleSearchChange("")
                : handleSearchCancel
            }
            className="h-10 w-10 flex-shrink-0 rounded-full"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Recording/Transcribing Indicator - Inline below search bar */}
        {isVoiceActive && (
          <div
            className={cn(
              "mt-2 flex items-center gap-2 px-4 py-2 rounded-lg",
              isRecording
                ? "bg-red-100 dark:bg-red-900/30"
                : "bg-blue-100 dark:bg-blue-900/30",
            )}
          >
            {isRecording ? (
              <>
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="w-2 h-2 bg-red-500 rounded-full"
                />
                <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                  Recording...
                </span>
              </>
            ) : (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
                <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                  Transcribing...
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  BookOpen,
  Grid2x2,
  LayoutList,
  Maximize2,
  X,
  ExternalLink,
  Printer,
  Smartphone,
  Zap,
} from "lucide-react";
import ChatCollapsibleWrapper from "@/components/mardown-display/blocks/ChatCollapsibleWrapper";
import FlashcardItem from "./FlashcardItem";
import FlashcardMobileView from "./FlashcardMobileView";
import { parseFlashcards } from "./flashcard-parser";
import { Button } from "@/components/ui/button";
import { cn } from "@/styles/themes/utils";
import { useOpenArtifactInCanvas } from "@/features/canvas/hooks/useOpenArtifactInCanvas";
import { InlineArtifactDebugStrip } from "@/features/canvas/components/CanvasArtifactDebugPanel";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import type { FlashcardsBlockData } from "@/types/python-generated/stream-events";
import { flashcardsPrinter } from "./flashcards-printer";
import {
  PrintOptionsDialog,
  usePrintOptions,
} from "@/lib/block-print/PrintOptionsDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSearchParams } from "next/navigation";

interface FlashcardsBlockProps {
  content?: string;
  serverData?: FlashcardsBlockData;
  taskId?: string;
  className?: string;
  /** Persisted canvas_items UUID when materialized. */
  artifactId?: string;
  messageId?: string;
  conversationId?: string;
  blockIndex?: number;
}

function cardsToMarkdown(
  cards: Array<{ front?: string | null; back?: string | null }>,
): string {
  return cards
    .filter((c) => c.front && c.back)
    .map((c) => `Front: ${c.front}\nBack: ${c.back}\n---`)
    .join("\n");
}

type LayoutMode = "grid" | "list";

interface LayoutToggleProps {
  layoutMode: LayoutMode;
  onLayoutChange: (mode: LayoutMode) => void;
  onMobileView: () => void;
  size?: "sm" | "xs";
}

const LayoutToggle: React.FC<LayoutToggleProps> = ({
  layoutMode,
  onLayoutChange,
  onMobileView,
  size = "sm",
}) => {
  const btnClass = size === "xs" ? "h-7 w-7 p-0" : "h-7 w-7 p-0";
  const iconClass = size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <div className="flex gap-1">
      <Button
        variant="ghost"
        size="sm"
        className={cn(btnClass, layoutMode === "grid" && "bg-accent")}
        onClick={(e) => {
          e.stopPropagation();
          onLayoutChange("grid");
        }}
        title="Grid view (2 columns)"
      >
        <Grid2x2 className={iconClass} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn(btnClass, layoutMode === "list" && "bg-accent")}
        onClick={(e) => {
          e.stopPropagation();
          onLayoutChange("list");
        }}
        title="List view (1 per row)"
      >
        <LayoutList className={iconClass} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={btnClass}
        onClick={(e) => {
          e.stopPropagation();
          onMobileView();
        }}
        title="Mobile swipe mode"
      >
        <Smartphone className={iconClass} />
      </Button>
    </div>
  );
};

const FlashcardsBlock: React.FC<FlashcardsBlockProps> = ({
  content,
  serverData,
  taskId,
  className,
  artifactId,
  messageId,
  conversationId,
  blockIndex,
}) => {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("grid");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [mobileStartIndex, setMobileStartIndex] = useState(0);
  const [showMobilePrompt, setShowMobilePrompt] = useState(false);
  const {
    openArtifact,
    busy: openingCanvas,
    lastResult,
  } = useOpenArtifactInCanvas();
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const stabilityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptedRef = useRef(false);

  // Use server-parsed data when available; fall back to client-side parsing.
  const { flashcards, isComplete } = useMemo(() => {
    if (serverData) {
      return {
        flashcards: serverData.cards ?? [],
        isComplete: serverData.isComplete ?? false,
      };
    }
    const parsed = parseFlashcards(content ?? "");
    return {
      flashcards: parsed.flashcards,
      isComplete: parsed.isComplete,
    };
  }, [content, serverData]);

  const completeCount = flashcards.length;

  const rawPayload =
    content?.trim() ||
    (flashcards.length > 0 ? cardsToMarkdown(flashcards) : "");

  const handleOpenInCanvas = () => {
    if (!rawPayload) return;
    void openArtifact({
      canvasType: "flashcards",
      title: "Flashcards",
      content: rawPayload,
      messageId,
      conversationId,
      artifactId: isMaterializedArtifactId(artifactId) ? artifactId : undefined,
      artifactIndex: blockIndex != null ? blockIndex + 1 : 1,
    });
  };

  // Print integration
  const printData = useMemo(
    () => (serverData ? serverData : { cards: flashcards }),
    [serverData, flashcards],
  );
  const {
    open: printOpen,
    setOpen: setPrintOpen,
    triggerPrint,
  } = usePrintOptions(flashcardsPrinter, printData);

  // Mobile "Flash Mode" prompt — fires once when stable (no count change for 1s) and not streaming
  useEffect(() => {
    if (!isMobile || promptedRef.current || flashcards.length === 0) return undefined;
    if (stabilityTimer.current) clearTimeout(stabilityTimer.current);
    stabilityTimer.current = setTimeout(() => {
      // Double-check still stable and complete enough (isComplete OR at least 3 cards settled)
      if (!promptedRef.current && flashcards.length >= 1) {
        promptedRef.current = true;
        setShowMobilePrompt(true);
        // Auto-dismiss after 8s if ignored
        setTimeout(() => setShowMobilePrompt(false), 8000);
      }
    }, 1000);
    return () => {
      if (stabilityTimer.current) clearTimeout(stabilityTimer.current);
    };
  }, [isMobile, flashcards.length, isComplete]);

  // Auto-enter flash mode when URL contains ?mode=flash
  useEffect(() => {
    if (
      searchParams.get("mode") === "flash" &&
      flashcards.length > 0 &&
      !isMobileView
    ) {
      setMobileStartIndex(0);
      setIsMobileView(true);
      // Suppress the mobile prompt since we're already entering flash mode
      promptedRef.current = true;
    }
  }, [searchParams, flashcards.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle ESC key to exit fullscreen
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    if (isFullscreen) {
      document.addEventListener("keydown", handleEscape);
      // Prevent body scroll when fullscreen
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isFullscreen]);

  // A card with back=null is in the Loader Exception state (front received, back still streaming).
  const hasStreamingCard =
    !isComplete &&
    flashcards.some((c) => c.back === null || c.back === undefined);

  const renderFlashcards = () => (
    <div
      className={cn(
        "gap-2",
        isFullscreen ? "p-2 sm:p-4" : "p-0.5",
        layoutMode === "grid"
          ? "grid grid-cols-1 md:grid-cols-2"
          : "flex flex-col",
      )}
    >
      {flashcards.map((card, index) => (
        <FlashcardItem
          key={`flashcard-${index}`}
          front={card.front ?? ""}
          back={card.back ?? null}
          index={index}
          layoutMode={layoutMode}
        />
      ))}

      {/* Show incoming-card placeholder when not complete and no card with back=null yet */}
      {!isComplete && !hasStreamingCard && flashcards.length > 0 && (
        <div
          className={cn(
            "relative w-full h-48 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg flex items-center justify-center animate-pulse",
            layoutMode === "list" && "max-w-full",
          )}
          aria-label="Loading next flashcard"
        >
          <div className="text-center text-gray-500 dark:text-gray-400">
            <BookOpen className="h-8 w-8 mx-auto mb-2 animate-pulse" />
            <div className="text-sm">Loading flashcard...</div>
          </div>
        </div>
      )}
    </div>
  );

  // Mobile one-at-a-time swipe view
  if (isMobileView && flashcards.length > 0) {
    return (
      <FlashcardMobileView
        cards={flashcards.map((c) => ({
          front: c.front ?? "",
          back: c.back ?? null,
        }))}
        initialIndex={mobileStartIndex}
        onClose={() => setIsMobileView(false)}
      />
    );
  }

  // Fullscreen overlay
  if (isFullscreen) {
    return (
      <>
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="h-full flex flex-col">
            {/* Fullscreen header */}
            <div className="flex items-center justify-between p-3 border-b border-border bg-background/50">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <span className="font-medium">
                  {isComplete && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({completeCount} {completeCount === 1 ? "card" : "cards"})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <LayoutToggle
                  layoutMode={layoutMode}
                  onLayoutChange={setLayoutMode}
                  onMobileView={() => {
                    setIsFullscreen(false);
                    setMobileStartIndex(0);
                    setIsMobileView(true);
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => triggerPrint()}
                  title="Print flashcards"
                >
                  <Printer className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 bg-purple-500 dark:bg-purple-600 hover:bg-purple-600 dark:hover:bg-purple-700 text-white"
                  onClick={() => {
                    setIsFullscreen(false);
                    handleOpenInCanvas();
                  }}
                  title="Open in side panel"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setIsFullscreen(false)}
                  title="Exit fullscreen (ESC)"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Fullscreen content */}
            <div className="flex-1 overflow-y-auto">
              {renderFlashcards()}
              {flashcards.length === 0 && (
                <div className="text-center text-gray-500 dark:text-gray-400 p-8">
                  No flashcards available yet...
                </div>
              )}
            </div>

            {/* Fullscreen footer */}
            {flashcards.length > 0 && (
              <div className="flex justify-center items-center gap-3 p-3 border-t border-border bg-background/50">
                <LayoutToggle
                  layoutMode={layoutMode}
                  onLayoutChange={setLayoutMode}
                  onMobileView={() => {
                    setIsFullscreen(false);
                    setMobileStartIndex(0);
                    setIsMobileView(true);
                  }}
                  size="xs"
                />
                <div className="h-4 w-px bg-border" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={triggerPrint}
                >
                  <Printer className="h-3 w-3" />
                  Print
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs bg-purple-500 dark:bg-purple-600 hover:bg-purple-600 dark:hover:bg-purple-700 text-white"
                  onClick={() => {
                    setIsFullscreen(false);
                    handleOpenInCanvas();
                  }}
                >
                  <ExternalLink className="h-3 w-3" />
                  Side
                </Button>
              </div>
            )}
          </div>
        </div>

        <PrintOptionsDialog
          printer={flashcardsPrinter}
          data={printData}
          open={printOpen}
          onOpenChange={setPrintOpen}
        />

        {/* Mobile Flash Mode prompt banner */}
        {showMobilePrompt && (
          <div className="fixed bottom-0 left-0 right-0 z-[60] pb-safe animate-in slide-in-from-bottom duration-300">
            <div className="mx-3 mb-3 rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-900 border border-blue-700/50 shadow-2xl p-4">
              <button
                onClick={() => setShowMobilePrompt(false)}
                className="absolute top-3 right-3 p-1 text-white/40 hover:text-white/80"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex items-start gap-3 pr-6">
                <div className="mt-0.5 p-2 rounded-xl bg-blue-800/60">
                  <Zap className="h-5 w-5 text-blue-300" />
                </div>
                <div className="flex-1">
                  <p className="text-white font-semibold text-sm">Flash Mode</p>
                  <p className="text-blue-200/70 text-xs mt-0.5 leading-relaxed">
                    Study one card at a time — tap to flip, swipe to navigate.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => {
                        setShowMobilePrompt(false);
                        setIsFullscreen(false);
                        setMobileStartIndex(0);
                        setIsMobileView(true);
                      }}
                      className="flex-1 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold transition-colors"
                    >
                      Enter Flash Mode
                    </button>
                    <button
                      onClick={() => setShowMobilePrompt(false)}
                      className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 text-sm transition-colors"
                    >
                      Not now
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Normal embedded view
  return (
    <>
      <InlineArtifactDebugStrip
        label="flashcards block"
        artifactId={artifactId ?? lastResult?.artifactId}
        messageId={messageId}
        conversationId={conversationId}
        lastSteps={lastResult?.steps}
        lastErrors={lastResult?.errors}
        busy={openingCanvas}
      />
      <ChatCollapsibleWrapper
        className={className}
        icon={<BookOpen className="h-4 w-4 text-primary" />}
        title={<span>{completeCount}</span>}
        controls={
          <>
            <LayoutToggle
              layoutMode={layoutMode}
              onLayoutChange={setLayoutMode}
              onMobileView={() => {
                setMobileStartIndex(0);
                setIsMobileView(true);
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                triggerPrint();
              }}
              title="Print flashcards"
            >
              <Printer className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 bg-purple-500 dark:bg-purple-600 hover:bg-purple-600 dark:hover:bg-purple-700 text-white"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenInCanvas();
              }}
              disabled={openingCanvas}
              title="Open in side panel"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={(e) => {
                e.stopPropagation();
                setIsFullscreen(true);
              }}
              title="Fullscreen mode"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </>
        }
        initialOpen={true}
      >
        {renderFlashcards()}

        {flashcards.length === 0 && (
          <div className="text-center text-gray-500 dark:text-gray-400 p-8">
            No flashcards available yet...
          </div>
        )}

        {/* Bottom controls */}
        {flashcards.length > 0 && (
          <div className="flex justify-center items-center gap-3 pb-4 pt-2">
            <div className="flex items-center gap-2">
              <LayoutToggle
                layoutMode={layoutMode}
                onLayoutChange={setLayoutMode}
                onMobileView={() => {
                  setMobileStartIndex(0);
                  setIsMobileView(true);
                }}
                size="xs"
              />
            </div>
            <div className="h-4 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={triggerPrint}
            >
              <Printer className="h-3 w-3" />
              Print
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs bg-purple-500 dark:bg-purple-600 hover:bg-purple-600 dark:hover:bg-purple-700 text-white"
              onClick={() => handleOpenInCanvas()}
            >
              <ExternalLink className="h-3 w-3" />
              Side
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setIsFullscreen(true)}
            >
              <Maximize2 className="h-3 w-3" />
              Full
            </Button>
          </div>
        )}
      </ChatCollapsibleWrapper>

      <PrintOptionsDialog
        printer={flashcardsPrinter}
        data={printData}
        open={printOpen}
        onOpenChange={setPrintOpen}
      />

      {/* Mobile Flash Mode prompt banner */}
      {showMobilePrompt && (
        <div className="fixed bottom-0 left-0 right-0 z-50 pb-safe animate-in slide-in-from-bottom duration-300">
          <div className="mx-3 mb-3 rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-900 border border-blue-700/50 shadow-2xl p-4">
            <button
              onClick={() => setShowMobilePrompt(false)}
              className="absolute top-3 right-3 p-1 text-white/40 hover:text-white/80"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-3 pr-6">
              <div className="mt-0.5 p-2 rounded-xl bg-blue-800/60">
                <Zap className="h-5 w-5 text-blue-300" />
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">Flash Mode</p>
                <p className="text-blue-200/70 text-xs mt-0.5 leading-relaxed">
                  Study one card at a time — tap to flip, swipe to navigate.
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => {
                      setShowMobilePrompt(false);
                      setMobileStartIndex(0);
                      setIsMobileView(true);
                    }}
                    className="flex-1 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold transition-colors"
                  >
                    Enter Flash Mode
                  </button>
                  <button
                    onClick={() => setShowMobilePrompt(false)}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 text-sm transition-colors"
                  >
                    Not now
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FlashcardsBlock;

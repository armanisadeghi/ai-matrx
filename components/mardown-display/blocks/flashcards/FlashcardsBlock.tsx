"use client";
import React, { useEffect, useRef, useState } from "react";
import { BookOpen, X, Zap } from "lucide-react";
import ChatCollapsibleWrapper from "@/components/mardown-display/blocks/ChatCollapsibleWrapper";
import FlashcardMobileView from "./FlashcardMobileView";
import {
  toFlashcardMobileCards,
  useAutoFlashcardMobileView,
} from "./flashcard-mobile-bridge";
import {
  FlashcardsSetBody,
  FlashcardsSetControls,
  useFlashcardsSet,
} from "./flashcards-set-parts";
import { InlineArtifactDebugStrip } from "@/features/canvas/components/CanvasArtifactDebugPanel";
import type { FlashcardsBlockData } from "@/types/python-generated/stream-events";
import { flashcardsPrinter } from "./flashcards-printer";
import { PrintOptionsDialog } from "@/lib/block-print/PrintOptionsDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSearchParams } from "next/navigation";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";
import { useOpenFlashcardsBlockWindow } from "@/features/overlays/openers/flashcardsBlockWindow";

interface FlashcardsBlockProps {
  content?: string;
  serverData?: FlashcardsBlockData;
  /** Optional JSON merged into each card's additionalDetails (pre-parsed paths only). */
  additionalDetails?: Record<string, unknown>;
  taskId?: string;
  className?: string;
  /** Persisted canvas_items UUID when materialized. */
  artifactId?: string;
  messageId?: string;
  conversationId?: string;
  blockIndex?: number;
}

const FlashcardsBlock: React.FC<FlashcardsBlockProps> = ({
  content,
  serverData,
  additionalDetails: blockAdditionalDetails,
  taskId: _taskId,
  className,
  artifactId,
  messageId,
  conversationId,
  blockIndex,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMobilePrompt, setShowMobilePrompt] = useState(false);
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const isAdmin = useAppSelector(selectIsAdmin);
  const openFlashcardsBlockWindow = useOpenFlashcardsBlockWindow();
  const stabilityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptedRef = useRef(false);

  const set = useFlashcardsSet({
    content,
    serverData,
    additionalDetails: blockAdditionalDetails,
    artifactId,
    messageId,
    conversationId,
    blockIndex,
  });

  const {
    isMobileView,
    enterMobileView,
    exitMobileView,
    mobileStartIndex,
    dismissed: mobileDismissed,
  } = useAutoFlashcardMobileView(set.flashcards.length, {
    enabled: !isFullscreen,
  });

  const handleOpenInWindow = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    openFlashcardsBlockWindow({
      content: content ?? set.rawPayload ?? null,
      serverData:
        serverData ??
        (set.flashcards.length > 0
          ? {
              cards: set.flashcards.map((card) => ({
                front: card.front ?? "",
                back: card.back ?? null,
              })),
              isComplete: set.isComplete,
            }
          : null),
      additionalDetails: blockAdditionalDetails ?? null,
      taskId: _taskId ?? null,
      artifactId: artifactId ?? null,
      messageId: messageId ?? null,
      conversationId: conversationId ?? null,
      blockIndex: blockIndex ?? null,
      title: `Flashcards (${set.completeCount})`,
    });
  };

  useEffect(() => {
    if (
      !isMobile ||
      promptedRef.current ||
      mobileDismissed ||
      set.flashcards.length === 0
    )
      return undefined;
    if (stabilityTimer.current) clearTimeout(stabilityTimer.current);
    stabilityTimer.current = setTimeout(() => {
      if (!promptedRef.current && set.flashcards.length >= 1) {
        promptedRef.current = true;
        setShowMobilePrompt(true);
        setTimeout(() => setShowMobilePrompt(false), 8000);
      }
    }, 1000);
    return () => {
      if (stabilityTimer.current) clearTimeout(stabilityTimer.current);
    };
  }, [isMobile, mobileDismissed, set.flashcards.length, set.isComplete]);

  useEffect(() => {
    if (
      searchParams.get("mode") === "flash" &&
      set.flashcards.length > 0 &&
      !isMobileView
    ) {
      enterMobileView(0);
      promptedRef.current = true;
    }
  }, [searchParams, set.flashcards.length, isMobileView, enterMobileView]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    if (isFullscreen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isFullscreen]);

  const enterFlashMode = (index = 0) => {
    enterMobileView(index);
  };

  const mobileFlashcards = toFlashcardMobileCards(set.flashcards);

  if (isMobileView && set.flashcards.length > 0) {
    return (
      <FlashcardMobileView
        cards={mobileFlashcards}
        initialIndex={mobileStartIndex}
        onClose={exitMobileView}
      />
    );
  }

  if (isFullscreen) {
    return (
      <>
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border bg-background/50 p-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <span className="font-medium">
                  {set.isComplete && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({set.completeCount}{" "}
                      {set.completeCount === 1 ? "card" : "cards"})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <FlashcardsSetControls
                  layoutMode={set.layoutMode}
                  onLayoutChange={set.setLayoutMode}
                  onMobileView={() => {
                    setIsFullscreen(false);
                    enterFlashMode();
                  }}
                  onPrint={set.triggerPrint}
                  onOpenCanvas={() => {
                    setIsFullscreen(false);
                    set.handleOpenInCanvas();
                  }}
                  onOpenInWindow={handleOpenInWindow}
                  isAdmin={isAdmin}
                  showDevWindow
                  size="sm"
                />
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                  onClick={() => setIsFullscreen(false)}
                  title="Exit fullscreen (ESC)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <FlashcardsSetBody
                flashcards={set.flashcards}
                isComplete={set.isComplete}
                layoutMode={set.layoutMode}
                hasStreamingCard={set.hasStreamingCard}
              />
              {set.flashcards.length === 0 && (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  No flashcards available yet...
                </div>
              )}
            </div>

            {set.flashcards.length > 0 && (
              <div className="border-t border-border bg-background/50 p-3">
                <FlashcardsSetControls
                  layoutMode={set.layoutMode}
                  onLayoutChange={set.setLayoutMode}
                  onMobileView={() => {
                    setIsFullscreen(false);
                    enterFlashMode();
                  }}
                  onPrint={set.triggerPrint}
                  onOpenCanvas={() => {
                    setIsFullscreen(false);
                    set.handleOpenInCanvas();
                  }}
                  variant="bar"
                  size="xs"
                />
              </div>
            )}
          </div>
        </div>

        <PrintOptionsDialog
          printer={flashcardsPrinter}
          data={set.printData}
          open={set.printOpen}
          onOpenChange={set.setPrintOpen}
        />

        {showMobilePrompt && (
          <MobileFlashPrompt
            onDismiss={() => setShowMobilePrompt(false)}
            onEnter={() => {
              setShowMobilePrompt(false);
              setIsFullscreen(false);
              enterFlashMode();
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <InlineArtifactDebugStrip
        label="flashcards block"
        artifactId={artifactId ?? set.lastResult?.artifactId}
        messageId={messageId}
        conversationId={conversationId}
        lastSteps={set.lastResult?.steps}
        lastErrors={set.lastResult?.errors}
        busy={set.openingCanvas}
      />
      <ChatCollapsibleWrapper
        className={className}
        icon={<BookOpen className="h-4 w-4 text-primary" />}
        title={<span>{set.completeCount}</span>}
        controls={
          <FlashcardsSetControls
            layoutMode={set.layoutMode}
            onLayoutChange={set.setLayoutMode}
            onMobileView={enterFlashMode}
            onPrint={set.triggerPrint}
            onOpenCanvas={set.handleOpenInCanvas}
            openingCanvas={set.openingCanvas}
            onFullscreen={() => setIsFullscreen(true)}
            onOpenInWindow={handleOpenInWindow}
            isAdmin={isAdmin}
            showFullscreen
            showDevWindow
          />
        }
        initialOpen={true}
      >
        <FlashcardsSetBody
          flashcards={set.flashcards}
          isComplete={set.isComplete}
          layoutMode={set.layoutMode}
          hasStreamingCard={set.hasStreamingCard}
        />

        {set.flashcards.length === 0 && (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No flashcards available yet...
          </div>
        )}

        {set.flashcards.length > 0 && (
          <div className="flex items-center justify-center gap-3 pb-4 pt-2">
            <FlashcardsSetControls
              layoutMode={set.layoutMode}
              onLayoutChange={set.setLayoutMode}
              onMobileView={enterFlashMode}
              onPrint={set.triggerPrint}
              onOpenCanvas={set.handleOpenInCanvas}
              onFullscreen={() => setIsFullscreen(true)}
              showFullscreen
              variant="bar"
              size="xs"
            />
          </div>
        )}
      </ChatCollapsibleWrapper>

      <PrintOptionsDialog
        printer={flashcardsPrinter}
        data={set.printData}
        open={set.printOpen}
        onOpenChange={set.setPrintOpen}
      />

      {showMobilePrompt && (
        <MobileFlashPrompt
          onDismiss={() => setShowMobilePrompt(false)}
          onEnter={() => {
            setShowMobilePrompt(false);
            enterMobileView();
          }}
        />
      )}
    </>
  );
};

function MobileFlashPrompt({
  onDismiss,
  onEnter,
}: {
  onDismiss: () => void;
  onEnter: () => void;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom duration-300 pb-safe">
      <div className="relative mx-3 mb-3 rounded-2xl border border-blue-700/50 bg-gradient-to-r from-blue-900 to-indigo-900 p-4 shadow-2xl">
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-3 top-3 p-1 text-white/40 hover:text-white/80"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3 pr-6">
          <div className="mt-0.5 rounded-xl bg-blue-800/60 p-2">
            <Zap className="h-5 w-5 text-blue-300" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Flash Mode</p>
            <p className="mt-0.5 text-xs leading-relaxed text-blue-200/70">
              Study one card at a time — tap to flip, swipe to navigate.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onEnter}
                className="flex-1 rounded-xl bg-blue-500 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-400"
              >
                Enter Flash Mode
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/20"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FlashcardsBlock;

"use client";

/**
 * FlashcardsBlockWindow — window composition root for a flashcard set.
 *
 * Body: card grid only (no ChatCollapsibleWrapper). Footer: all set controls.
 */

import React, { useEffect } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import FlashcardMobileView from "@/components/mardown-display/blocks/flashcards/FlashcardMobileView";
import {
  FlashcardsSetBody,
  LayoutToggle,
  useFlashcardsSet,
} from "@/components/mardown-display/blocks/flashcards/flashcards-set-parts";
import { PrintOptionsDialog } from "@/lib/block-print/PrintOptionsDialog";
import { flashcardsPrinter } from "@/components/mardown-display/blocks/flashcards/flashcards-printer";
import { Button } from "@/components/ui/button";
import { ExternalLink, Printer } from "lucide-react";
import type { FlashcardsBlockData } from "@/types/python-generated/stream-events";
import {
  toFlashcardMobileCards,
  useFlashcardMobileViewState,
} from "@/components/mardown-display/blocks/flashcards/flashcard-mobile-bridge";
import { useIsMobile } from "@/hooks/use-mobile";

export interface FlashcardsBlockWindowProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  content?: string | null;
  serverData?: FlashcardsBlockData | null;
  additionalDetails?: Record<string, unknown>;
  taskId?: string;
  artifactId?: string;
  messageId?: string;
  conversationId?: string;
  blockIndex?: number;
}

export function FlashcardsBlockWindow({
  isOpen,
  onClose,
  title = "Flashcards",
  content,
  serverData,
  additionalDetails,
  artifactId,
  messageId,
  conversationId,
  blockIndex,
}: FlashcardsBlockWindowProps) {
  const isMobile = useIsMobile();
  const { isMobileView, enterMobileView, exitMobileView, mobileStartIndex } =
    useFlashcardMobileViewState(0);

  const set = useFlashcardsSet({
    content: content ?? undefined,
    serverData: serverData ?? undefined,
    additionalDetails,
    artifactId,
    messageId,
    conversationId,
    blockIndex,
  });

  useEffect(() => {
    if (isOpen && isMobile && set.flashcards.length > 0) {
      enterMobileView(0);
    }
  }, [isOpen, isMobile, set.flashcards.length, enterMobileView]);

  if (!isOpen) return null;

  const { width, height } = computeViewportSize();
  const hasContent = Boolean(
    content || serverData || set.flashcards.length > 0,
  );
  const displayTitle = `${title}${set.completeCount > 0 ? ` (${set.completeCount})` : ""}`;

  if (isMobileView && set.flashcards.length > 0) {
    return (
      <FlashcardMobileView
        cards={toFlashcardMobileCards(set.flashcards)}
        initialIndex={mobileStartIndex}
        onClose={exitMobileView}
      />
    );
  }

  return (
    <>
      <WindowPanel
        id="flashcards-block-window"
        title={displayTitle}
        onClose={onClose}
        overlayId="flashcardsBlockWindow"
        minWidth={400}
        minHeight={320}
        width={width}
        height={height}
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        footerVariant="rich"
        footerLeft={
          hasContent && set.flashcards.length > 0 ? (
            <LayoutToggle
              layoutMode={set.layoutMode}
              onLayoutChange={set.setLayoutMode}
              onMobileView={() => enterMobileView(0)}
              size="xs"
            />
          ) : undefined
        }
        footerRight={
          hasContent && set.flashcards.length > 0 ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={set.triggerPrint}
              >
                <Printer className="h-3 w-3" />
                Print
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs bg-purple-500 dark:bg-purple-600 hover:bg-purple-600 dark:hover:bg-purple-700 text-white"
                onClick={set.handleOpenInCanvas}
                disabled={set.openingCanvas}
              >
                <ExternalLink className="h-3 w-3" />
                Canvas
              </Button>
            </div>
          ) : undefined
        }
      >
        {hasContent ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <FlashcardsSetBody
              flashcards={set.flashcards}
              isComplete={set.isComplete}
              layoutMode={set.layoutMode}
              hasStreamingCard={set.hasStreamingCard}
              compact
            />
            {set.flashcards.length === 0 && (
              <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                No flashcards available yet...
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            No flashcard content to display.
          </div>
        )}
      </WindowPanel>

      <PrintOptionsDialog
        printer={flashcardsPrinter}
        data={set.printData}
        open={set.printOpen}
        onOpenChange={set.setPrintOpen}
      />
    </>
  );
}

function computeViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") {
    return { width: 900, height: 640 };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    width: Math.min(Math.round(vw * 0.85), 1400),
    height: Math.min(Math.round(vh * 0.85), 900),
  };
}

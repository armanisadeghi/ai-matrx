"use client";

/**
 * FlashcardItemWindow — single card fills the window body edge-to-edge.
 */

import React, { useEffect } from "react";
import { Smartphone } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { Button } from "@/components/ui/button";
import FlashcardItem from "@/components/mardown-display/blocks/flashcards/FlashcardItem";
import FlashcardMobileView from "@/components/mardown-display/blocks/flashcards/FlashcardMobileView";
import {
  toFlashcardMobileCards,
  useFlashcardMobileViewState,
} from "@/components/mardown-display/blocks/flashcards/flashcard-mobile-bridge";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ReviewResult } from "@/features/flashcards/types";

export interface FlashcardItemWindowProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  front?: string;
  back?: string | null;
  index?: number;
  layoutMode?: "grid" | "list";
  additionalDetails?: Record<string, unknown>;
  lastResult?: ReviewResult | null;
}

export function FlashcardItemWindow({
  isOpen,
  onClose,
  title,
  front = "",
  back = null,
  index = 0,
  layoutMode = "grid",
  additionalDetails,
  lastResult,
}: FlashcardItemWindowProps) {
  const isMobile = useIsMobile();
  const { isMobileView, enterMobileView, exitMobileView } =
    useFlashcardMobileViewState(0);

  useEffect(() => {
    if (isOpen && isMobile && front) {
      enterMobileView(0);
    }
  }, [isOpen, isMobile, front, enterMobileView]);

  if (!isOpen) return null;

  const displayTitle = title ?? `Flashcard ${index + 1}`;
  const mobileCards = toFlashcardMobileCards([{ front, back }]);

  if (isMobileView && front) {
    return <FlashcardMobileView cards={mobileCards} onClose={exitMobileView} />;
  }

  return (
    <WindowPanel
      id="flashcard-item-window"
      title={displayTitle}
      onClose={onClose}
      overlayId="flashcardItemWindow"
      minWidth={280}
      minHeight={180}
      width={420}
      height={260}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      footerVariant="rich"
      footerRight={
        front ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => enterMobileView(0)}
          >
            <Smartphone className="mr-1 h-3 w-3" />
            Swipe mode
          </Button>
        ) : undefined
      }
    >
      {front ? (
        <FlashcardItem
          front={front}
          back={back}
          index={index}
          layoutMode={layoutMode}
          additionalDetails={additionalDetails}
          lastResult={lastResult}
          presentation="panel"
          showDevWindowTrigger={false}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No flashcard to display.
        </div>
      )}
    </WindowPanel>
  );
}

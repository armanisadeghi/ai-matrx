"use client";

/**
 * FlashcardItemWindow — single card fills the window body edge-to-edge.
 */

import React from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import FlashcardItem from "@/components/mardown-display/blocks/flashcards/FlashcardItem";
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
  if (!isOpen) return null;

  const displayTitle = title ?? `Flashcard ${index + 1}`;

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

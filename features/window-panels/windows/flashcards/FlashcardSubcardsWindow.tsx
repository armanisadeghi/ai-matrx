"use client";

/**
 * FlashcardSubcardsWindow — a parent's nested subcards as a flip-card set.
 */

import React, { useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { FlashcardsSubcardsSet } from "@/components/mardown-display/blocks/flashcards/FlashcardsSubcardsSet";
import { LayoutToggle } from "@/components/mardown-display/blocks/flashcards/flashcards-set-parts";
import type { FlashcardSubcard } from "@/components/mardown-display/blocks/flashcards/flashcard-subcards";
import type { LayoutMode } from "@/components/mardown-display/blocks/flashcards/flashcards-set-parts";
import { subcardsWindowTitle } from "@/components/mardown-display/blocks/flashcards/flashcard-subcards";

export interface FlashcardSubcardsWindowProps {
  isOpen: boolean;
  onClose: () => void;
  subcards?: FlashcardSubcard[] | null;
  title?: string | null;
  parentFront?: string | null;
}

export function FlashcardSubcardsWindow({
  isOpen,
  onClose,
  subcards,
  title,
  parentFront,
}: FlashcardSubcardsWindowProps) {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("grid");
  const cards = subcards ?? [];

  if (!isOpen) return null;

  const { width, height } = computeViewportSize();
  const displayTitle =
    title ?? subcardsWindowTitle(parentFront ?? undefined, cards.length);

  return (
    <WindowPanel
      id="flashcard-subcards-window"
      title={displayTitle}
      onClose={onClose}
      overlayId="flashcardSubcardsWindow"
      minWidth={360}
      minHeight={280}
      width={width}
      height={height}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      footerVariant="rich"
      footerLeft={
        cards.length > 0 ? (
          <LayoutToggle
            layoutMode={layoutMode}
            onLayoutChange={setLayoutMode}
            size="xs"
          />
        ) : undefined
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FlashcardsSubcardsSet
          subcards={cards}
          compact
          layoutMode={layoutMode}
        />
      </div>
    </WindowPanel>
  );
}

function computeViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") {
    return { width: 720, height: 520 };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    width: Math.min(Math.round(vw * 0.7), 960),
    height: Math.min(Math.round(vh * 0.75), 720),
  };
}

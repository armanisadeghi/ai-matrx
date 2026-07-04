"use client";

/**
 * Core renderer for a parent card's subcard set — used inline and in window panels.
 */

import React, { useState } from "react";
import { FlashcardsSetBody, type LayoutMode } from "./flashcards-set-parts";
import type { FlashcardSubcard } from "./flashcard-subcards";

export interface FlashcardsSubcardsSetProps {
  subcards: FlashcardSubcard[];
  /** Window panel: edge-to-edge grid. */
  compact?: boolean;
  /** Initial layout when uncontrolled. */
  defaultLayoutMode?: LayoutMode;
  layoutMode?: LayoutMode;
}

export function FlashcardsSubcardsSet({
  subcards,
  compact = false,
  defaultLayoutMode = "grid",
  layoutMode: controlledLayout,
}: FlashcardsSubcardsSetProps) {
  const [internalLayout, setInternalLayout] =
    useState<LayoutMode>(defaultLayoutMode);
  const layoutMode = controlledLayout ?? internalLayout;

  if (subcards.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        No subcards in this set.
      </div>
    );
  }

  return (
    <FlashcardsSetBody
      flashcards={subcards}
      isComplete
      layoutMode={layoutMode}
      hasStreamingCard={false}
      compact={compact}
    />
  );
}

export function useFlashcardsSubcardsSetLayout(
  initial: LayoutMode = "grid",
): [LayoutMode, (mode: LayoutMode) => void] {
  return useState<LayoutMode>(initial);
}

"use client";

import React, { useMemo, useState } from "react";
import {
  BookOpen,
  ExternalLink,
  Grid2x2,
  LayoutList,
  Maximize2,
  Printer,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/styles/themes/utils";
import FlashcardItem from "./FlashcardItem";
import { parseFlashcards } from "./flashcard-parser";
import { EXPERIMENTAL_normalizePreParsedFlashcards } from "./EXPERIMENTAL-parse-addon";
import { useOpenArtifactInCanvas } from "@/features/canvas/hooks/useOpenArtifactInCanvas";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import type { FlashcardsBlockData } from "@/types/python-generated/stream-events";
import { flashcardsPrinter } from "./flashcards-printer";
import { usePrintOptions } from "@/lib/block-print/PrintOptionsDialog";

import type { FlashcardSubcard } from "./flashcard-subcards";

export type LayoutMode = "grid" | "list";

export type NormalizedFlashcard = {
  front?: string | null;
  back?: string | null;
  additionalDetails?: Record<string, unknown>;
  subcards?: FlashcardSubcard[];
};

export function cardsToMarkdown(
  cards: Array<{ front?: string | null; back?: string | null }>,
): string {
  return cards
    .filter((c) => c.front && c.back)
    .map((c) => `Front: ${c.front}\nBack: ${c.back}\n---`)
    .join("\n");
}

export interface UseFlashcardsSetOptions {
  content?: string;
  serverData?: FlashcardsBlockData;
  additionalDetails?: Record<string, unknown>;
  artifactId?: string;
  messageId?: string;
  conversationId?: string;
  blockIndex?: number;
}

export function useFlashcardsSet({
  content,
  serverData,
  additionalDetails: blockAdditionalDetails,
  artifactId,
  messageId,
  conversationId,
  blockIndex,
}: UseFlashcardsSetOptions) {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("grid");
  const {
    openArtifact,
    busy: openingCanvas,
    lastResult,
  } = useOpenArtifactInCanvas();

  const { flashcards, isComplete } = useMemo(() => {
    if (serverData) {
      return {
        flashcards: EXPERIMENTAL_normalizePreParsedFlashcards(
          serverData.cards ?? [],
          blockAdditionalDetails,
        ),
        isComplete: serverData.isComplete ?? false,
      };
    }
    const parsed = parseFlashcards(content ?? "");
    return {
      flashcards: parsed.flashcards.map((card) => ({
        front: card.front,
        back: card.back,
      })),
      isComplete: parsed.isComplete,
    };
  }, [content, serverData, blockAdditionalDetails]);

  const completeCount = flashcards.length;

  const rawPayload =
    content?.trim() ||
    (flashcards.length > 0 ? cardsToMarkdown(flashcards) : "");

  const printData = useMemo(
    () => (serverData ? serverData : { cards: flashcards }),
    [serverData, flashcards],
  );
  const {
    open: printOpen,
    setOpen: setPrintOpen,
    triggerPrint,
  } = usePrintOptions(flashcardsPrinter, printData);

  const hasStreamingCard =
    !isComplete &&
    flashcards.some((c) => c.back === null || c.back === undefined);

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

  return {
    flashcards,
    isComplete,
    completeCount,
    layoutMode,
    setLayoutMode,
    hasStreamingCard,
    printData,
    printOpen,
    setPrintOpen,
    triggerPrint,
    handleOpenInCanvas,
    openingCanvas,
    lastResult,
    rawPayload,
    content,
    serverData,
    blockAdditionalDetails,
    artifactId,
    messageId,
    conversationId,
    blockIndex,
  };
}

interface LayoutToggleProps {
  layoutMode: LayoutMode;
  onLayoutChange: (mode: LayoutMode) => void;
  onMobileView: () => void;
  size?: "sm" | "xs";
}

export function LayoutToggle({
  layoutMode,
  onLayoutChange,
  onMobileView,
  size = "sm",
}: LayoutToggleProps) {
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
}

interface FlashcardsSetBodyProps {
  flashcards: NormalizedFlashcard[];
  isComplete: boolean;
  layoutMode: LayoutMode;
  hasStreamingCard: boolean;
  /** Window panel: edge-to-edge grid, no outer padding. */
  compact?: boolean;
}

export function FlashcardsSetBody({
  flashcards,
  isComplete,
  layoutMode,
  hasStreamingCard,
  compact = false,
}: FlashcardsSetBodyProps) {
  return (
    <div
      className={cn(
        compact ? "gap-1 p-0" : "gap-2 p-0.5",
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
          additionalDetails={card.additionalDetails}
          subcards={card.subcards}
        />
      ))}

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
}

export interface FlashcardsSetControlsProps {
  layoutMode: LayoutMode;
  onLayoutChange: (mode: LayoutMode) => void;
  onMobileView: () => void;
  onPrint: () => void;
  onOpenCanvas: () => void;
  openingCanvas?: boolean;
  onFullscreen?: () => void;
  onOpenInWindow?: (e?: React.MouseEvent) => void;
  isAdmin?: boolean;
  showFullscreen?: boolean;
  showDevWindow?: boolean;
  /** Icon row (header) vs labeled footer bar. */
  variant?: "icons" | "bar";
  size?: "sm" | "xs";
}

export function FlashcardsSetControls({
  layoutMode,
  onLayoutChange,
  onMobileView,
  onPrint,
  onOpenCanvas,
  openingCanvas = false,
  onFullscreen,
  onOpenInWindow,
  isAdmin = false,
  showFullscreen = false,
  showDevWindow = false,
  variant = "icons",
  size = "sm",
}: FlashcardsSetControlsProps) {
  if (variant === "bar") {
    return (
      <div className="flex w-full items-center justify-between gap-2 px-2 py-0.5">
        <LayoutToggle
          layoutMode={layoutMode}
          onLayoutChange={onLayoutChange}
          onMobileView={onMobileView}
          size={size}
        />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={onPrint}
          >
            <Printer className="h-3 w-3" />
            Print
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs bg-purple-500 dark:bg-purple-600 hover:bg-purple-600 dark:hover:bg-purple-700 text-white"
            onClick={onOpenCanvas}
            disabled={openingCanvas}
          >
            <ExternalLink className="h-3 w-3" />
            Canvas
          </Button>
          {showFullscreen && onFullscreen && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onFullscreen}
            >
              <Maximize2 className="h-3 w-3" />
              Full
            </Button>
          )}
        </div>
      </div>
    );
  }

  const btnClass = size === "xs" ? "h-7 w-7 p-0" : "h-7 w-7 p-0";
  const iconClass = size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <>
      <LayoutToggle
        layoutMode={layoutMode}
        onLayoutChange={onLayoutChange}
        onMobileView={onMobileView}
        size={size}
      />
      <Button
        variant="ghost"
        size="sm"
        className={cn(btnClass, "text-muted-foreground hover:text-foreground")}
        onClick={(e) => {
          e.stopPropagation();
          onPrint();
        }}
        title="Print flashcards"
      >
        <Printer className={iconClass} />
      </Button>
      {showDevWindow && isAdmin && onOpenInWindow && (
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            btnClass,
            "text-destructive hover:bg-destructive/15 hover:text-destructive ring-1 ring-destructive/50 animate-pulse",
          )}
          onClick={onOpenInWindow}
          title="[DEV] Open flashcards block in window panel"
        >
          <TriangleAlert className={iconClass} />
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          btnClass,
          "bg-purple-500 dark:bg-purple-600 hover:bg-purple-600 dark:hover:bg-purple-700 text-white",
        )}
        onClick={(e) => {
          e.stopPropagation();
          onOpenCanvas();
        }}
        disabled={openingCanvas}
        title="Open in canvas"
      >
        <ExternalLink className={iconClass} />
      </Button>
      {showFullscreen && onFullscreen && (
        <Button
          variant="ghost"
          size="sm"
          className={btnClass}
          onClick={(e) => {
            e.stopPropagation();
            onFullscreen();
          }}
          title="Fullscreen mode"
        >
          <Maximize2 className={iconClass} />
        </Button>
      )}
    </>
  );
}

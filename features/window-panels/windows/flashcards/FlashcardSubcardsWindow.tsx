"use client";

/**
 * FlashcardSubcardsWindow — a parent's nested subcards as a flip-card set.
 */

import React, { useEffect, useRef, useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import FlashcardMobileView from "@/components/mardown-display/blocks/flashcards/FlashcardMobileView";
import { FlashcardsSubcardsSet } from "@/components/mardown-display/blocks/flashcards/FlashcardsSubcardsSet";
import { LayoutToggle } from "@/components/mardown-display/blocks/flashcards/flashcards-set-parts";
import type { FlashcardSubcard } from "@/components/mardown-display/blocks/flashcards/flashcard-subcards";
import type { LayoutMode } from "@/components/mardown-display/blocks/flashcards/flashcards-set-parts";
import { subcardsWindowTitle } from "@/components/mardown-display/blocks/flashcards/flashcard-subcards";
import {
  toFlashcardMobileCards,
  useFlashcardMobileViewState,
} from "@/components/mardown-display/blocks/flashcards/flashcard-mobile-bridge";
import { useIsMobile } from "@/hooks/use-mobile";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import {
  useFlashcardMenuSection,
  flashcardEntityRef,
  resolveFlashcardGridIndex,
  type FlashcardMenuRow,
} from "@/features/flashcards/components/flashcard-menu";
import { useOpenFlashcardItemWindow } from "@/features/overlays/openers/flashcardItemWindow";

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
  const [layoutMode, setLayoutMode] = React.useState<LayoutMode>("grid");
  const cards = subcards ?? [];
  const isMobile = useIsMobile();
  const { isMobileView, enterMobileView, exitMobileView, mobileStartIndex } =
    useFlashcardMobileViewState(0);

  const gridRef = useRef<HTMLDivElement>(null);
  const [clickedCard, setClickedCard] = useState<FlashcardMenuRow | null>(
    null,
  );
  const openItemWindow = useOpenFlashcardItemWindow();
  const flashcardSection = useFlashcardMenuSection({
    getRow: () => clickedCard,
    actions: {
      onOpenItem: (row) =>
        openItemWindow({
          front: row.front,
          back: row.back,
          index: row.index,
          title: title ?? undefined,
        }),
    },
    unavailable: {
      "flashcard-flip": "Works on the Study window",
      "flashcard-study-set": "This subcard set has no study session",
    },
  });
  const resolveCardContext = (target: HTMLElement | null) => {
    const idx = resolveFlashcardGridIndex(gridRef.current, target);
    const card = idx != null ? cards[idx] : null;
    const row: FlashcardMenuRow | null = card
      ? { front: card.front, back: card.back, index: idx! }
      : null;
    setClickedCard(row);
    if (!row) return null;
    return { [CONTEXT_MENU_ENTITY_KEY]: flashcardEntityRef(row) };
  };

  useEffect(() => {
    if (isOpen && isMobile && cards.length > 0) {
      enterMobileView(0);
    }
  }, [isOpen, isMobile, cards.length, enterMobileView]);

  if (!isOpen) return null;

  if (isMobileView && cards.length > 0) {
    return (
      <FlashcardMobileView
        cards={toFlashcardMobileCards(cards)}
        initialIndex={mobileStartIndex}
        onClose={exitMobileView}
      />
    );
  }

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
            onMobileView={() => enterMobileView(0)}
            size="xs"
          />
        ) : undefined
      }
    >
      <NonEditableContextMenu
        sourceFeature="education-flashcards"
        contentSource={{ type: "raw" }}
        contextData={{ content: parentFront ?? "" }}
        resolveContextOnOpen={resolveCardContext}
        extraSections={[flashcardSection]}
      >
        <div ref={gridRef} className="min-h-0 flex-1 overflow-y-auto">
          <FlashcardsSubcardsSet
            subcards={cards}
            compact
            layoutMode={layoutMode}
          />
        </div>
      </NonEditableContextMenu>
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

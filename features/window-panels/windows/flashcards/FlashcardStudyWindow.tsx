"use client";

/**
 * FlashcardStudyWindow — classic-flip study session in a WindowPanel.
 *
 * Owns full study state via useFlashcardStudy. Body = one card edge-to-edge.
 * Footer = nav + grade. Sidebar (collapsed by default) = card list + mastery stats.
 */

import React from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { AlertCircle, BookOpen } from "lucide-react";
import FlashcardItem from "@/components/mardown-display/blocks/flashcards/FlashcardItem";
import { useFlashcardStudy } from "@/features/flashcards/data/useFlashcardStudy";
import {
  FlashcardStudySidebar,
  StudyCompletionSummary,
  StudyWindowFooter,
  useStudyCompletion,
  useStudyKeyboard,
} from "@/features/flashcards/components/study/study-deck-parts";
import type { ReviewResult } from "@/features/flashcards/types";

export interface FlashcardStudyWindowProps {
  isOpen: boolean;
  onClose: () => void;
  setId?: string | null;
  title?: string | null;
}

export function FlashcardStudyWindow({
  isOpen,
  onClose,
  setId,
  title,
}: FlashcardStudyWindowProps) {
  const study = useFlashcardStudy({ setId, withSession: true });
  const [completed, restartCompletion] = useStudyCompletion(
    study.cards.length,
    study.progress,
  );

  const handleGrade = (result: ReviewResult) => {
    if (study.grading) return;
    void study.grade(result);
  };

  useStudyKeyboard({
    enabled:
      isOpen &&
      !study.loading &&
      !study.error &&
      study.cards.length > 0 &&
      !completed,
    grading: study.grading,
    onFlip: study.flip,
    onNext: study.next,
    onPrev: study.prev,
    onGrade: handleGrade,
  });

  if (!isOpen) return null;

  const { width, height } = computeViewportSize();
  const displayTitle =
    title ?? study.set?.name ?? (setId ? "Study" : "Flashcard Study");
  const current = study.cards[study.currentIndex];

  const body = (() => {
    if (study.loading) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <MatrxMiniLoader />
        </div>
      );
    }
    if (study.error) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <AlertCircle className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">Couldn&apos;t load this set</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {study.error}
          </p>
        </div>
      );
    }
    if (study.cards.length === 0) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <BookOpen className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">No cards to study</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            This set has no cards yet.
          </p>
        </div>
      );
    }
    if (completed) {
      return (
        <StudyCompletionSummary
          progress={study.progress}
          onRestart={() => {
            restartCompletion();
            study.goTo(0);
          }}
        />
      );
    }
    return (
      <>
        {current && (
          <FlashcardItem
            key={`fc-study-${current.id}`}
            front={current.front}
            back={current.back}
            index={study.currentIndex}
            layoutMode="list"
            presentation="panel"
            showDevWindowTrigger={false}
            flipped={study.isFlipped}
            onFlipToggle={study.flip}
            lastResult={study.resultsByCard[current.id] ?? null}
          />
        )}
      </>
    );
  })();

  return (
    <WindowPanel
      id="flashcard-study-window"
      title={displayTitle}
      onClose={onClose}
      overlayId="flashcardStudyWindow"
      minWidth={360}
      minHeight={280}
      width={width}
      height={height}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      defaultSidebarOpen={false}
      sidebarDefaultSize={220}
      sidebarMinSize={180}
      sidebar={
        study.cards.length > 0 ? (
          <FlashcardStudySidebar
            cards={study.cards}
            currentIndex={study.currentIndex}
            resultsByCard={study.resultsByCard}
            masteryByCard={study.masteryByCard}
            onGoTo={study.goTo}
          />
        ) : undefined
      }
      footerVariant="rich"
      footer={
        study.cards.length > 0 &&
        !completed &&
        !study.loading &&
        !study.error ? (
          <StudyWindowFooter
            currentIndex={study.currentIndex}
            cardCount={study.cards.length}
            grading={study.grading}
            cards={study.cards}
            resultsByCard={study.resultsByCard}
            onPrev={study.prev}
            onNext={study.next}
            onGoTo={study.goTo}
            onGrade={handleGrade}
          />
        ) : undefined
      }
    >
      {body}
    </WindowPanel>
  );
}

function computeViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") {
    return { width: 520, height: 380 };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    width: Math.min(Math.round(vw * 0.55), 720),
    height: Math.min(Math.round(vh * 0.7), 560),
  };
}

"use client";

import React, { Suspense, lazy } from "react";
import FlashcardItem from "@/components/mardown-display/blocks/flashcards/FlashcardItem";
import { useFlashcardStudy } from "../data/useFlashcardStudy";
import type { ReviewResult } from "../types";
import type { FlashcardsBlockData } from "@/types/python-generated/stream-events";
import { useCanvasItem } from "@/features/canvas/hooks/useCanvasItem";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import { InlineArtifactDebugStrip } from "@/features/canvas/components/CanvasArtifactDebugPanel";
import { cn } from "@/styles/themes/utils";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";

/** The canonical link system this view studies. Legacy sets carry a different one. */
const FC_SET_SYSTEM = "fc_set";

// Read-only fallback for not-yet-materialized streams (no canonical set linked).
const FlashcardsBlock = lazy(
  () =>
    import("@/components/mardown-display/blocks/flashcards/FlashcardsBlock"),
);

interface CanvasFlashcardsViewProps {
  /** canvas_items.id — canonical source when present. */
  artifactId?: string | null;
  content?: string;
  serverData?: FlashcardsBlockData;
  conversationId?: string;
  messageId?: string;
  className?: string;
}

/** A small panel for the legacy / un-materialized notices — never a crash. */
function Notice({
  icon,
  title,
  body,
  debug,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  debug?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col">
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-10 text-center">
        <div className="text-muted-foreground">{icon}</div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-sm text-xs text-muted-foreground">{body}</p>
      </div>
      {debug}
    </div>
  );
}

export function CanvasFlashcardsView({
  artifactId,
  content,
  serverData,
  conversationId,
  messageId,
  className,
}: CanvasFlashcardsViewProps): React.ReactElement | null {
  const hasArtifactId = isMaterializedArtifactId(artifactId);
  const { row, loading: rowLoading } = useCanvasItem(
    hasArtifactId ? artifactId : null,
  );

  // Only the canonical link drives the interactive study view. Legacy sets
  // (external_system === 'user_flashcard_sets') and un-linked rows fall through.
  const linkedSetId =
    row?.external_system === FC_SET_SYSTEM ? row.external_id : null;

  const {
    set,
    cards,
    loading: studyLoading,
    error,
    currentIndex,
    resultsByCard,
    next,
    prev,
    goTo,
    grade,
    grading,
    progress,
  } = useFlashcardStudy({ setId: linkedSetId });

  const debugStrip = (
    <InlineArtifactDebugStrip
      label="canvas flashcards"
      artifactId={artifactId}
      messageId={messageId ?? row?.source_message_id}
      conversationId={conversationId}
      lastSteps={[
        linkedSetId
          ? `linked fc_set: ${linkedSetId}`
          : `external_system: ${row?.external_system ?? "none"}`,
        set ? `loaded set row: ${set.id}` : "set not loaded",
      ]}
    />
  );

  // ─── Loading the canvas row itself ──────────────────────────────────────
  if (hasArtifactId && rowLoading) {
    return <MatrxMiniLoader />;
  }

  // ─── No materialized link yet: fall back to a read-only display of the
  //     inline stream content, or a graceful "not in the new format" notice. ─
  if (!linkedSetId) {
    const hasInline = Boolean(content?.trim()) || Boolean(serverData?.cards);
    if (hasInline) {
      return (
        <div className={cn("flex flex-col", className)}>
          <Suspense fallback={<MatrxMiniLoader />}>
            <FlashcardsBlock
              content={content?.trim() ? content : undefined}
              serverData={serverData}
              artifactId={hasArtifactId ? (artifactId ?? undefined) : undefined}
              messageId={messageId}
              conversationId={conversationId}
            />
          </Suspense>
          {debugStrip}
        </div>
      );
    }
    return (
      <div className={cn("flex flex-col", className)}>
        <Notice
          icon={<Info className="h-5 w-5" />}
          title="This set isn't in the new format yet"
          body="Regenerate these flashcards from chat to study them with progress tracking."
          debug={debugStrip}
        />
      </div>
    );
  }

  // ─── Canonical set is linked — load + study it. ─────────────────────────
  if (studyLoading) {
    return <MatrxMiniLoader />;
  }

  if (error) {
    return (
      <div className={cn("flex flex-col", className)}>
        <Notice
          icon={<Info className="h-5 w-5" />}
          title="Couldn't load this flashcard set"
          body={error}
          debug={debugStrip}
        />
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className={cn("flex flex-col", className)}>
        <Notice
          icon={<BookOpen className="h-5 w-5" />}
          title="No flashcards in this set"
          body="This set has no cards yet. Regenerate from chat to add some."
          debug={debugStrip}
        />
      </div>
    );
  }

  const current = cards[currentIndex];
  const handleReview = (_cardIndex: number, result: ReviewResult): void => {
    void grade(result);
  };

  return (
    <div className={cn("flex flex-col", className)}>
      {debugStrip}

      {/* Progress header */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card/50 px-3 py-2">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" />
            <span>
              Card {currentIndex + 1} / {cards.length}
            </span>
          </div>
          <span className="text-border">|</span>
          <span>
            {progress.done}/{progress.total} studied
          </span>
          {progress.done > 0 && (
            <>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                {progress.correct} correct
              </span>
            </>
          )}
        </div>
      </div>

      {progress.total > 0 && (
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-green-500 transition-all duration-500"
            style={{
              width: `${Math.round((progress.done / progress.total) * 100)}%`,
            }}
          />
        </div>
      )}

      {/* Single-card study surface — flip + self-grade (FlashcardItem owns
          flip + grade buttons; grading funnels through the study spine). */}
      <div className="p-3">
        <FlashcardItem
          key={`fc-card-${current.id}`}
          front={current.front}
          back={current.back}
          index={currentIndex}
          layoutMode="list"
          onReview={grading ? undefined : handleReview}
          lastResult={resultsByCard[current.id] ?? null}
        />
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={prev}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Prev
        </Button>

        <div className="flex flex-wrap items-center justify-center gap-1">
          {cards.map((card, i) => (
            <button
              key={`dot-${card.id}`}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to card ${i + 1}`}
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors",
                i === currentIndex
                  ? "bg-primary"
                  : resultsByCard[card.id]
                    ? "bg-green-500/60"
                    : "bg-muted-foreground/30",
              )}
            />
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={next}
          disabled={currentIndex === cards.length - 1}
        >
          Next
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

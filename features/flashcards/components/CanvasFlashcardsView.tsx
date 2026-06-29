"use client";

import React, { useMemo } from "react";
import { parseFlashcards } from "@/components/mardown-display/blocks/flashcards/flashcard-parser";
import FlashcardItem from "@/components/mardown-display/blocks/flashcards/FlashcardItem";
import { useFlashcardStudy } from "../hooks/useFlashcardStudy";
import type { FlashcardCard, ReviewResult } from "../types";
import type { FlashcardsBlockData } from "@/types/python-generated/stream-events";
import { useCanvasItem } from "@/features/canvas/hooks/useCanvasItem";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import { InlineArtifactDebugStrip } from "@/features/canvas/components/CanvasArtifactDebugPanel";
import { cn } from "@/styles/themes/utils";
import { BookOpen, RotateCcw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";

interface CanvasFlashcardsViewProps {
  /** canvas_items.id — canonical source when present. */
  artifactId?: string | null;
  content?: string;
  serverData?: FlashcardsBlockData;
  conversationId?: string;
  messageId?: string;
  className?: string;
}

function payloadFromRow(
  row: NonNullable<ReturnType<typeof useCanvasItem>["row"]>,
): string {
  const stored = row.content as { data?: unknown } | string | null;
  if (stored && typeof stored === "object" && "data" in stored) {
    return typeof stored.data === "string"
      ? stored.data
      : JSON.stringify(stored.data ?? "");
  }
  if (typeof stored === "string") return stored;
  return "";
}

export function CanvasFlashcardsView({
  artifactId,
  content,
  serverData,
  conversationId,
  messageId,
  className,
}: CanvasFlashcardsViewProps) {
  const hasArtifactId = isMaterializedArtifactId(artifactId);
  const { row, loading: rowLoading } = useCanvasItem(
    hasArtifactId ? artifactId : null,
  );

  const linkedSetId =
    row?.external_system === "user_flashcard_sets" ? row.external_id : null;

  const effectiveContent = useMemo(() => {
    if (row) return payloadFromRow(row);
    return content ?? "";
  }, [row, content]);

  const cards: FlashcardCard[] = useMemo(() => {
    if (serverData?.cards) {
      return serverData.cards
        .filter((c) => c.front && c.back)
        .map((c) => ({ front: c.front!, back: c.back! }));
    }
    if (effectiveContent) {
      const parsed = parseFlashcards(effectiveContent);
      return parsed.flashcards
        .filter((c) => c.front && c.back)
        .map((c) => ({ front: c.front, back: c.back! }));
    }
    return [];
  }, [effectiveContent, serverData]);

  const {
    cardStats,
    studyStates,
    dueCards,
    totalReviews,
    masteryPercent,
    submitReview,
    resetProgress,
    isLoading,
    isSaved,
    set,
  } = useFlashcardStudy({
    cards,
    setId: linkedSetId,
    conversationId,
    messageId: messageId ?? row?.source_message_id ?? undefined,
    title: row?.title ?? "Flashcards",
    autoSave: !linkedSetId,
  });

  const handleReview = (cardIndex: number, result: ReviewResult) => {
    submitReview(cardIndex, result);
  };

  const reviewedCount = cardStats.filter((s) => s.totalReviews > 0).length;
  const correctPercent =
    totalReviews > 0
      ? Math.round(
          (cardStats.reduce((sum, s) => sum + s.correct, 0) / totalReviews) *
            100,
        )
      : 0;

  if (hasArtifactId && rowLoading) {
    return <MatrxMiniLoader />;
  }

  if (!hasArtifactId) {
    return (
      <div className="p-4 text-sm text-destructive">
        Canvas flashcards require a persisted artifact UUID. Use the cloud sync
        button or open from chat after materialization.
        <InlineArtifactDebugStrip
          label="canvas flashcards"
          artifactId={artifactId}
          messageId={messageId}
          conversationId={conversationId}
        />
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        No flashcards available
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <InlineArtifactDebugStrip
        label="canvas flashcards"
        artifactId={artifactId}
        messageId={messageId ?? row?.source_message_id}
        conversationId={conversationId}
        lastSteps={[
          linkedSetId
            ? `linked set: ${linkedSetId}`
            : "no user_flashcard_sets link yet",
          set ? `active set row: ${set.id}` : "set not loaded",
        ]}
      />

      {isSaved && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border bg-card/50">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" />
              <span>
                {reviewedCount}/{cards.length} reviewed
              </span>
            </div>
            {totalReviews > 0 && (
              <>
                <span className="text-border">|</span>
                <span>{correctPercent}% correct</span>
                <span className="text-border">|</span>
                <span>{masteryPercent}% mastered</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            {dueCards.length > 0 && dueCards.length < cards.length && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                title={`${dueCards.length} cards due for review`}
              >
                <Zap className="h-3 w-3 mr-1" />
                {dueCards.length} due
              </Button>
            )}
            {totalReviews > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={resetProgress}
                disabled={isLoading}
                title="Reset all progress"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      )}

      {isSaved && totalReviews > 0 && (
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-green-500 transition-all duration-500"
            style={{ width: `${masteryPercent}%` }}
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
        {cards.map((card, index) => {
          const stats = cardStats[index];

          return (
            <FlashcardItem
              key={`canvas-flashcard-${index}`}
              front={card.front}
              back={card.back}
              index={index}
              layoutMode="grid"
              onReview={isSaved ? handleReview : undefined}
              lastResult={stats?.lastResult ?? null}
            />
          );
        })}
      </div>
    </div>
  );
}

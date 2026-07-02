// features/flashcards/components/study/ReviewDueSurface.tsx
//
// The adaptive "Review due" surface — the vision's north-star. A thin driver:
// useDueReview() → the shared <StudyDeck/>. Studies the FSRS due queue across ALL
// the learner's sets (not one set), grading through the same canonical spine
// path. No "Study again" (the queue is dynamic — graded cards leave it as their
// due date advances).
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import { useDueReview } from "../../data/useDueReview";
import { StudyDeck } from "./StudyDeck";

const EDU_BASE = "/education/flashcards";

export function ReviewDueSurface() {
  const router = useRouter();
  const study = useDueReview();

  return (
    <StudyDeck
      title="Review due"
      onBack={() => router.back()}
      loading={study.loading}
      error={study.error}
      cards={study.cards}
      currentIndex={study.currentIndex}
      isFlipped={study.isFlipped}
      resultsByCard={study.resultsByCard}
      grading={study.grading}
      progress={study.progress}
      flip={study.flip}
      next={study.next}
      prev={study.prev}
      goTo={study.goTo}
      grade={study.grade}
      errorTitle="Couldn't load your due cards"
      emptyTitle="You're all caught up"
      emptyBody="No cards are due for review right now. Study a set to build your queue — cards resurface on the spaced-repetition schedule."
      completionTitle="Review complete"
      completionSubtitle={`You reviewed all ${study.progress.total} due cards.`}
      completionPrimary={{
        label: "Back to flashcards",
        icon: Layers,
        onClick: () => router.push(EDU_BASE),
      }}
    />
  );
}

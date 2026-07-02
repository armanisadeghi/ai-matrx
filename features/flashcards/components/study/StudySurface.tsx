// features/flashcards/components/study/StudySurface.tsx
//
// The focused classic-flip study session for ONE flashcard set. A thin driver:
// useFlashcardStudy(setId, { withSession: true }) → the shared <StudyDeck/>. Every
// grade funnels through the hook's `grade` (writes study_attempt + advances
// item_mastery) — the ONLY canonical write path. The deck owns all the study UI
// (flip, grade, keyboard, progress, completion); this file only wires the set
// data + set-specific copy/actions.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import { useFlashcardStudy } from "../../data/useFlashcardStudy";
import { StudyDeck } from "./StudyDeck";

const EDU_BASE = "/education/flashcards";

export function StudySurface({ setId }: { setId: string }) {
  const router = useRouter();
  const study = useFlashcardStudy({ setId, withSession: true });

  return (
    <StudyDeck
      title={study.set?.name ?? "Study"}
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
      errorTitle="Couldn't load this set"
      emptyBody="This set has no cards yet. Generate some in chat to study it."
      onRestart={() => study.goTo(0)}
      completionPrimary={{
        label: "Back to set",
        icon: Layers,
        onClick: () => router.push(`${EDU_BASE}/${setId}`),
      }}
    />
  );
}

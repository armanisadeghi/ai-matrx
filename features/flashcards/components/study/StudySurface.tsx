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
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useFlashcardStudy } from "../../data/useFlashcardStudy";
import { StudyDeck } from "./StudyDeck";
import { FlashcardStudyWindowDevTrigger } from "./FlashcardStudyWindowDevTrigger";
import { StudyDeckHeader } from "./StudyDeckHeader";
import { getVoiceTestForCard } from "./voiceTestExtra";

const EDU_BASE = "/education/flashcards";

export function StudySurface({ setId }: { setId: string }) {
  const router = useRouter();
  const study = useFlashcardStudy({ setId, withSession: true });
  const title = study.set?.name ?? "Study";

  return (
    <>
      <PageHeader>
        <StudyDeckHeader
          title={title}
          backHref={`${EDU_BASE}/${setId}`}
          actions={
            <FlashcardStudyWindowDevTrigger
              setId={setId}
              title={title}
              disabled={study.loading || study.cards.length === 0}
            />
          }
        />
      </PageHeader>
      <div className="h-full overflow-hidden">
        <StudyDeck
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
          voiceTestForCard={getVoiceTestForCard}
          errorTitle="Couldn't load this set"
          emptyBody="This set has no cards yet. Generate some in chat to study it."
          onRestart={() => study.goTo(0)}
          completionPrimary={{
            label: "Back to set",
            icon: Layers,
            onClick: () => router.push(`${EDU_BASE}/${setId}`),
          }}
        />
      </div>
    </>
  );
}

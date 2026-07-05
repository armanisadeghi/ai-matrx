// features/flashcards/components/study/LearnSurface.tsx
//
// Phase 1B (Flashcards Competitive Parity Push) — "Learn" mode: the same
// flip + self-grade UI as classic Study, but the working queue reshuffles
// toward weak cards instead of a single static pass. A wrong/partial grade
// reinserts the card a few slots ahead so it resurfaces soon; a correct
// grade removes it — the session naturally ends once every card has been
// mastered once. Driven by useFlashcardStudy({ reshuffleWeighted: true,
// mode: "learn" }) → the SAME shared <StudyDeck/> as classic study, so every
// tutor/review/keyboard/mobile affordance comes along for free.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useFlashcardStudy } from "../../data/useFlashcardStudy";
import { StudyDeck } from "./StudyDeck";
import { StudyDeckHeader } from "./StudyDeckHeader";
import { getVoiceTestForCard } from "./voiceTestExtra";

const EDU_BASE = "/education/flashcards";

export function LearnSurface({ setId }: { setId: string }) {
  const router = useRouter();
  const study = useFlashcardStudy({
    setId,
    withSession: true,
    mode: "learn",
    reshuffleWeighted: true,
  });
  const title = study.set?.name ?? "Learn";

  return (
    <>
      <PageHeader>
        <StudyDeckHeader
          title={`Learn — ${title}`}
          backHref={`${EDU_BASE}/${setId}`}
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
          masteryByCard={study.masteryByCard}
          sessionId={study.sessionId}
          errorTitle="Couldn't load this set"
          emptyBody="This set has no cards yet. Generate some in chat to study it."
          completionTitle="All cards mastered"
          completionSubtitle={`You mastered all ${study.progress.total} cards.`}
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

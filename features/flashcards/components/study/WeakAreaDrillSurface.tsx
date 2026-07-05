// features/flashcards/components/study/WeakAreaDrillSurface.tsx
//
// Phase 3 (Flashcards Competitive Parity Push) — the weak-area drill surface.
// A thin driver: useWeakAreaDrill() → the shared <StudyDeck/>, mirroring
// ReviewDueSurface exactly. Drills the learner's worst cards across ALL their
// sets (struggle_flag + lowest live retrievability), grading through the same
// canonical spine path, method='weak_area'.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useRouter } from "next/navigation";
import { Flame } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useWeakAreaDrill } from "../../data/useWeakAreaDrill";
import { StudyDeck } from "./StudyDeck";
import { StudyDeckHeader } from "./StudyDeckHeader";
import { getVoiceTestForCard } from "./voiceTestExtra";

const EDU_BASE = "/education/flashcards";

export function WeakAreaDrillSurface() {
  const router = useRouter();
  const study = useWeakAreaDrill();

  return (
    <>
      <PageHeader>
        <StudyDeckHeader title="Drill weak areas" backHref={EDU_BASE} />
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
          errorTitle="Couldn't load your weak areas"
          emptyTitle="No weak areas right now"
          emptyBody="Nothing is flagged as struggling or low-retention yet. Keep studying — cards that need extra practice will surface here automatically."
          completionTitle="Drill complete"
          completionSubtitle={`You reviewed all ${study.progress.total} weak cards.`}
          completionPrimary={{
            label: "Back to flashcards",
            icon: Flame,
            onClick: () => router.push(EDU_BASE),
          }}
        />
      </div>
    </>
  );
}

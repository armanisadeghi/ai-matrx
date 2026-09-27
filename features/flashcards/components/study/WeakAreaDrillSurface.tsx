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

import { useRouter, useSearchParams } from "next/navigation";
import { Flame } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useWeakAreaDrill } from "../../data/useWeakAreaDrill";
import { StudyDeck } from "./StudyDeck";
import { StudyDeckHeader } from "./StudyDeckHeader";
import { getVoiceTestForCard } from "./voiceTestExtra";
import { topicLabel } from "@/features/education/study/utils/topicLabel";
import {
  StudyOrganizationGate,
  useStudyOrganizationReady,
} from "@/features/education/study/components/StudyOrganizationGate";

const EDU_BASE = "/education/flashcards";

export function WeakAreaDrillSurface() {
  const router = useRouter();
  // `?topic=<raw topic>` drills one topic (the progress dashboard's topic
  // rows and the narrator's weak_area recommendations link it).
  const topic = useSearchParams().get("topic")?.trim() || null;
  // A drill records a study session, filed under one organization. With none
  // chosen yet, say so in place (with the picker) — never the blocking
  // "Which workspace?" modal the session write would otherwise raise.
  const orgReady = useStudyOrganizationReady();
  const study = useWeakAreaDrill({ topic, enabled: orgReady });
  const topicName = topic ? topicLabel(topic) : null;

  return (
    <>
      <PageHeader>
        <StudyDeckHeader
          title={topicName ? `Practice: ${topicName}` : "Drill weak areas"}
          backHref={EDU_BASE}
        />
      </PageHeader>
      <div className="h-full overflow-hidden">
        <StudyOrganizationGate
          what={topicName ? `Practicing ${topicName}` : "This drill"}
        >
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
          errorTitle="Couldn't load your weak areas"
          emptyTitle={
            topicName ? `No studied cards in ${topicName} yet` : "No weak areas right now"
          }
          emptyBody={
            topicName
              ? "You haven't studied any cards in this topic yet. Study its set first and practice will pick them up."
              : "Nothing is flagged as struggling or low-retention yet. Keep studying — cards that need extra practice will surface here automatically."
          }
          completionTitle="Drill complete"
          completionSubtitle={
            topicName
              ? `You reviewed all ${study.progress.total} cards in ${topicName}.`
              : `You reviewed all ${study.progress.total} weak cards.`
          }
          completionPrimary={{
            label: "Back to flashcards",
            icon: Flame,
            onClick: () => router.push(EDU_BASE),
          }}
        />
        </StudyOrganizationGate>
      </div>
    </>
  );
}

"use client";

// features/education/classes/components/ClassTestStudy.tsx
//
// "Study" for a test: one review session over every deck in the units the test
// covers, combined. The same study deck as every drill (`useWeakAreaDrill`),
// opened with `deckIds`; the session records {test, units, decks} as its
// source query so it counts toward the test.

import { useRouter } from "next/navigation";
import { Flame } from "lucide-react";
import { ReadFailure } from "@ai-matrx/design-system";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { StudyDeck } from "@/features/flashcards/components/study/StudyDeck";
import { getVoiceTestForCard } from "@/features/flashcards/components/study/voiceTestExtra";
import { useWeakAreaDrill } from "@/features/flashcards/data/useWeakAreaDrill";
import { useClassAccess } from "../hooks/useClassAccess";
import { useClassTestMaterial } from "../hooks/useClassTestMaterial";

const STUDY_LIMIT = 40;

export function ClassTestStudy({ classId, testId }: { classId: string; testId: string }) {
  const router = useRouter();
  const access = useClassAccess(classId);
  const state = access.state;
  const canOpen = !!state && (state.isOwner || state.myStatus === "active");
  const cls = state ? { id: state.classId, organizationId: state.organizationId } : { id: classId, organizationId: null };
  const material = useClassTestMaterial(cls, testId, canOpen);
  const testHref = `/education/classes/${classId}/tests/${testId}`;
  const ready = canOpen && !material.loading && !material.error && !!material.test;
  const unitIds = material.units.map((u) => u.id);
  const study = useWeakAreaDrill({
    limit: STUDY_LIMIT,
    deckIds: material.deckIds,
    sourceQuery: { test: testId, units: unitIds, decks: material.deckIds },
    enabled: ready && material.deckIds.length > 0,
  });

  if (state && !canOpen) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4">
        <AccessGate token="scope" id={classId} error={access.error} onRetry={() => void access.refresh()} fallbackHref="/education/classes" fallbackLabel="Classes" />
      </div>
    );
  }
  const noDecks = ready && material.deckIds.length === 0;

  return (
    <>
      <RecordPageHeader
        backHref={testHref}
        parents={state ? [{ label: state.name, href: `/education/classes/${classId}` }] : []}
        record={{ name: material.test ? `Study: ${material.test.name}` : "Study" }}
      />
      <div className="h-full overflow-hidden">
        {material.error ? (
          <ReadFailure error={material.error} what="this test" onRetry={() => void material.reload()} className="m-4" />
        ) : (
          <StudyDeck
            loading={!ready ? !noDecks && !material.error : study.loading}
            error={study.error}
            cards={noDecks ? [] : study.cards}
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
            errorTitle="Couldn't load this test's cards"
            emptyTitle="No decks in these units yet"
            emptyBody="File a deck in a unit this test covers and Study opens its cards."
            completionTitle="Review complete"
            completionSubtitle={`You went through ${study.progress.total} cards.`}
            completionPrimary={{ label: "Back to the test", icon: Flame, onClick: () => router.push(testHref) }}
          />
        )}
      </div>
    </>
  );
}

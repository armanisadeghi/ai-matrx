// features/flashcards/components/public/PublicStudySessionImpl.tsx
//
// A study sitting over a public deck: the SAME <StudyDeck/> every in-app study
// surface renders, opened as a full-screen layer over the public page and
// driven by the on-device driver (useLocalFlashcardStudy). Loaded only through
// PublicFlashcardDeck's single dynamic edge — never import it directly.
//
// `deviceOnly` keeps the deck off every per-learner read; no `setId` is passed,
// so the owner-only affordances (enrich, split into sub-cards) and the set
// AccessGate never appear; no `sessionId`, so no session review. Every AI tool
// the learner asks for (Ask AI, tutor, memory aid, read aloud) still calls the
// server exactly as it does for members — the server decides.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useState } from "react";
import { Layers, RotateCcw, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CardWithDetails } from "../../data/types";
import {
  useLocalFlashcardStudy,
  type LocalStudyMode,
} from "../../data/useLocalFlashcardStudy";
import { StudyDeck } from "../study/StudyDeck";
import { StudyDeckHeader } from "../study/StudyDeckHeader";

const MODE_TAG: Record<LocalStudyMode, string> = {
  study: "Study",
  learn: "Learn",
};

export default function PublicStudySessionImpl({
  setId,
  title,
  cards,
  mode,
  onClose,
}: {
  setId: string;
  title: string;
  cards: readonly CardWithDetails[];
  mode: LocalStudyMode;
  onClose: () => void;
}) {
  const study = useLocalFlashcardStudy({ setId, cards, mode });
  // A header "Start over" remounts the deck so its completion latch resets too.
  const [pass, setPass] = useState(0);
  const startOver = () => {
    study.restart();
    setPass((n) => n + 1);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${MODE_TAG[mode]}: ${title}`}
      className="fixed inset-0 z-50 flex flex-col bg-background"
      // The deck's frame clears the in-app glass header by this token; this
      // layer has its own bar in flow, so it clears nothing.
      style={{ ["--shell-header-h" as string]: "0px" }}
    >
      <div className="flex h-12 shrink-0 items-center border-b border-border px-1 sm:px-3">
        <StudyDeckHeader
          mode={MODE_TAG[mode]}
          title={title}
          onBack={onClose}
          actions={
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={study.reshuffle}
                disabled={study.cards.length < 2}
                title="Shuffle the cards (your grades are kept)"
              >
                <Shuffle className="h-4 w-4" />
                <span className="hidden sm:inline">Shuffle</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={startOver}
                title="Clear this pass and start from the first card"
              >
                <RotateCcw className="h-4 w-4" />
                <span className="hidden sm:inline">Start over</span>
              </Button>
            </div>
          }
        />
      </div>
      <div className="min-h-0 flex-1">
        <StudyDeck
          key={pass}
          deviceOnly
          loading={false}
          error={null}
          cards={study.cards}
          currentIndex={study.currentIndex}
          isFlipped={study.isFlipped}
          resultsByCard={study.resultsByCard}
          grading={false}
          progress={study.progress}
          flip={study.flip}
          next={study.next}
          prev={study.prev}
          goTo={study.goTo}
          grade={study.grade}
          onRestart={study.restart}
          onExit={onClose}
          emptyBody="This set has no cards yet."
          completionTitle={mode === "learn" ? "All cards learned" : "Set complete"}
          completionSubtitle="Progress is saved on this device."
          completionPrimary={{ label: "Back to set", icon: Layers, onClick: onClose }}
        />
      </div>
    </div>
  );
}

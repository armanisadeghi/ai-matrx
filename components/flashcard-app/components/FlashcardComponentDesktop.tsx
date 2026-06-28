"use client";

import React, { Suspense } from "react";
import FlashcardDisplay from "@/components/flashcard-app/flashcard-display/flashcard-display";
import PerformanceChart from "@/components/flashcard-app/performance/performance-chart";
import EditFlashcardDialog from "./EditFlashcardDialog";
import { Progress } from "@/components/ui/progress";
import AiAssistModal from "@/components/ai/AiAssistModal";
import { useFlashcard } from "@/hooks/flashcard-app/useFlashcard";
import MatrxTable from "@/app/(dev)/demos/tests/matrx-table/components/MatrxTable";
import {
  SmallComponentLoading,
  MediumComponentLoading,
  LargeComponentLoading,
  CardLoading,
} from "@/components/matrx/LoadingComponents";
import { ensureId } from "@/utils/schema/lite";
import { getFlashcardSet } from "@/app/(transitional)/flashcard/app-data";
import SmartFlashcardControls from "./SmartFlashcardControls/SmartFlashcardControls";

const FlashcardComponent: React.FC<{ dataSetId: string }> = ({ dataSetId }) => {
  const initialFlashcards = getFlashcardSet(dataSetId);
  const flashcardHook = useFlashcard(initialFlashcards);
  const {
    allFlashcards,
    currentIndex,
    firstName,
    handleNext,
    handlePrevious,
    handleSelectChange,
    activeFlashcard,
    shuffleCards,
    textModalState: {
      isAiModalOpen,
      isAiAssistModalOpen,
      aiAssistModalMessage,
      aiAssistModalDefaultTab,
    },
    textModalActions: {
      openAiModal,
      closeAiModal,
      openAiAssistModal,
      closeAiAssistModal,
    },
    setFontSize,
    audioModalActions,
    handleAction,
    setEditingCard,
    editingCard,
  } = flashcardHook;
  const flashcardsWithUUIDs = ensureId(allFlashcards);

  return (
    <div className="w-full">
      <div className="flex flex-col lg:flex-row justify-between items-stretch mb-2 gap-2">
        <div className="w-full lg:w-2/3 flex">
          <Suspense fallback={<CardLoading />}>
            <FlashcardDisplay flashcardHook={flashcardHook} />
          </Suspense>
        </div>
        <div className="w-full lg:w-1/3 flex">
          <Suspense fallback={<MediumComponentLoading />}>
            <PerformanceChart />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={<SmallComponentLoading />}>
        <SmartFlashcardControls flashcardHook={flashcardHook} />
      </Suspense>

      <div className="mt-4">
        <Progress
          value={((currentIndex + 1) / allFlashcards.length) * 100}
          className="w-full"
        />
      </div>

      <Suspense fallback={<LargeComponentLoading />}>
        <MatrxTable
          data={flashcardsWithUUIDs}
          onAction={handleAction}
          defaultVisibleColumns={[
            "front",
            "reviewCount",
            "correctCount",
            "incorrectCount",
            "lesson",
            "topic",
          ]}
        />
      </Suspense>

      <EditFlashcardDialog
        editingCard={editingCard}
        onSave={() => {
          if (editingCard) {
            flashcardHook.handleAction("edit", editingCard);
            setEditingCard(null);
          }
        }}
        onClose={() => setEditingCard(null)}
      />

      <AiAssistModal
        isOpen={isAiAssistModalOpen}
        onClose={closeAiAssistModal}
        defaultTab={aiAssistModalDefaultTab}
        message={aiAssistModalMessage}
      />
    </div>
  );
};

export default FlashcardComponent;

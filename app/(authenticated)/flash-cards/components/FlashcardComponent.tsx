"use client";

import React, { Suspense, useCallback } from "react";

import FlashcardControls from "./FlashcardControls";
import FlashcardDisplay from "./FlashcardDisplay";
import PerformanceChart from "./PerformanceChart";
import EditFlashcardDialog from "./EditFlashcardDialog";
import { Progress } from "@/components/ui/progress";
import AiAssistModal from "../ai/AiAssistModal";
import { useFlashcard } from "@/hooks/flashcard-app/useFlashcard";
import MatrxTable from "@/app/(authenticated)/tests/matrx-table/components/MatrxTable";
import {
  SmallComponentLoading,
  MediumComponentLoading,
  LargeComponentLoading,
  CardLoading,
} from "@/components/matrx/LoadingComponents";
import { ensureId } from "@/utils/schema/lite";
import { getFlashcardSet } from "@/app/(authenticated)/flashcard/app-data";
import {
  addMessage,
  clearChat,
  resetAllChats,
} from "@/lib/redux/slices/flashcardChatSlice";

const FlashcardComponent: React.FC<{ dataSetId }> = ({ dataSetId }) => {
  const initialFlashcards = getFlashcardSet(dataSetId);

  const flashcardHook = useFlashcard(initialFlashcards);

  const {
    allFlashcards,
    currentIndex,
    editingCard,
    textModalState: {
      isAiAssistModalOpen,
      aiAssistModalMessage,
      aiAssistModalDefaultTab,
    },
    textModalActions: { closeAiAssistModal },
    handleAction,
    setEditingCard,
  } = flashcardHook;

  const flashcardsWithUUIDs = ensureId(allFlashcards);

  return (
    <div className="w-full">
      <div className="flex flex-col lg:flex-row justify-between items-stretch mb-4 gap-4">
        <div className="w-full lg:w-2/3 flex">
          <Suspense fallback={<CardLoading />}>
            <FlashcardDisplay flashcardHook={flashcardHook} />
          </Suspense>
        </div>
        <div className="w-full lg:w-1/3 flex">
          <Suspense fallback={<MediumComponentLoading />}>
            <PerformanceChart cardCount={initialFlashcards.length} />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={<SmallComponentLoading />}>
        <FlashcardControls flashcardHook={flashcardHook} />
      </Suspense>

      <div className="mt-4">
        <Progress
          value={
            ((currentIndex + 1) /
              Math.max(allFlashcards.length, initialFlashcards.length, 1)) *
            100
          }
          className="w-full"
        />
      </div>

      <Suspense fallback={<LargeComponentLoading />}>
        <MatrxTable
          data={flashcardsWithUUIDs}
          onAction={handleAction}
          defaultVisibleColumns={[
            "lesson",
            "topic",
            "front",
            "reviewCount",
            "correctCount",
            "incorrectCount",
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

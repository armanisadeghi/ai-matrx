"use client";

import React, { Suspense } from "react";

import FlashcardControls from "./FlashcardControls";
import FlashcardDisplay from "@/components/flashcard-app/-dev/display-all-in-one";
import PerformanceChart from "@/components/flashcard-app/-dev/PerformanceChart";
import EditFlashcardDialog from "./EditFlashcardDialog";
import { Progress } from "@/components/ui/progress";

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
import AiAssistModal from "@/app/(transitional)/flash-cards/ai/AiAssistModal";
import type { TableData } from "@/types/tableTypes";
import type { Flashcard } from "@/types/flashcards.types";

// MatrxTable is a generic table component (rows typed as the loose `TableData`),
// but this screen only ever feeds it `Flashcard` rows (via `ensureId(allFlashcards)`
// below). Narrow at the boundary instead of widening `useFlashcard`'s `handleAction`
// contract back to `any`.
function isFlashcardRow(row: TableData): row is TableData & Flashcard {
  return (
    typeof row.order === "number" &&
    typeof row.front === "string" &&
    typeof row.back === "string"
  );
}

const FlashcardComponentMobile: React.FC<{ dataSetId }> = ({ dataSetId }) => {
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
      <div className="flex flex-col justify-between items-stretch mb-1 gap-1">
        <div className="w-full flex">
          <Suspense fallback={<CardLoading />}>
            <FlashcardDisplay flashcardHook={flashcardHook} />
          </Suspense>
        </div>
        <div className="w-full flex flex-col gap-1">
          <Suspense fallback={<SmallComponentLoading />}>
            <FlashcardControls flashcardHook={flashcardHook} />
          </Suspense>
          <Suspense fallback={<MediumComponentLoading />}>
            <PerformanceChart />
          </Suspense>
        </div>
      </div>

      <div className="mt-2">
        <Progress
          value={((currentIndex + 1) / allFlashcards.length) * 100}
          className="w-full"
        />
      </div>

      <Suspense fallback={<LargeComponentLoading />}>
        <MatrxTable
          data={flashcardsWithUUIDs}
          onAction={(actionName, rowData) => {
            if (!isFlashcardRow(rowData)) {
              console.error("FlashcardComponentMobile: table row is not a Flashcard", rowData);
              return;
            }
            handleAction(actionName, rowData);
          }}
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

export default FlashcardComponentMobile;

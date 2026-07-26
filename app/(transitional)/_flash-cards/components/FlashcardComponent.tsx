"use client";

import React, { Suspense } from "react";

import FlashcardControls from "./FlashcardControls";
import FlashcardDisplay from "./FlashcardDisplay";
import PerformanceChart from "./PerformanceChart";
import EditFlashcardDialog from "./EditFlashcardDialog";
import { Progress } from "@/components/ui/progress";
import AiAssistModal from "../ai/AiAssistModal";
import { useFlashcard } from "@/hooks/flashcard-app/useFlashcard";
import MatrxTable from "@/app/(dev)/demos/tests/matrx-table/components/MatrxTable";
import {
  SmallComponentLoading,
  MediumComponentLoading,
  LargeComponentLoading,
  CardLoading,
} from "@/components/matrx/LoadingComponents";
import { getFlashcardSet } from "@/components/flashcard-app/app-data";
import { ensureId } from "@/utils/schema/lite";
import type { Flashcard } from "@/types/flashcards.types";
import type { TableData } from "@/types/tableTypes";

const isFlashcardRow = (row: TableData): row is TableData & Flashcard =>
  typeof row.order === "number" &&
  typeof row.front === "string" &&
  typeof row.back === "string" &&
  typeof row.reviewCount === "number" &&
  typeof row.correctCount === "number" &&
  typeof row.incorrectCount === "number";

const FlashcardComponent: React.FC<{ dataSetId: string }> = ({ dataSetId }) => {
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

  const handleTableAction = (actionName: string, row: TableData) => {
    if (!isFlashcardRow(row)) {
      console.error("Flashcard table action received an invalid row", row);
      return;
    }
    handleAction(actionName, row);
  };

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
          onAction={handleTableAction}
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

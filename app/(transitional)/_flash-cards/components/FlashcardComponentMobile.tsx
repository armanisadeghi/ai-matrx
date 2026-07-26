'use client';

import React, { Suspense } from 'react';

import FlashcardControls from './FlashcardControls';
import FlashcardDisplay from '@/components/flashcard-app/-dev/display-all-in-one';
import PerformanceChart from '@/components/flashcard-app/-dev/PerformanceChart';
import EditFlashcardDialog from './EditFlashcardDialog';
import { Progress } from "@/components/ui/progress";

import { useFlashcard } from "@/hooks/flashcard-app/useFlashcard";
import MatrxTable from "@/app/(dev)/demos/tests/matrx-table/components/MatrxTable";
import {
    SmallComponentLoading,
    MediumComponentLoading,
    LargeComponentLoading,
    CardLoading
} from '@/components/matrx/LoadingComponents';
import { ensureId } from "@/utils/schema/lite";
import { getFlashcardSet } from '@/app/(transitional)/_flashcard/app-data';
import AiAssistModal from '@/app/(transitional)/_flash-cards/ai/AiAssistModal';
import type { Flashcard } from '@/types/flashcards.types';
import type { TableData } from '@/types/tableTypes';

const isFlashcardRow = (row: TableData): row is TableData & Flashcard =>
    typeof row.order === 'number' &&
    typeof row.front === 'string' &&
    typeof row.back === 'string' &&
    typeof row.reviewCount === 'number' &&
    typeof row.correctCount === 'number' &&
    typeof row.incorrectCount === 'number';

const FlashcardComponentMobile: React.FC<{ dataSetId: string }> = ({ dataSetId }) => {
    const initialFlashcards = getFlashcardSet(dataSetId);
    const flashcardHook = useFlashcard(initialFlashcards);
    const {
        allFlashcards,
        currentIndex,
        textModalState: {
            isAiAssistModalOpen,
            aiAssistModalMessage,
            aiAssistModalDefaultTab,
        },
        textModalActions: {
            closeAiAssistModal,
        },
        handleAction,
        setEditingCard,
        editingCard,

    } = flashcardHook;
    const flashcardsWithUUIDs = ensureId(allFlashcards);

    const handleTableAction = (actionName: string, row: TableData) => {
        if (!isFlashcardRow(row)) {
            console.error('Flashcard table action received an invalid row', row);
            return;
        }
        handleAction(actionName, row);
    };

    return (
        <div className="w-full">
            <div className="flex flex-col justify-between items-stretch mb-4 gap-4">
                <div className="w-full flex">
                    <Suspense fallback={<CardLoading />}>
                        <FlashcardDisplay flashcardHook={flashcardHook} />
                    </Suspense>
                </div>
                <div className="w-full flex flex-col gap-4">
                    <Suspense fallback={<SmallComponentLoading />}>
                        <FlashcardControls flashcardHook={flashcardHook} />
                    </Suspense>
                    <Suspense fallback={<MediumComponentLoading />}>
                        <PerformanceChart />
                    </Suspense>
                </div>
            </div>

            <div className="mt-4">
                <Progress value={((currentIndex + 1) / allFlashcards.length) * 100} className="w-full" />
            </div>

            <Suspense fallback={<LargeComponentLoading />}>
                <MatrxTable
                    data={flashcardsWithUUIDs}
                    onAction={handleTableAction}
                    defaultVisibleColumns={['lesson', 'topic', 'front', 'reviewCount', 'correctCount', 'incorrectCount']}
                />
            </Suspense>

            <EditFlashcardDialog
                editingCard={editingCard}
                onSave={() => {
                    if (editingCard) {
                        flashcardHook.handleAction('edit', editingCard);
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

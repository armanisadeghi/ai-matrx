// lib/redux/hooks/useFlashcardActions.ts

import { useAppDispatch } from '@/lib/redux/hooks';
import {
    addMessage,
    updateFlashcardStats,
    clearChat,
    resetAllChats,
    setCurrentIndex,
    deleteFlashcard,
    addFlashcard,
    updateFlashcard,
} from '@/lib/redux/slices/flashcardChatSlice';
import {ChatMessage, Flashcard} from "@/types/flashcards.types";

export const useFlashcardActions = () => {
    const dispatch = useAppDispatch();

    const addFlashcardMessage = (flashcardId: string, message: ChatMessage) => {
        dispatch(addMessage({ flashcardId, message }));
    };

    const updateFlashcardReview = (flashcardId: string, isCorrect: boolean) => {
        dispatch(updateFlashcardStats({ flashcardId, isCorrect }));
    };

    const clearFlashcardChat = (flashcardId: string) => {
        dispatch(clearChat(flashcardId));
    };

    const resetAllFlashcardChats = () => {
        dispatch(resetAllChats());
    };

    const changeCurrentFlashcardIndex = (index: number) => {
        dispatch(setCurrentIndex(index));
    };

    const removeFlashcard = (flashcardId: string) => {
        dispatch(deleteFlashcard(flashcardId));
    };

    const addNewFlashcard = (flashcard: Flashcard) => {
        dispatch(addFlashcard(flashcard));
    };

    const modifyFlashcard = (flashcard: Flashcard) => {
        dispatch(updateFlashcard(flashcard));
    };

    return {
        addFlashcardMessage,
        updateFlashcardReview,
        clearFlashcardChat,
        resetAllFlashcardChats,
        changeCurrentFlashcardIndex,
        removeFlashcard,
        addNewFlashcard,
        modifyFlashcard,
    };
};

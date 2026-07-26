// services/flashcardService.ts

// This is an example of how to create a service layer for more complex logic than direct hooks.

import { useAppDispatch } from '@/lib/redux/hooks';
import { resetAllChats, updateFlashcard } from '@/lib/redux/slices/flashcardChatSlice';
import {Flashcard} from "@/types/flashcards.types";

export const useFlashcardService = () => {
    const dispatch = useAppDispatch();

    const resetAndUpdateFlashcards = (updatedFlashcards: Flashcard[]) => {
        // First reset chats
        dispatch(resetAllChats());

        // Then update the flashcards
        updatedFlashcards.forEach(flashcard => {
            dispatch(updateFlashcard(flashcard));
        });
    };

    return {
        resetAndUpdateFlashcards,
    };
};

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Flashcard, ChatMessage } from "@/types/flashcards.types";

export interface FlashcardState extends Flashcard {
    chat: ChatMessage[];
}

export interface FlashcardChatState {
    flashcards: { [flashcardId: string]: FlashcardState };
    currentIndex: number;
}

const initialState: FlashcardChatState = {
    flashcards: {},
    currentIndex: 0,
};

const flashcardChatSlice = createSlice({
    name: 'flashcardChat',
    initialState,
    reducers: {
        initializeFlashcards: (state, action: PayloadAction<Flashcard[]>) => {
            state.flashcards = {}; // Clear existing flashcards
            action.payload.forEach(flashcard => {
                const id = flashcard.id;
                if (id) {
                    state.flashcards[id] = { ...flashcard, chat: [] };
                }
            });
        },

        initializeFlashcard: (state, action: PayloadAction<Flashcard>) => {
            const id = action.payload.id;
            if (id && !state.flashcards[id]) {
                state.flashcards[id] = { ...action.payload, chat: [] };
            }
        },
        addMessage: (
            state,
            action: PayloadAction<{ flashcardId: string; message: ChatMessage }>
        ) => {
            const { flashcardId, message } = action.payload;
            if (state.flashcards[flashcardId]) {
                state.flashcards[flashcardId].chat.push(message);
            }
        },
        updateFlashcardStats: (
            state,
            action: PayloadAction<{ flashcardId: string; isCorrect: boolean }>
        ) => {
            const { flashcardId, isCorrect } = action.payload;
            if (state.flashcards[flashcardId]) {
                state.flashcards[flashcardId].reviewCount += 1;
                if (isCorrect) {
                    state.flashcards[flashcardId].correctCount += 1;
                } else {
                    state.flashcards[flashcardId].incorrectCount += 1;
                }
            }
        },
        clearChat: (state, action: PayloadAction<string>) => {
            const flashcardId = action.payload;
            if (state.flashcards[flashcardId]) {
                state.flashcards[flashcardId].chat = [];
            }
        },
        resetAllChats: (state) => {
            Object.keys(state.flashcards).forEach(id => {
                state.flashcards[id].chat = [];
            });
        },
        setCurrentIndex: (state, action: PayloadAction<number>) => {
            state.currentIndex = action.payload;
        },
        deleteFlashcard: (state, action: PayloadAction<string>) => {
            delete state.flashcards[action.payload];
            // Recalculate currentIndex if necessary
            if (state.currentIndex >= Object.keys(state.flashcards).length) {
                state.currentIndex = Math.max(0, Object.keys(state.flashcards).length - 1);
            }
        },
        addFlashcard: (state, action: PayloadAction<Flashcard>) => {
            const id = action.payload.id;
            if (id) {
                state.flashcards[id] = { ...action.payload, chat: [] };
            }
        },
        updateFlashcard: (state, action: PayloadAction<Flashcard>) => {
            const id = action.payload.id;
            const existing = id ? state.flashcards[id] : undefined;
            if (id && existing) {
                state.flashcards[id] = {
                    ...existing,
                    ...action.payload,
                };
            }
        },
    },
});

export const {
    initializeFlashcards,
    initializeFlashcard,
    addMessage,
    updateFlashcardStats,
    clearChat,
    resetAllChats,
    setCurrentIndex,
    deleteFlashcard,
    addFlashcard,
    updateFlashcard,
} = flashcardChatSlice.actions;

export default flashcardChatSlice.reducer;
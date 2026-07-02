
import {FlashcardData} from "@/types/flashcards.types";
import {ApiName, Assistant, ProcessState} from "@/types/voice/voiceAssistantTypes";

export interface FastFireSessionState {
    isActive: boolean;
    isPaused: boolean;
    isRecording: boolean;
    isProcessing: boolean;
    currentCardIndex: number;
}

export interface FlashcardResult {
    correct: boolean;
    score: number;
    audioFeedback: string;
    timestamp: number;
    cardId: string;
}

export interface UseFastFireSessionReturn {
    isActive: boolean;
    isPaused: boolean;
    isProcessing: boolean;
    isRecording: boolean;
    currentCardIndex: number;
    currentCard?: FlashcardData;
    results: FlashcardResult[];
    audioPlayer: HTMLAudioElement | null;
    timeLeft: number;
    bufferTimeLeft: number;
    isInBufferPhase: boolean;
    audioLevel: number;
    startSession: () => void;
    pauseSession: () => void;
    resumeSession: () => void;
    stopSession: () => Promise<void>;
    startRecording: () => Promise<void>;
    stopRecording: () => Promise<void>;
    playAllAudioFeedback: () => void;
    playCorrectAnswersOnly: () => void;
    playHighScoresOnly: (minScore: number) => void;
    processState: ProcessState;
    totalCards: number;
}

'use client';
import React, {useState, useCallback, useRef, useEffect} from 'react';
import {useToast} from "@/components/ui/use-toast";
import {FlashcardData} from "@/types/flashcards.types";
import {useDynamicVoiceAiProcessing} from "@/hooks/ai/useDynamicVoiceAiProcessing";
import {ApiName, Assistant} from "@/types/voice/voiceAssistantTypes";
import {getFlashcardSet} from '@/app/(transitional)/flashcard/app-data';
import {getAssistant} from "@/constants/voice-assistants";
import {useAudioRecorder} from './useAudioRecorder';
import {FastFireSessionState, FlashcardResult, UseFastFireSessionReturn} from './types';


const voiceConfig = {
    apiName: 'openai' as ApiName,
    voiceId: '79a125e8-cd45-4c13-8a67-188112f4dd22',
    responseType: 'audio',
    temperature: 0.5,
    maxTokens: 2000,
    defaultTimer: 10
};




const assistant = getAssistant('flashcardGrader');

export function useFastFireSessionNew(): UseFastFireSessionReturn {
    const {toast} = useToast();
    const flashcards = getFlashcardSet('historyFlashcards');
    const flashcardsRef = useRef<FlashcardData[]>(flashcards);
    const defaultTimer = voiceConfig.defaultTimer;
    const [sessionState, setSessionState] = useState<FastFireSessionState>({
        isActive: false,
        isPaused: false,
        isProcessing: false,
        isRecording: false,
        currentCardIndex: -1
    });
    const [results, setResults] = useState<FlashcardResult[]>([]);
    const [timeLeft, setTimeLeft] = useState(defaultTimer);
    const [bufferTimeLeft, setBufferTimeLeft] = useState(3);
    const [isInBufferPhase, setIsInBufferPhase] = useState(true);
    const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);
    const startSound = useRef<HTMLAudioElement | undefined>(undefined);
    const endSound = useRef<HTMLAudioElement | undefined>(undefined);

    const {
        submit,
        audioPlayer,
        playAllAudioFeedback,
        playCorrectAnswersOnly,
        playHighScoresOnly,
        processState,
        getCurrentConversation,
        createNewConversation,
        setApiName,
        setAiCallParams
    } = useDynamicVoiceAiProcessing(assistant);

    const {
        isRecording,
        audioLevel,
        startRecording: audioStartRecording,
        stopRecording: audioStopRecording
    } = useAudioRecorder();

    const totalCards = flashcardsRef.current.length;

    const cleanup = useCallback(async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setSessionState({
            isActive: false,
            isPaused: false,
            isProcessing: false,
            isRecording: false,
            currentCardIndex: -1
        });
    }, []);

    const stopSession = useCallback(async () => {
        await cleanup();
    }, [cleanup]);

    const moveToNextCard = useCallback(async () => {
        const currentIndex = sessionState.currentCardIndex;
        if (currentIndex >= flashcardsRef.current.length - 1) {
            toast({
                title: "Session Complete",
                description: "You've completed all flashcards!",
                variant: "success"
            });
            await stopSession();
            return false;
        }
        setSessionState(prev => ({
            ...prev,
            currentCardIndex: prev.currentCardIndex + 1,
            isProcessing: false,
            isRecording: false
        }));
        setTimeLeft(defaultTimer);
        setBufferTimeLeft(3);
        setIsInBufferPhase(true);
        return true;
    }, [sessionState.currentCardIndex, stopSession, toast]);

    const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
        const currentIndex = sessionState.currentCardIndex;
        const currentFlashcard = flashcardsRef.current[currentIndex];
        if (!currentFlashcard?.id) {
            await stopSession();
            return;
        }
        setSessionState(prev => ({...prev, isProcessing: true}));
        try {
            await submit(audioBlob);
            const conversation = getCurrentConversation();
            const lastResult = conversation?.structuredData?.[conversation.structuredData.length - 1];
            if (!lastResult) throw new Error("No response received from AI");
            setResults(prev => [...prev, {
                correct: lastResult.correct,
                score: lastResult.score,
                audioFeedback: lastResult.audioFeedback,
                cardId: currentFlashcard.id,
                timestamp: Date.now()
            }]);
            await moveToNextCard();
        } catch (error: any) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to process response",
                variant: "destructive"
            });
            setTimeLeft(defaultTimer);
            setBufferTimeLeft(3);
            setIsInBufferPhase(true);
            setSessionState(prev => ({
                ...prev,
                isProcessing: false,
                isRecording: false
            }));
        }
    }, [sessionState.currentCardIndex, submit, getCurrentConversation, moveToNextCard, stopSession, toast]);

    const startRecording = useCallback(async () => {
        await startSound.current?.play().catch(() => {});
        await audioStartRecording(`card-${sessionState.currentCardIndex}`);
        setSessionState(prev => ({...prev, isRecording: true}));
    }, [audioStartRecording, sessionState.currentCardIndex]);

    const stopRecording = useCallback(async () => {
        await endSound.current?.play().catch(() => {});
        const blob = await audioStopRecording(`card-${sessionState.currentCardIndex}`);
        setSessionState(prev => ({...prev, isRecording: false}));
        if (blob) await handleRecordingComplete(blob);
    }, [audioStopRecording, sessionState.currentCardIndex, handleRecordingComplete]);

    const startSession = useCallback(() => {
        if (flashcardsRef.current.length === 0) {
            toast({
                title: "No Flashcards",
                description: "There are no flashcards to practice.",
                variant: "destructive"
            });
            return;
        }
        createNewConversation();
        setSessionState({
            isActive: true,
            isPaused: false,
            isProcessing: false,
            isRecording: false,
            currentCardIndex: 0
        });
        setResults([]);
        setTimeLeft(defaultTimer);
        setBufferTimeLeft(3);
        setIsInBufferPhase(true);
    }, [createNewConversation, toast]);

    const pauseSession = useCallback(() => {
        setSessionState(prev => ({...prev, isPaused: true}));
        if (timerRef.current) {
            clearInterval(timerRef.current);
        }
    }, []);

    const resumeSession = useCallback(() => {
        setSessionState(prev => ({...prev, isPaused: false}));
    }, []);

    useEffect(() => {
        setApiName(voiceConfig.apiName);
        setAiCallParams({
            temperature: voiceConfig.temperature ?? 0.5,
            maxTokens: voiceConfig.maxTokens ?? 2000,
            responseFormat: assistant.responseFormat,
        });
    }, [assistant, voiceConfig, setApiName, setAiCallParams]);

    useEffect(() => {
        startSound.current = new Audio('/sounds/2-second-start-beep-sound.mp3');
        endSound.current = new Audio('/sounds/end-buzzer-sound.mp3');
        startSound.current.load();
        endSound.current.load();
        return () => {
            startSound.current = undefined;
            endSound.current = undefined;
        };
    }, []);

    useEffect(() => {
        if (sessionState.isActive && !sessionState.isPaused) {
            if (isInBufferPhase) {
                timerRef.current = setInterval(() => {
                    setBufferTimeLeft(prev => {
                        const nextVal = prev - 1;
                        if (nextVal < 1) {
                            setIsInBufferPhase(false);
                            clearInterval(timerRef.current as NodeJS.Timeout);
                            timerRef.current = undefined;
                            startRecording();
                            return 3;
                        }
                        return nextVal;
                    });
                }, 1000);
            } else {
                timerRef.current = setInterval(() => {
                    setTimeLeft(prev => {
                        const nextVal = prev - 1;
                        if (nextVal < 1) {
                            clearInterval(timerRef.current as NodeJS.Timeout);
                            timerRef.current = undefined;
                            stopRecording();
                            setTimeLeft(defaultTimer);
                            setIsInBufferPhase(true);
                            return defaultTimer;
                        }
                        return nextVal;
                    });
                }, 1000);
            }
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = undefined;
            }
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = undefined;
            }
        };
    }, [sessionState.isActive, sessionState.isPaused, isInBufferPhase, startRecording, stopRecording]);

    const currentCard = flashcardsRef.current[sessionState.currentCardIndex];

    return {
        isActive: sessionState.isActive,
        isPaused: sessionState.isPaused,
        isProcessing: sessionState.isProcessing,
        isRecording: isRecording,
        currentCardIndex: sessionState.currentCardIndex,
        currentCard,
        results,
        audioPlayer,
        timeLeft,
        bufferTimeLeft,
        isInBufferPhase,
        audioLevel,
        startSession,
        pauseSession,
        resumeSession,
        stopSession,
        startRecording,
        stopRecording,
        playAllAudioFeedback,
        playCorrectAnswersOnly,
        playHighScoresOnly,
        processState,
        totalCards
    };
}

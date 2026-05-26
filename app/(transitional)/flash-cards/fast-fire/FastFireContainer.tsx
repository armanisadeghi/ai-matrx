"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { Assistant, ApiName, AiCallParams, ResponseType, AvailableAssistants } from "@/types/voice/voiceAssistantTypes";
import { getAssistant } from "@/constants/voice-assistants";
import FastFireFlashcard from "./FastFireFlashcard";
import FastFireAnalysis from "./FastFireAnalysis";
import { FlashcardData } from "@/types/flashcards.types";
import { useFastFireSessionNew } from "@/hooks/flashcard-app/useFastFireSessionNew";
    
export interface VoiceConfig {
    apiName: ApiName;
    voiceId: string;
    responseType?: ResponseType;
    temperature?: number;
    maxTokens?: number;
}

interface FastFireContainerProps {
    initialFlashcards: FlashcardData[];
    setId: string;
    voiceConfig: VoiceConfig;
    assistantId?: AvailableAssistants;
    aiCallParams?: Partial<AiCallParams>;
}

const FastFireContainer = ({
    initialFlashcards,
    setId,
    voiceConfig,
    assistantId = "flashcardGrader",
    aiCallParams = {},
}: FastFireContainerProps) => {
    const selectedAssistant = getAssistant(assistantId);
    if (!selectedAssistant) {
        return (
            <div className="container mx-auto py-8">
                <h1 className="text-2xl font-bold">Invalid Assistant</h1>
                <p>Please check your assistant configuration.</p>
            </div>
        );
    }

    const {
        isActive,
        isPaused,
        isProcessing,
        isRecording,
        currentCardIndex,
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
    } = useFastFireSessionNew();

    return (
        <div className="container mx-auto py-8 pb-[160px] space-y-8">
            <header className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Fast Fire Practice</h1>
                <div className="space-x-4">
                    <Button variant="outline" onClick={playAllAudioFeedback} disabled={results.length === 0 || isProcessing}>
                        <Play className="mr-2 h-4 w-4" />
                        Review All
                    </Button>
                    <Button variant="outline" onClick={playCorrectAnswersOnly} disabled={results.length === 0 || isProcessing}>
                        Review Correct
                    </Button>
                    <Button variant="outline" onClick={() => playHighScoresOnly(4)} disabled={results.length === 0 || isProcessing}>
                        Review Best
                    </Button>
                </div>
            </header>

            <FastFireFlashcard
                initialData={initialFlashcards}
                defaultTimer={10}
                disabled={isProcessing}
                isActive={isActive}
                isPaused={isPaused}
                currentCard={currentCard}
                currentCardIndex={currentCardIndex}
                timeLeft={timeLeft}
                isRecording={isRecording}
            />

            <AnimatePresence mode="wait">
                {audioPlayer && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="fixed bottom-4 right-4"
                    >
                        <Card className="p-4">
                            <audio controls src={audioPlayer.src} />
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            <FastFireAnalysis
                results={results}
                totalCards={initialFlashcards.length}
                isProcessing={isProcessing}
                startSession={startSession}
                pauseSession={pauseSession}
                resumeSession={resumeSession}
                stopSession={stopSession}
                isActive={isActive}
                isPaused={isPaused}
                playAllAudioFeedback={playAllAudioFeedback}
                playCorrectAnswersOnly={playCorrectAnswersOnly}
                playHighScoresOnly={playHighScoresOnly}
                currentCardIndex={currentCardIndex}
            />
        </div>
    );
};

export default FastFireContainer;

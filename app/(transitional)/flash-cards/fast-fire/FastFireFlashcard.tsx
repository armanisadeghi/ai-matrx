"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { Volume2, Mic } from "lucide-react";
import { FlashcardData } from "@/types/flashcards.types";

interface FastFireProps {
    initialData: FlashcardData[];
    defaultTimer?: number;
    disabled?: boolean;
    isActive?: boolean;
    isPaused?: boolean;
    currentCard?: FlashcardData;
    currentCardIndex?: number;
    isRecording?: boolean;
    audioLevel?: number;
    isProcessing?: boolean;
    timeLeft?: number;
    bufferTimeLeft?: number;
    isInBufferPhase?: boolean;
}

const FastFireFlashcard = ({
    initialData,
    defaultTimer = 5,
    disabled = false,
    isActive = false,
    isPaused = false,
    currentCard,
    currentCardIndex = 0,
    isRecording = false,
    audioLevel = 0,
    isProcessing = false,
    timeLeft = defaultTimer,
    bufferTimeLeft = 3,
    isInBufferPhase = true,
}: FastFireProps) => {
    if (!currentCard || !isActive) {
        return (
            <div className="flex items-center justify-center h-64">
                <Card className="w-full max-w-2xl">
                    <CardContent className="p-6 text-center">
                        <h2 className="text-2xl font-bold mb-4">Ready to Practice</h2>
                        <p className="text-muted-foreground">{initialData.length} cards in this set. Click Start when ready.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const progressPercentage = isInBufferPhase ? (bufferTimeLeft / 3) * 100 : (timeLeft / defaultTimer) * 100;

    const audioScale = isRecording ? 1 + (audioLevel / 255) * 0.5 : 1;
    const audioOpacity = isRecording ? 0.3 + (audioLevel / 255) * 0.7 : 1;

    return (
        <div className="w-full max-w-2xl mx-auto">
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentCard.id}
                    initial={{ x: 100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -100, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                    <Card className="w-full">
                        <CardContent className="p-6">
                            <div className="text-sm text-muted-foreground mb-2">
                                Card {currentCardIndex + 1} of {initialData.length}
                            </div>
                            <div className="text-2xl font-bold text-center mb-8">{currentCard.front}</div>
                            <div className="relative h-2 bg-secondary rounded-full overflow-hidden mb-4">
                                <motion.div
                                    className="absolute top-0 left-0 h-full bg-primary"
                                    initial={{ width: "100%" }}
                                    animate={{ width: `${progressPercentage}%` }}
                                    transition={{ duration: 0.1 }}
                                />
                            </div>
                            <div className="flex justify-center items-center gap-4">
                                <div className="text-3xl font-bold">{isInBufferPhase ? bufferTimeLeft : timeLeft}</div>
                                <motion.div animate={{ scale: audioScale }} transition={{ duration: 0.1 }}>
                                    {isRecording ? (
                                        <Volume2 className="h-6 w-6 text-destructive" style={{ opacity: audioOpacity }} />
                                    ) : (
                                        <Mic className="h-6 w-6 text-muted-foreground" />
                                    )}
                                </motion.div>
                            </div>
                            <AnimatePresence mode="wait">
                                {isInBufferPhase && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="text-center mt-4 text-sm text-muted-foreground"
                                    >
                                        Get ready to answer...
                                    </motion.div>
                                )}
                                {isRecording && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="text-center mt-4 text-sm text-primary"
                                    >
                                        Recording in progress...
                                    </motion.div>
                                )}
                                {isProcessing && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="text-center mt-4 text-sm text-info"
                                    >
                                        Processing response...
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </CardContent>
                    </Card>
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default FastFireFlashcard;

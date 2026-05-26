'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Minus, Plus, Shuffle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AiChatModal from "@/app/(transitional)/flash-cards/ai/AiChatModal";
import { useFlashcard } from '@/hooks/flashcard-app/useFlashcard';

const FlashcardControls: React.FC<{ flashcardHook: ReturnType<typeof useFlashcard> }> = ({ flashcardHook }) => {
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
        audioModalActions : {
            playActiveCardAudio,
            playCustomTextAudio,
            playIntroAudio,
            playOutroAudio
        }
    } = flashcardHook;

    return (
        <div className="w-full flex flex-col space-y-4">
            <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-2">
                <Button onClick={handlePrevious} variant="outline"
                        className="w-full sm:w-auto flex-1 hover:scale-105 transition-transform bg-card">
                    <ArrowLeft className="mr-2 h-4 w-4"/> Previous
                </Button>
                <Button onClick={handleNext} variant="outline"
                        className="w-full sm:w-auto flex-1 hover:scale-105 transition-transform bg-card">
                    Next <ArrowRight className="ml-2 h-4 w-4"/>
                </Button>
                <Button onClick={shuffleCards} variant="outline"
                        className="w-full sm:w-auto flex-1 hover:scale-105 transition-transform bg-card">
                    <Shuffle className="mr-2 h-4 w-4"/> Shuffle
                </Button>
                <Select onValueChange={handleSelectChange} value={currentIndex.toString()}>
                    <SelectTrigger className="w-full sm:w-auto flex-1 hover:scale-105 transition-transform bg-card">
                        <SelectValue placeholder="Select a flashcard"/>
                    </SelectTrigger>
                    <SelectContent>
                        {allFlashcards.map((card, index) => (
                            <SelectItem key={card.order} value={index.toString()}>
                                {`${card.order}: ${card.front.length > 50 ? card.front.substring(0, 50) + '...' : card.front}`}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
                <Button
                    onClick={playActiveCardAudio}
                    variant="outline"
                    className="w-full hover:scale-105 transition-transform bg-card"
                >
                    I'm confused
                </Button>
                <Button
                    onClick={openAiModal}
                    variant="outline"
                    className="w-full hover:scale-105 transition-transform bg-card"
                >
                    I have a question
                </Button>
                <Button
                    onClick={() => openAiAssistModal('example')}
                    variant="outline"
                    className="w-full hover:scale-105 transition-transform bg-card"
                >
                    Give me an example
                </Button>
                <div className="flex items-center justify-between w-full px-3 py-1 rounded-md border bg-card hover:scale-105 transition-transform">
                    <Button
                        onClick={() => setFontSize((prev) => Math.max(18, prev - 2))}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 p-0"
                    >
                        <Minus className="h-4 w-4"/>
                    </Button>
                    <span className="text-sm whitespace-nowrap">Font Size</span>
                    <Button
                        onClick={() => setFontSize((prev) => Math.min(36, prev + 2))}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 p-0"
                    >
                        <Plus className="h-4 w-4"/>
                    </Button>
                </div>
                <Button
                    onClick={() => openAiAssistModal('split')}
                    variant="outline"
                    className="w-full hover:scale-105 transition-transform bg-card"
                >
                    Split cards
                </Button>
                <Button
                    onClick={() => openAiAssistModal('combine')}
                    variant="outline"
                    className="w-full hover:scale-105 transition-transform bg-card"
                >
                    Combine cards
                </Button>
                <Button
                    onClick={() => openAiAssistModal('compare')}
                    variant="outline"
                    className="w-full hover:scale-105 transition-transform bg-card"
                >
                    Compare Cards
                </Button>
            </div>

            {activeFlashcard && (
                    <AiChatModal
                        isOpen={isAiModalOpen}
                        onClose={closeAiModal}
                        firstName={firstName}
                    />
            )}
        </div>
    );
};

export default FlashcardControls;

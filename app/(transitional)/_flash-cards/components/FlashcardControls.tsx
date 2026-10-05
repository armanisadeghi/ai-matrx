'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Minus, Plus, Shuffle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AiChatModal from "@/app/(transitional)/_flash-cards/ai/AiChatModal";
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
                <Button icon={<ArrowLeft/>} onClick={handlePrevious} variant="outline"
                        className="w-full sm:w-auto flex-1"> Previous
                </Button>
                <Button iconEnd={<ArrowRight/>} onClick={handleNext} variant="outline"
                        className="w-full sm:w-auto flex-1">
                    Next
                </Button>
                <Button icon={<Shuffle/>} onClick={shuffleCards} variant="outline"
                        className="w-full sm:w-auto flex-1"> Shuffle
                </Button>
                <Select onValueChange={handleSelectChange} value={currentIndex.toString()}>
                    <SelectTrigger className="w-full sm:w-auto flex-1 hover:scale-105">
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
                    className="w-full"
                >
                    I'm confused
                </Button>
                <Button
                    onClick={openAiModal}
                    variant="outline"
                    className="w-full"
                >
                    I have a question
                </Button>
                <Button
                    onClick={() => openAiAssistModal('example')}
                    variant="outline"
                    className="w-full"
                >
                    Give me an example
                </Button>
                <div className="flex items-center justify-between w-full px-3 py-1 rounded-md border bg-card hover:scale-105 transition-transform">
                    <Button
                        icon={<Minus/>} aria-label="Decrease font size"
                        onClick={() => setFontSize((prev) => Math.max(18, prev - 2))}
                        variant="quiet"
                    />
                    <span className="text-sm whitespace-nowrap">Font Size</span>
                    <Button
                        icon={<Plus/>} aria-label="Increase font size"
                        onClick={() => setFontSize((prev) => Math.min(36, prev + 2))}
                        variant="quiet"
                    />
                </div>
                <Button
                    onClick={() => openAiAssistModal('split')}
                    variant="outline"
                    className="w-full"
                >
                    Split cards
                </Button>
                <Button
                    onClick={() => openAiAssistModal('combine')}
                    variant="outline"
                    className="w-full"
                >
                    Combine cards
                </Button>
                <Button
                    onClick={() => openAiAssistModal('compare')}
                    variant="outline"
                    className="w-full"
                >
                    Compare Cards
                </Button>
            </div>

            {activeFlashcard && (
                    <AiChatModal
                        isOpen={isAiModalOpen}
                        onClose={closeAiModal}
                        firstName={firstName ?? "there"}
                    />
            )}
        </div>
    );
};

export default FlashcardControls;

'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import {
    AArrowDown,
    AArrowUp,
    ArrowLeft,
    ArrowRight,
    Shuffle,
    Headphones,
    MessageSquare
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AiChatModal from "@/app/(transitional)/flash-cards/ai/AiChatModal";
import { useFlashcard } from "@/hooks/flashcard-app/useFlashcard";
import {introOutroText} from '@/app/(transitional)/flashcard/app-data';
import AiAssistModal from "@/app/(transitional)/flash-cards/ai/AiAssistModal";

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

    const [modalText, setModalText] = React.useState("");

    const handleOpenAudioModalWithText = (text: string) => {
        playCustomTextAudio(text);
    };

    const iconButtonConfigs = [
        {
            id: 'previous',
            icon: ArrowLeft,
            onClick: handlePrevious,
            title: 'Previous'
        },
        {
            id: 'next',
            icon: ArrowRight,
            onClick: handleNext,
            title: 'Next'
        },
        {
            id: 'shuffle',
            icon: Shuffle,
            onClick: shuffleCards,
            title: 'Shuffle'
        },
        {
            id: 'decrease-font',
            icon: AArrowDown,
            onClick: () => setFontSize((prev) => Math.max(18, prev - 2)),
            title: 'Decrease font size'
        },
        {
            id: 'increase-font',
            icon: AArrowUp,
            onClick: () => setFontSize((prev) => Math.min(36, prev + 2)),
            title: 'Increase font size'
        },
        {
            id: 'audio-help',
            icon: Headphones,
            onClick: playActiveCardAudio,
            title: "I'm confused (Audio help)"
        },
        {
            id: 'chat-help',
            icon: MessageSquare,
            onClick: openAiModal,
            title: 'Ask a question (Chat)'
        }
    ];

    const actionButtonConfigs = [
        {
            id: 'intro',
            label: 'Intro',
            onClick: () => handleOpenAudioModalWithText(introOutroText.introText)
        },
        {
            id: 'outro',
            label: 'Outro',
            onClick: () => handleOpenAudioModalWithText(introOutroText.outroText)
        },
        {
            id: 'confused',
            label: "I'm confused",
            onClick: playActiveCardAudio
        },
        {
            id: 'question',
            label: 'I have a question',
            onClick: openAiModal
        },
        {
            id: 'example',
            label: 'Give me an example',
            onClick: () => openAiAssistModal('example')
        },
        {
            id: 'split',
            label: 'Split cards',
            onClick: () => openAiAssistModal('split')
        },
        {
            id: 'combine',
            label: 'Combine cards',
            onClick: () => openAiAssistModal('combine')
        },
        {
            id: 'compare',
            label: 'Compare Cards',
            onClick: () => openAiAssistModal('compare')
        }
    ];

    return (
        <div className="w-full flex flex-col space-y-2">
            {/* Top controls section - grid for desktop, stack for mobile */}
            <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Left column - Icon buttons */}
                <div className="w-full flex justify-center sm:justify-start">
                    <div className="inline-flex items-center gap-2 bg-card/50 rounded-lg p-2">
                        {iconButtonConfigs.map(({ id, icon: Icon, onClick, title }) => (
                            <Button
                                key={id}
                                onClick={onClick}
                                variant="outline"
                                size="icon"
                                className="w-10 h-10 hover:scale-105 transition-transform bg-card"
                                title={title}
                            >
                                <Icon className="h-6 w-6"/>
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Right column - Select component */}
                <div className="w-full flex items-center">
                    <Select onValueChange={handleSelectChange} value={currentIndex.toString()}>
                        <SelectTrigger className="w-full bg-card">
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
            </div>

            {/* Action Buttons Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {actionButtonConfigs.map(button => (
                    <Button
                        key={button.id}
                        onClick={button.onClick}
                        variant="outline"
                        className="w-full hover:scale-105 transition-transform bg-card"
                    >
                        {button.label}
                    </Button>
                ))}
            </div>

            {activeFlashcard && (
                <>
                    <AiChatModal
                        isOpen={isAiModalOpen}
                        onClose={closeAiModal}
                        firstName={firstName}
                    />
                    <AiAssistModal
                        isOpen={isAiAssistModalOpen}
                        onClose={closeAiAssistModal}
                        message={aiAssistModalMessage}
                        defaultTab={aiAssistModalDefaultTab}
                    />
                </>
            )}
        </div>
    );
};

export default FlashcardControls;

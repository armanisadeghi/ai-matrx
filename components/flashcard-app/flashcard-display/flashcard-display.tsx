'use client';

import { FlashcardFront } from "./flashcard-front";
import { FlashcardBack } from "./flashcard-back";
import { useFlashcard } from '@/hooks/flashcard-app/useFlashcard';

export default function FlashcardDisplay({ flashcardHook }: { flashcardHook: ReturnType<typeof useFlashcard> }) {
    const {
        activeFlashcard,
        isFlipped,
        fontSize,
        handleFlip,
        handleAnswer,
        mobileHandlers,
        textModalActions: { openAiModal }
    } = flashcardHook;

    if (!activeFlashcard) return null;

    return (
        <div className="w-full min-h-[400px] lg:h-full [perspective:1000px]">
            <div
                className={`relative w-full h-full transition-all duration-500 [transform-style:preserve-3d] ${
                    isFlipped ? "[transform:rotateY(180deg)]" : ""
                }`}
                onClick={handleFlip}
            >
                <div className="absolute w-full h-full [backface-visibility:hidden]">
                    <FlashcardFront
                        content={activeFlashcard.front}
                        fontSize={fontSize}
                    />
                </div>

                <div className="absolute w-full h-full [transform:rotateY(180deg)] [backface-visibility:hidden]">
                    <FlashcardBack
                        answer={activeFlashcard.back}
                        detailedExplanation={activeFlashcard.detailedExplanation ?? ''}
                        example={activeFlashcard.example ?? ''}
                        dynamicContent={activeFlashcard.dynamicContent}
                        fontSize={fontSize}
                        onAnswer={handleAnswer}
                        onAskQuestion={openAiModal}
                    />
                </div>
            </div>
        </div>
    );
}

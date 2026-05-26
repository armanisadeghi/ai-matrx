import React from 'react';
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, MessageSquare } from 'lucide-react';
import MarkdownRenderer from "@/components/mardown-display/MarkdownRenderer";
import { ArmaniCollapsible } from '@/components/matrx/matrx-collapsible/armani-collapsible';

const FlashcardDisplay = ({ flashcardHook }) => {
    const {
        activeFlashcard,
        isFlipped,
        fontSize,
        handleFlip,
        handleAnswer,
        handleAskQuestion,
    } = flashcardHook;

    const frontFontSize = fontSize + 20;
    const backAnswerFontSize = fontSize + 4;
    const backFontSize = fontSize;
    const titleFontSize = fontSize + 2;

    const getTitleFontSizeClass = (size) => {
        if (size <= 16) return 'text-base';
        if (size <= 18) return 'text-lg';
        if (size <= 20) return 'text-xl';
        return 'text-2xl';
    };

    if (!activeFlashcard) {
        return <div>No card data available</div>;
    }

    return (
        <div className="w-full min-h-[400px] lg:h-full [perspective:1000px]">
            <div
                className={`relative w-full h-full transition-all duration-500 [transform-style:preserve-3d] ${
                    isFlipped ? "[transform:rotateY(180deg)]" : ""
                }`}
                onClick={handleFlip}
            >
                {/* Front of card */}
                <Card className="absolute inset-0 w-full h-full [backface-visibility:hidden] bg-gradient-to-br from-zinc-800 via-zinc-900 to-black">
                    <CardContent className="flex-grow flex items-center justify-center p-6 overflow-auto h-full">
                        <p className="text-center text-white" style={{ fontSize: `${frontFontSize}px` }}>
                            {activeFlashcard.front}
                        </p>
                    </CardContent>
                </Card>
                {/* Back of card */}
                <Card className="absolute inset-0 w-full h-full [backface-visibility:hidden] [transform:rotateY(180deg)] bg-gradient-to-br from-zinc-800 via-zinc-900 to-black">
                    <CardContent className="flex-grow flex flex-col items-start justify-start p-6 overflow-auto h-[calc(100%-60px)] space-y-4">
                        <MarkdownRenderer
                            content={activeFlashcard.back}
                            type="flashcard"
                            fontSize={backAnswerFontSize}
                        />
                        <div className="w-full border-t border-zinc-700" />

                        <div onClick={e => e.stopPropagation()}>
                            <ArmaniCollapsible
                                title={<span className="text-purple-400 font-bold" style={{ fontSize: `${titleFontSize}px` }}>
                                    Detailed Explanation
                                </span>}
                                id="detailed-explanation"
                                collapsibleToChip={false}
                                className="w-full"
                                titleFontSize={getTitleFontSizeClass(titleFontSize)}
                            >
                                <div className="pl-6 text-zinc-100">
                                    <MarkdownRenderer
                                        content={activeFlashcard.detailedExplanation}
                                        type="flashcard"
                                        fontSize={backFontSize}
                                    />
                                </div>
                            </ArmaniCollapsible>
                        </div>

                        <div className="w-full border-t border-zinc-700" />

                        <div onClick={e => e.stopPropagation()}>
                            <ArmaniCollapsible
                                title={<span className="text-purple-400 font-bold" style={{ fontSize: `${titleFontSize}px` }}>
                                    Example
                                </span>}
                                id="example"
                                collapsibleToChip={false}
                                className="w-full"
                                titleFontSize={getTitleFontSizeClass(titleFontSize)}
                            >
                                <div className="pl-6 text-zinc-100">
                                    <MarkdownRenderer
                                        content={activeFlashcard.example}
                                        type="flashcard"
                                        fontSize={backFontSize}
                                    />
                                </div>
                            </ArmaniCollapsible>
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-between p-2 absolute bottom-0 left-0 right-0">
                        <Button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleAnswer(false);
                            }}
                            variant="destructive"
                            className="sm:px-4 px-2 text-sm sm:text-base"
                        >
                            <XCircle className="sm:mr-2 mr-0 h-4 w-4 sm:flex hidden"/>
                            <XCircle className="h-4 w-4 sm:hidden flex"/>
                            <span className="sm:inline hidden">Incorrect</span>
                        </Button>
                        <Button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleAskQuestion();
                            }}
                            variant="secondary"
                            className="sm:px-4 px-2 text-sm sm:text-base"
                        >
                            <MessageSquare className="sm:mr-2 mr-0 h-4 w-4 sm:flex hidden"/>
                            <MessageSquare className="h-4 w-4 sm:hidden flex"/>
                            <span className="sm:inline hidden">Ask a Question</span>
                        </Button>
                        <Button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleAnswer(true);
                            }}
                            variant="default"
                            className="bg-primary hover:bg-green-700 sm:px-4 px-2 text-sm sm:text-base"
                        >
                            <CheckCircle className="sm:mr-2 mr-0 h-4 w-4 sm:flex hidden"/>
                            <CheckCircle className="h-4 w-4 sm:hidden flex"/>
                            <span className="sm:inline hidden">Correct</span>
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
};

export default FlashcardDisplay;

// File location: app\(authenticated)\tests\flash-cards\hold-hold-page.tsx

'use client'

import React from 'react';
import FlashcardComponent from './components/FlashcardComponent';
import { Cover } from "@/components/ui/cover";

const FlashcardsPage: React.FC = () => {
    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground overflow-auto">
            <h1 className="text-xl md:text-2xl lg:text-4xl font-semibold w-full text-center py-2 bg-clip-text text-transparent bg-gradient-to-b from-neutral-800 via-neutral-700 to-neutral-700 dark:from-neutral-800 dark:via-white dark:to-white">
                History <Cover>Flashcards</Cover>
            </h1>

            <div className="flex-grow p-4">
                <FlashcardComponent dataSetId={"historyFlashcards"}/>
            </div>
        </div>
    );
};

export default FlashcardsPage;

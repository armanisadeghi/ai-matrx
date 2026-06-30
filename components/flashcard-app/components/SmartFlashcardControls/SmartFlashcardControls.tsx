"use client";

import React from "react";

import AiChatModal from "@/app/(transitional)/flash-cards/ai/AiChatModal";
import { ActionButtonGroup, ActionButton } from "./SmartActionButtons";
import NavigationButton from "./SmartNavigationButtons";
import FontSizeButton from "./SmartUiButtons";
import FlashcardSelect from "./FlashcardSelect";
import { useFlashcard } from "@/hooks/flashcard-app/useFlashcard";
import AiAssistModal from "@/app/(transitional)/flash-cards/ai/AiAssistModal";

const FlashcardControls: React.FC<{
  flashcardHook: ReturnType<typeof useFlashcard>;
}> = ({ flashcardHook }) => {
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
  } = flashcardHook;

  return (
    <div className="w-full flex flex-col space-y-2">
      {/* Top controls section */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Left column - Icon buttons */}
        <div className="w-full flex justify-center sm:justify-start">
          <div className="inline-flex items-center gap-2 bg-card/50 rounded-lg p-2">
            <NavigationButton type="previous" flashcardHook={flashcardHook} />
            <NavigationButton type="next" flashcardHook={flashcardHook} />
            <NavigationButton type="shuffle" flashcardHook={flashcardHook} />
            <FontSizeButton type="decrease" flashcardHook={flashcardHook} />
            <FontSizeButton type="increase" flashcardHook={flashcardHook} />
            <ActionButton
              type="confused"
              flashcardHook={flashcardHook}
              iconMode
            />
            <ActionButton
              type="question"
              flashcardHook={flashcardHook}
              iconMode
            />
          </div>
        </div>

        {/* Right column - Select component */}
        <div className="w-full flex items-center">
          <FlashcardSelect flashcardHook={flashcardHook} className="w-full" />
        </div>
      </div>

      <ActionButtonGroup flashcardHook={flashcardHook} />

      {activeFlashcard && (
        <>
          <AiChatModal
            isOpen={isAiModalOpen}
            onClose={closeAiModal}
            firstName={firstName ?? ""}
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

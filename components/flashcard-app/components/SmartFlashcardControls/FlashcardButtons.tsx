// FlashcardButtons.tsx
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
import {SmartButtonProps} from "./types";

export const PreviousButton: React.FC<SmartButtonProps> = ({ flashcardHook, className }) => (
    <Button
        icon={<ArrowLeft/>} aria-label="Previous"
        onClick={flashcardHook.handlePrevious}
        variant="outline"
        className={`w-10 h-10 hover:scale-105 transition-transform bg-card ${className || ''}`}
        title="Previous"
    />
);

export const NextButton: React.FC<SmartButtonProps> = ({ flashcardHook, className }) => (
    <Button
        icon={<ArrowRight/>} aria-label="Next"
        onClick={flashcardHook.handleNext}
        variant="outline"
        className={`w-10 h-10 hover:scale-105 transition-transform bg-card ${className || ''}`}
        title="Next"
    />
);

export const ShuffleButton: React.FC<SmartButtonProps> = ({ flashcardHook, className }) => (
    <Button
        icon={<Shuffle/>} aria-label="Shuffle"
        onClick={flashcardHook.shuffleCards}
        variant="outline"
        className={`w-10 h-10 hover:scale-105 transition-transform bg-card ${className || ''}`}
        title="Shuffle"
    />
);

export const DecreaseFontButton: React.FC<SmartButtonProps> = ({ flashcardHook, className }) => (
    <Button
        icon={<AArrowDown/>} aria-label="Decrease font size"
        onClick={() => flashcardHook.setFontSize((prev) => Math.max(18, prev - 2))}
        variant="outline"
        className={`w-10 h-10 hover:scale-105 transition-transform bg-card ${className || ''}`}
        title="Decrease font size"
    />
);

export const IncreaseFontButton: React.FC<SmartButtonProps> = ({ flashcardHook, className }) => (
    <Button
        icon={<AArrowUp/>} aria-label="Increase font size"
        onClick={() => flashcardHook.setFontSize((prev) => Math.min(36, prev + 2))}
        variant="outline"
        className={`w-10 h-10 hover:scale-105 transition-transform bg-card ${className || ''}`}
        title="Increase font size"
    />
);

export const AudioHelpButton: React.FC<SmartButtonProps> = ({ flashcardHook, className }) => (
    <Button
        icon={<Headphones/>} aria-label="I'm confused (Audio help)"
        onClick={flashcardHook.audioModalActions.playActiveCardAudio}
        variant="outline"
        className={`w-10 h-10 hover:scale-105 transition-transform bg-card ${className || ''}`}
        title="I'm confused (Audio help)"
    />
);

export const ChatHelpButton: React.FC<SmartButtonProps> = ({ flashcardHook, className }) => (
    <Button
        icon={<MessageSquare/>} aria-label="Ask a question (Chat)"
        onClick={flashcardHook.textModalActions.openAiModal}
        variant="outline"
        className={`w-10 h-10 hover:scale-105 transition-transform bg-card ${className || ''}`}
        title="Ask a question (Chat)"
    />
);

export const NavigationButtonGroup: React.FC<SmartButtonProps> = ({ flashcardHook, className }) => (
    <div className={`inline-flex items-center gap-2 ${className || ''}`}>
        <PreviousButton flashcardHook={flashcardHook} />
        <NextButton flashcardHook={flashcardHook} />
        <ShuffleButton flashcardHook={flashcardHook} />
    </div>
);

export const FontControlButtonGroup: React.FC<SmartButtonProps> = ({ flashcardHook, className }) => (
    <div className={`inline-flex items-center gap-2 ${className || ''}`}>
        <DecreaseFontButton flashcardHook={flashcardHook} />
        <IncreaseFontButton flashcardHook={flashcardHook} />
    </div>
);

export const HelpButtonGroup: React.FC<SmartButtonProps> = ({ flashcardHook, className }) => (
    <div className={`inline-flex items-center gap-2 ${className || ''}`}>
        <AudioHelpButton flashcardHook={flashcardHook} />
        <ChatHelpButton flashcardHook={flashcardHook} />
    </div>
);

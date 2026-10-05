import React from 'react';
import { Button } from "@/components/ui/button";
import {
    AArrowDown,
    AArrowUp,
    ArrowLeft,
    ArrowRight,
    Shuffle,
    Headphones,
    MessageSquare,
    PlayCircle,
    StopCircle,
    HelpCircle,
    MessagesSquare,
    Split,
    Combine,
    GitCompare,
    Component, Volume2
} from 'lucide-react';
import {useFlashcard} from "@/hooks/flashcard-app/useFlashcard";

// Types
type FlashcardHook = ReturnType<typeof useFlashcard>;

interface SmartButtonProps {
    flashcardHook: FlashcardHook;
    className?: string;
    iconMode?: boolean;
}

type ActionButtonType = 'intro' | 'outro' | 'confused' | 'question' | 'example' | 'split' | 'combine' | 'compare';

const actionButtonConfig = {
    intro: {
        label: 'Intro',
        icon: PlayCircle,
        action: (hook: FlashcardHook) => hook.audioModalActions.playIntroAudio,
        title: 'Play Introduction'
    },
    outro: {
        label: 'Outro',
        icon: StopCircle,
        action: (hook: FlashcardHook) => hook.audioModalActions.playOutroAudio,
        title: 'Play Conclusion'
    },
    confused: {
        label: "I'm confused",
        icon: Volume2,
        action: (hook: FlashcardHook) => () => hook.audioModalActions.playActiveCardAudio(),
        title: "I'm Confused: Audio Response"
    },
    question: {
        label: 'I have a question',
        icon: MessagesSquare,
        action: (hook: FlashcardHook) => hook.textModalActions.openAiModal,
        title: 'I have a question: Text Chat Response'
    },
    example: {
        label: 'Give me an example',
        icon: Component,
        // action: (hook: FlashcardHook) => () => hook.aiModalActions.openAiAssistModal('example'),
        action: (hook: FlashcardHook) => () => console.log('AI Assist Modal - Example requested'),
        title: 'Show Example'
    },
    split: {
        label: 'Split cards',
        icon: Split,
        // action: (hook: FlashcardHook) => () => hook.aiModalActions.openAiAssistModal('split'),
        action: (hook: FlashcardHook) => () => console.log('AI Assist Modal - Split cards requested'),
        title: 'Split Cards'
    },
    combine: {
        label: 'Combine cards',
        icon: Combine,
        // action: (hook: FlashcardHook) => () => hook.aiModalActions.openAiAssistModal('combine'),
        action: (hook: FlashcardHook) => () => console.log('AI Assist Modal - Combine cards requested'),
        title: 'Combine Cards'
    },
    compare: {
        label: 'Compare Cards',
        icon: GitCompare,
        // action: (hook: FlashcardHook) => () => hook.aiModalActions.openAiAssistModal('compare'),
        action: (hook: FlashcardHook) => () => console.log('AI Assist Modal - Compare cards requested'),
        title: 'Compare Cards'
    }
} as const;


export const ActionButton: React.FC<SmartButtonProps & {
    type: ActionButtonType
}> = ({ flashcardHook, type, className, iconMode = false }) => {
    const config = actionButtonConfig[type];
    const Icon = config.icon;
    const action = config.action(flashcardHook);

    if (iconMode) {
        return (
            <Button
                icon={<Icon/>} aria-label={config.title}
                onClick={action}
                variant="outline"
                className={`w-10 h-10 hover:scale-105 transition-transform bg-card ${className || ''}`}
                title={config.title}
            />
        );
    }

    return (
        <Button
            onClick={action}
            variant="outline"
            className={`w-full hover:scale-105 transition-transform bg-card ${className || ''}`}
        >
            {config.label}
        </Button>
    );
};

// Helper component for rendering a group of action buttons
interface ActionButtonGroupProps {
    flashcardHook: FlashcardHook;
    className?: string;
    iconMode?: boolean;
    types?: ActionButtonType[];
}

export const ActionButtonGroup: React.FC<ActionButtonGroupProps> = ({
    flashcardHook,
    className,
    iconMode = false,
    types = ['intro', 'outro', 'confused', 'question', 'example', 'split', 'combine', 'compare']
}) => {
    const buttonClassName = iconMode
        ? 'gap-2'
        : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2';

    return (
        <div className={`${buttonClassName} ${className || ''}`}>
            {types.map(type => (
                <ActionButton
                    key={type}
                    type={type}
                    flashcardHook={flashcardHook}
                    iconMode={iconMode}
                />
            ))}
        </div>
    );
};

// Example usage of individual buttons or groups:
export const ExampleUsage: React.FC = () => {
    const flashcardHook = useFlashcard([]);

    return (
        <div>
            {/* Icon mode buttons in a row */}
            <div className="flex gap-2">
                <ActionButton type="intro" flashcardHook={flashcardHook} iconMode />
                <ActionButton type="question" flashcardHook={flashcardHook} iconMode />
            </div>

            {/* Regular buttons in a grid */}
            <ActionButtonGroup flashcardHook={flashcardHook} />

            {/* Icon buttons in a row */}
            <ActionButtonGroup flashcardHook={flashcardHook} iconMode />

            {/* Subset of buttons */}
            <ActionButtonGroup
                flashcardHook={flashcardHook}
                types={['intro', 'outro', 'question']}
                iconMode
            />
        </div>
    );
};

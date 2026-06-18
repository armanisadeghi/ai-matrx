// components/audio/AudioModal.tsx
'use client';

import React from 'react';
import {
    Credenza,
    CredenzaContent,
    CredenzaHeader,
    CredenzaTitle,
    CredenzaDescription,
    CredenzaBody,
} from "@/components/ui/credenza-modal/credenza";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Headphones } from 'lucide-react';
import SpeakerGroupCore from '@/features/tts/components/SpeakerGroupCore';
import { READ_ALOUD_DICTIONARY_SURFACE } from "@/features/dictionary/constants";
import { cn } from "@/lib/utils";

interface AudioModalProps {
    isOpen: boolean;
    onClose: () => void;
    text: string;
    icon?: React.ReactNode;
    title?: string;
    description?: string;
    hideText?: boolean;
    className?: string;
    dictionarySurfaceKey?: string;
}

const AudioModal: React.FC<AudioModalProps> = ({
    isOpen,
    onClose,
    text,
    icon = <Headphones className="h-6 w-6 sm:h-8 sm:w-8" />,
    title = "Audio Explanation",
    description = "Listen to the audio explanation.",
    hideText = false,
    className,
    dictionarySurfaceKey = READ_ALOUD_DICTIONARY_SURFACE,
}) => {
    return (
        <Credenza open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <CredenzaContent
                className={cn(
                    "sm:max-w-[800px] max-h-[90dvh] w-[95vw] sm:w-[90vw]",
                    className
                )}
            >
                <CredenzaHeader>
                    <CredenzaTitle className="text-xl sm:text-3xl font-bold flex items-center gap-2">
                        {icon}
                        {title}
                    </CredenzaTitle>
                    <CredenzaDescription className="text-base sm:text-lg text-muted-foreground">
                        {description}
                    </CredenzaDescription>
                </CredenzaHeader>
                <CredenzaBody className="mt-4 sm:mt-6 flex flex-col gap-4">
                    {!hideText && (
                        <ScrollArea className="flex-grow h-[30dvh] sm:h-[40dvh] w-full rounded-md border p-4">
                            <div className="text-base sm:text-lg leading-relaxed whitespace-pre-wrap">
                                {text}
                            </div>
                        </ScrollArea>
                    )}
                    <div className={cn("w-full flex justify-center", hideText ? "mt-0" : "mt-4 sm:mt-6")}>
                        {/* Auto-plays on open via SpeakerGroupCore; keyed by text so
                            switching cards remounts and re-speaks; unmounts on close to stop. */}
                        {isOpen && <SpeakerGroupCore key={text} text={text} autoStart dictionarySurfaceKey={dictionarySurfaceKey} />}
                    </div>
                </CredenzaBody>
            </CredenzaContent>
        </Credenza>
    );
};

export default AudioModal;

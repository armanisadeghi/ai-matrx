// flash-cards/components/AiChatModal.tsx
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppSelector, useAppDispatch } from '@/lib/redux/hooks';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowUp } from 'lucide-react';
import { useAiChat } from '@/hooks/flashcard-app/useAiChat';
import { LiveRunDisplay } from '@/features/agents/components/live-run/LiveRunDisplay';
import { addMessage } from '@/lib/redux/slices/flashcardChatSlice';
import {
    selectActiveFlashcard,
    selectActiveFlashcardChat
} from '@/lib/redux/selectors/flashcardSelectors';
import MarkdownRenderer from "@/components/mardown-display/MarkdownRenderer";
import { LiveHelpAnswerBlock } from "@/features/education/tutor/components/LiveHelpAnswerBlock";
import type { ChatMessage } from "@/types/flashcards.types";
import { QuickActionButtons } from './prompts-buttons';

interface AiChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    firstName: string;
}

const AiChatModal: React.FC<AiChatModalProps> = ({ isOpen, onClose }) => {
    const [message, setMessage] = useState('');
    const [activeTab, setActiveTab] = useState('current');
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const dispatch = useAppDispatch();
    const fontSize = 18;

    const currentFlashcard = useAppSelector(selectActiveFlashcard);
    const currentChat = useAppSelector(selectActiveFlashcardChat);
    const allChats = useAppSelector((state) => state.flashcardChat.flashcards);

    const { isLoading, conversationId, sendInitialMessage, sendMessage } = useAiChat();

    const allChatHistory = useMemo(() => {
        return Object.values(allChats).flatMap(flashcard =>
            flashcard.chat.map(msg => ({
                ...msg,
                content: `[Card ${flashcard.id}] ${msg.content}`
            }))
        );
    }, [allChats]);

    useEffect(() => {
        if (isOpen) {
            setActiveTab('current');
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && currentFlashcard && currentChat.length === 0) {
            sendInitialMessage(currentFlashcard);
        }
    }, [isOpen, currentFlashcard, sendInitialMessage, currentChat.length]);

    useEffect(() => {
        const handleBlur = () => {
            if (textAreaRef.current) {
                textAreaRef.current.blur();
            }
        };

        const textarea = textAreaRef.current;
        textarea?.addEventListener('blur', handleBlur);

        return () => {
            textarea?.removeEventListener('blur', handleBlur);
        };
    }, []);

    const handleSubmit = (customMessage?: string) => {
        const messageToSend = customMessage || message.trim();
        const flashcardId = currentFlashcard?.id;
        if (messageToSend && !isLoading && currentFlashcard && flashcardId) {
            dispatch(addMessage({
                flashcardId,
                message: { role: 'user', content: messageToSend }
            }));
            sendMessage(messageToSend, currentFlashcard);
            setMessage('');
        }
    };

    const renderMessage = (msg: ChatMessage) => {
        const role = msg.role as 'user' | 'assistant';
        const adjustedFontSize = role === 'assistant' ? fontSize + 4 : fontSize;

        return (
            <div className={`px-4 py-3 ${
                role === 'assistant'
                ? 'w-full'
                : 'ml-auto w-[85%] sm:w-[70%] md:w-[60%]'
            }`}>
                {msg.help ? (
                    // The tutor's structured answer — the `live_help_answer`
                    // kind component (followups + citations, not just text).
                    <LiveHelpAnswerBlock result={msg.help} />
                ) : (
                    <MarkdownRenderer
                        content={msg.content}
                        type="message"
                        role={role}
                        fontSize={adjustedFontSize}
                    />
                )}
            </div>
        );
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-background p-0 w-full h-[90dvh] sm:h-[90dvh] max-w-[95vw] sm:max-w-[85vw] md:max-w-[75vw] flex flex-col">
                <DialogHeader className="p-4 border-b">
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                        <div className="flex gap-2">
                            <Button
                                onClick={() => setActiveTab('current')}
                                variant="outline"
                                size="sm"
                                className={`${activeTab === 'current' ? 'bg-primary text-primary-foreground' : ''}`}
                            >
                                Current Card
                            </Button>
                            <Button
                                onClick={() => setActiveTab('all')}
                                variant="outline"
                                size="sm"
                                className={`${activeTab === 'all' ? 'bg-primary text-primary-foreground' : ''}`}
                            >
                                All History
                            </Button>
                        </div>
                        <DialogTitle className="text-md line-clamp-2">
                            {currentFlashcard?.front}
                        </DialogTitle>
                    </div>
                </DialogHeader>

                <ScrollArea className="flex-grow">
                    <div className="py-4 space-y-4">
                        {(activeTab === 'current' ? currentChat : allChatHistory).map((msg, idx) => (
                            <React.Fragment key={idx}>
                                {renderMessage(msg)}
                            </React.Fragment>
                        ))}
                        {isLoading && (
                            <LiveRunDisplay
                                conversationId={conversationId}
                                pending={!conversationId}
                                label="Your tutor is answering"
                                variant="bare"
                                className="px-4"
                            />
                        )}
                    </div>
                </ScrollArea>

                <div className="p-4 border-t space-y-4">
                    <QuickActionButtons
                        onSelect={handleSubmit}
                        isDisabled={isLoading}
                    />

                    <div className="relative w-full">
                        <Textarea
                            ref={textAreaRef}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit();
                                }
                            }}
                            placeholder="Type your question..."
                            className="w-full pr-12 resize-none"
                            rows={3}
                        />
                        <Button
                            onClick={() => handleSubmit()}
                            disabled={isLoading || !message.trim()}
                            className="absolute right-2 bottom-2 rounded-full p-2"
                            size="icon"
                        >
                            <ArrowUp className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default AiChatModal;

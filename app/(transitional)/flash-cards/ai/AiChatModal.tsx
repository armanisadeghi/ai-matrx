// flash-cards/components/AiChatModal.tsx
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppSelector, useAppDispatch } from '@/lib/redux/hooks';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowUp } from 'lucide-react';
import { useAiChat } from '../hooks/useAiChat';
import { addMessage } from '@/lib/redux/slices/flashcardChatSlice';
import {
    selectActiveFlashcard,
    selectActiveFlashcardChat, selectAllFlashcardData
} from '@/lib/redux/selectors/flashcardSelectors';
import MarkdownRenderer from "@/components/mardown-display/MarkdownRenderer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WalletCards } from 'lucide-react';

interface AiChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    firstName: string;
}

const QUICK_ACTIONS = {
    'Expand on this': 'Can you expand on this please?',
    'Create Table': 'Can you create a table to explain this?',
    'Simplify Explanation': 'Can you simplify the explanation? I am not sure I understand.',
    'Give me an example': 'Can you give me an example of this?',
    'Key Points': 'What are the most important points?',
    "Bigger Picture": "Can you explain how this fits into the bigger picture?",
    'Structure Information': 'Can you give me the critical information in a structured format?',
    'Create Outline': 'Can you create an outline to explain this?',
    'Create Bullet Points': 'Can you put the most important information into bullet points?',
} as const;

const AiChatModal: React.FC<AiChatModalProps> = ({ isOpen, onClose, firstName }) => {
    const [message, setMessage] = useState('');
    const [activeTab, setActiveTab] = useState('current');
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const dispatch = useAppDispatch();
    const fontSize = 18;

    const currentFlashcard = useAppSelector(selectActiveFlashcard);
    const currentChat = useAppSelector(selectActiveFlashcardChat);

    const allFlashcardData = useAppSelector(selectAllFlashcardData);

    const allChats = useAppSelector((state) => state.flashcardChat.flashcards);

    const { isLoading, streamingMessage, sendInitialMessage, sendMessage } = useAiChat();

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
            sendInitialMessage(currentFlashcard, firstName);
        }
    }, [isOpen, currentFlashcard, firstName, sendInitialMessage, currentChat.length]);

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
        if (messageToSend && !isLoading && currentFlashcard) {
            dispatch(addMessage({
                flashcardId: currentFlashcard.id,
                message: { role: 'user', content: messageToSend }
            }));
            const chatHistory = activeTab === 'current' ? currentChat : allChatHistory;
            sendMessage(messageToSend, currentFlashcard.id, chatHistory);
            setMessage('');
        }
    };

    const handleQuickAction = (action: string) => {
        handleSubmit(QUICK_ACTIONS[action as keyof typeof QUICK_ACTIONS]);
    };

    const renderMessage = (content: string, role: 'user' | 'assistant') => {
        const adjustedFontSize = role === 'assistant' ? fontSize + 4 : fontSize;

        return (
            <div className={`px-4 py-3 ${
                role === 'assistant'
                ? 'w-full'
                : 'ml-auto w-[85%] sm:w-[70%] md:w-[60%]'
            }`}>
                <MarkdownRenderer
                    content={content}
                    type="message"
                    role={role}
                    fontSize={adjustedFontSize}
                />
            </div>
        );
    };


    const formatFlashcardReference = (flashcard: any) => {
        return `\nReference to another flashcard:
            \`\`\`
            Front Content: ${flashcard.front}
            Back Content: ${flashcard.back}${flashcard.detailedExplanation ? `\nDetailed Explanation: ${flashcard.detailedExplanation}` : ''}
            \`\`\`\n`;
                };

    const handleFlashcardReference = (flashcardId: string) => {
        const selectedFlashcard = allFlashcardData.find(card => card.id === flashcardId);
        if (selectedFlashcard && textAreaRef.current) {
            const reference = formatFlashcardReference(selectedFlashcard);
            const cursorPosition = textAreaRef.current.selectionStart;

            setMessage(prevMessage => {
                const beforeCursor = prevMessage.substring(0, cursorPosition);
                const afterCursor = prevMessage.substring(cursorPosition);
                return beforeCursor + reference + afterCursor;
            });

            // Reset select value after insertion
            setTimeout(() => {
                if (textAreaRef.current) {
                    textAreaRef.current.focus();
                    const newPosition = cursorPosition + reference.length;
                    textAreaRef.current.setSelectionRange(newPosition, newPosition);
                }
            }, 0);
        }
    };


    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-background p-0 w-full h-[98vh] sm:h-[90vh] max-w-[95vw] sm:max-w-[85vw] md:max-w-[75vw] flex flex-col">
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
                                {renderMessage(msg.content, msg.role as 'user' | 'assistant')}
                            </React.Fragment>
                        ))}
                        {streamingMessage && renderMessage(streamingMessage, 'assistant')}
                        {isLoading && !streamingMessage && (
                            <div className="text-center py-2 text-muted-foreground animate-pulse">
                                AI is thinking...
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <div className="p-4 border-t space-y-4">
                    <div className="w-full overflow-x-auto scrollbar-hide">
                        <div className="flex gap-2 pb-2" ref={scrollContainerRef}>
                            {Object.entries(QUICK_ACTIONS).map(([label, _]) => (
                                <button
                                    key={label}
                                    onClick={() => handleQuickAction(label)}
                                    disabled={isLoading}
                                    className={`
                    py-3 px-5 rounded-full text-base font-medium
                    transition-all duration-200 
                    bg-secondary/40 hover:bg-secondary 
                    dark:bg-secondary/20 dark:hover:bg-secondary/40
                    disabled:opacity-50 disabled:cursor-not-allowed
                    whitespace-nowrap
                  `}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

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
                            className="w-full pr-24 resize-none"
                            rows={3}
                        />
                        <div className="absolute right-2 bottom-2 flex items-center gap-2">
                            <Select onValueChange={handleFlashcardReference}>
                                <SelectTrigger className="w-12 h-12 p-0 border-none hover:bg-primary/10 transition-colors">
                                    <WalletCards className="h-10 w-10 text-primary" />
                                    <SelectValue placeholder="" className="hidden" />
                                </SelectTrigger>
                                <SelectContent className="w-72">
                                    {allFlashcardData
                                        .filter(card => card.id !== currentFlashcard?.id)
                                        .map(card => (
                                            <SelectItem
                                                key={card.id}
                                                value={card.id}
                                            >
                                                {card.front.substring(0, 50)}
                                                {card.front.length > 50 ? '...' : ''}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                            <Button
                                onClick={() => handleSubmit()}
                                disabled={isLoading || !message.trim()}
                                className="rounded-full p-2"
                                size="icon"
                            >
                                <ArrowUp className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default AiChatModal;

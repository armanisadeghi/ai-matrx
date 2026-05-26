'use client';

import { useState, useTransition } from 'react';
import { processDebate } from '@/actions/ai-actions/groq-debate';
import { usePlayer } from '@/hooks/tts/usePlayer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Send, MessageSquare, User, LayoutTemplate, Volume2 } from 'lucide-react';
import { toast } from 'sonner';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export default function DebatePage() {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isPending, startTransition] = useTransition();
    const { isPlaying, play, stop } = usePlayer();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        
        if (!input.trim() || isPending || isPlaying) return;

        const userMessage = input.trim();
        setInput('');

        // Add user message to UI immediately
        setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

        startTransition(async () => {
            try {
                const formData = new FormData();
                formData.append('input', userMessage);
                
                // Add conversation history
                messages.forEach((msg) => {
                    formData.append('message', JSON.stringify(msg));
                });

                const { voiceStream, transcript, response } = await processDebate(formData);

                if (!response || !voiceStream) {
                    throw new Error('Invalid response from debate coach');
                }

                // Add assistant message to UI
                setMessages((prev) => [...prev, { role: 'assistant', content: response }]);

                // Play the audio response
                play(voiceStream, () => {
                    // Audio finished playing
                });

            } catch (error) {
                console.error('Error processing debate:', error);
                toast.error('Failed to get response from debate coach. Please try again.');
            }
        });
    }

    function handleReset() {
        stop();
        setMessages([]);
        setInput('');
        toast.success('Conversation reset');
    }

    return (
        <div className="h-full flex flex-col gap-4 p-4 md:p-6">
            {/* Header Card */}
            <Card className="shrink-0">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-xl md:text-2xl">Debate Coach Assistant</CardTitle>
                            <CardDescription className="mt-1">
                                Practice your debate skills with an AI coach
                            </CardDescription>
                        </div>
                        {messages.length > 0 && (
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={handleReset}
                                disabled={isPending || isPlaying}
                            >
                                Reset
                            </Button>
                        )}
                    </div>
                </CardHeader>
            </Card>

            {/* Messages Area */}
            <Card className="flex-1 flex flex-col min-h-0">
                <CardContent className="flex-1 p-0 flex flex-col min-h-0">
                    <ScrollArea className="flex-1 p-4">
                        {messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground">
                                <MessageSquare className="w-12 h-12 mb-3 opacity-50" />
                                <p className="text-sm md:text-base">
                                    Start your debate practice session by typing your argument or position below.
                                </p>
                                <p className="text-xs mt-2">
                                    The AI coach will challenge your points to help you prepare.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {messages.map((message, idx) => (
                                    <div
                                        key={idx}
                                        className={`flex gap-3 ${
                                            message.role === 'user' ? 'justify-end' : 'justify-start'
                                        }`}
                                    >
                                        {message.role === 'assistant' && (
                                            <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                                <LayoutTemplate className="w-4 h-4 text-primary" />
                                            </div>
                                        )}
                                        <div
                                            className={`rounded-lg px-4 py-3 max-w-[85%] md:max-w-[75%] ${
                                                message.role === 'user'
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-muted'
                                            }`}
                                        >
                                            <p className="text-sm md:text-base whitespace-pre-wrap">
                                                {message.content}
                                            </p>
                                        </div>
                                        {message.role === 'user' && (
                                            <div className="shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                                                <User className="w-4 h-4 text-primary-foreground" />
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {isPending && (
                                    <div className="flex gap-3 justify-start">
                                        <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                            <LayoutTemplate className="w-4 h-4 text-primary" />
                                        </div>
                                        <div className="rounded-lg px-4 py-3 bg-muted">
                                            <div className="flex items-center gap-2">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                <span className="text-sm text-muted-foreground">
                                                    Coach is thinking...
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </ScrollArea>

                    {/* Playing Indicator */}
                    {isPlaying && (
                        <div className="px-4 py-2 border-t bg-muted/30">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Volume2 className="w-4 h-4 animate-pulse" />
                                <span>Playing audio response...</span>
                            </div>
                        </div>
                    )}

                    {/* Input Area */}
                    <div className="p-4 border-t">
                        <form onSubmit={handleSubmit} className="flex gap-2">
                            <Textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Type your debate argument or response..."
                                className="min-h-[60px] max-h-[120px] resize-none"
                                disabled={isPending || isPlaying}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSubmit(e);
                                    }
                                }}
                            />
                            <Button
                                type="submit"
                                size="icon"
                                disabled={!input.trim() || isPending || isPlaying}
                                className="shrink-0 h-[60px] w-[60px]"
                            >
                                {isPending ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <Send className="w-5 h-5" />
                                )}
                            </Button>
                        </form>
                        <p className="text-xs text-muted-foreground mt-2">
                            Press Enter to send • Shift+Enter for new line
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

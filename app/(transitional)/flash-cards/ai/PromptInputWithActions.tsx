// app/(authenticated)/flash-cards/components/PromptInputWithActions.tsx

"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BasicTextarea } from "@/components/ui/textarea";
import { ArrowUp, Paperclip, Mic, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface PromptInputWithActionsProps {
    onSend: (message: string) => void;
}

const PromptInputWithActions: React.FC<PromptInputWithActionsProps> = ({ onSend }) => {
    const ideas = [
        {
            title: "Simplify this for me",
            description: "explain it in simple terms",
        },
        {
            title: "Expand on this topic",
            description: "Help me understand it better",
        },
        {
            title: "I'm totally confused about this",
            description: "Explain it in a different way",
        },
        {
            title: "Can you give me an example?",
            description: "I'd like to understand this with an example",
        },
    ];

    const [prompt, setPrompt] = useState<string>("");

    const handleSend = () => {
        if (prompt.trim()) {
            onSend(prompt);
            setPrompt("");
        }
    };

    return (
        <TooltipProvider>
            <div className="flex w-full flex-col gap-4">
                <ScrollArea className="w-full">
                    <div className="flex gap-2 pb-2">
                        {ideas.map(({title, description}, index) => (
                            <Button
                                key={index}
                                className="flex h-14 flex-col items-start gap-0 flex-shrink-0"
                                variant="outline"
                                onClick={() => setPrompt(title)}
                            >
                                <p className="text-sm font-medium">{title}</p>
                                <p className="text-xs text-muted-foreground">{description}</p>
                            </Button>
                        ))}
                    </div>
                </ScrollArea>
                <div className="flex w-full flex-col items-start rounded-lg bg-muted/50 transition-colors hover:bg-muted/70">
                    <div className="relative w-full">
                        <BasicTextarea
                            className="min-h-[80px] border-0 bg-transparent focus-visible:ring-0 pr-12 resize-none"
                            placeholder="Type your message..."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                        />
                        <div className="absolute right-2 bottom-2">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        size="sm"
                                        className="h-8 w-8"
                                        disabled={!prompt}
                                        onClick={handleSend}
                                    >
                                        <ArrowUp className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Send message</TooltipContent>
                            </Tooltip>
                        </div>
                    </div>
                    <div className="flex w-full items-center justify-between gap-2 px-4 pb-4">
                        <div className="flex w-full gap-1 md:gap-3">
                            <Button size="sm" variant="ghost">
                                <Paperclip className="h-4 w-4 mr-2" />
                                Attach
                            </Button>
                            <Button size="sm" variant="ghost">
                                <Mic className="h-4 w-4 mr-2" />
                                Voice Commands
                            </Button>
                            <Button size="sm" variant="ghost">
                                <FileText className="h-4 w-4 mr-2" />
                                Templates
                            </Button>
                        </div>
                        <p className="py-1 text-xs text-muted-foreground whitespace-nowrap">{prompt.length}/2000</p>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}

export default PromptInputWithActions;
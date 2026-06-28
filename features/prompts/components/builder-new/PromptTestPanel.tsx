import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, RefreshCw, Eraser, Cpu, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const PromptTestPanel: React.FC = () => {
    const dispatch = useAppDispatch();
    const conversation = useAppSelector(selectConversationMessages);
    const testMode = useAppSelector(selectTestModeState);
    const settings = useAppSelector(selectPromptSettings);
    const messages = useAppSelector(selectPromptMessages);
    const variables = useAppSelector(selectPromptVariables);
    const modelId = useAppSelector(selectSelectedModelId);

    const [input, setInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    // Streaming selectors
    const currentTaskId = testMode.currentTaskId;
    const streamingText = "";
    const isResponseEnded = true;

    // When stream ends, add the completed message to conversation and clear taskId
    useEffect(() => {
        if (isResponseEnded && currentTaskId && streamingText) {
            dispatch(addConversationMessage({ role: 'assistant', content: streamingText }));
            dispatch(setCurrentTaskId(null));
        }
    }, [isResponseEnded, currentTaskId, streamingText, dispatch]);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [conversation, streamingText]);

    const handleSend = async () => {
        if (!input.trim() && conversation.length > 0) return;

        // Add user message
        const userMsg = { role: 'user', content: input };
        dispatch(addConversationMessage(userMsg));
        setInput('');

        // Prepare payload
        // Replace variables in template messages
        const replaceVars = (content: string) => {
            let res = content;
            variables.forEach(v => {
                res = res.replace(new RegExp(`{{${v.name}}}`, 'g'), v.defaultValue);
            });
            return res;
        };

        const templateMessages = messages.map(m => ({
            role: m.role,
            content: replaceVars(m.content)
        }));

        // Combine template + conversation
        // If it's the first message, we might merge input with the last user message of template if logic requires,
        // but for simplicity, we'll append conversation to template.
        // Actually, usually "Test" means running the prompt.
        // If the prompt ends with a user message, we might not need input.
        // If it ends with system/assistant, we need input.

        const fullMessages = [...templateMessages, ...conversation, userMsg];

        const chatConfig = {
            model_id: modelId,
            messages: fullMessages,
            stream: true,
            ...settings,
        };

        try {
            // Pre-generate taskId and set it in Redux BEFORE dispatch so the
            // streaming UI mounts immediately and shows chunks as they arrive.
            const taskId = uuidv4();
            dispatch(setCurrentTaskId(taskId));

            await dispatch(createAndSubmitTask({
                service: "chat_service",
                taskName: "direct_chat",
                taskData: { chat_config: chatConfig },
                customTaskId: taskId,
            })).unwrap();
        } catch (error) {
            console.error("Failed to send message", error);
        }
    };

    return (
        <Card className="h-full border-l rounded-none flex flex-col">
            <CardHeader className="pb-4 flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-medium">Test & Chat</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => dispatch(clearConversation())}>
                    <Eraser className="h-4 w-4" />
                </Button>
            </CardHeader>
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-4">
                    {conversation.map((msg, i) => (
                        <div key={i} className={cn("flex flex-col space-y-1", msg.role === 'user' ? "items-end" : "items-start")}>
                            <div className={cn("px-3 py-2 rounded-lg max-w-[85%] text-sm",
                                msg.role === 'user' ? "bg-primary text-primary-foreground" : "bg-muted"
                            )}>
                                {msg.content}
                            </div>
                            <span className="text-[10px] text-muted-foreground capitalize">{msg.role}</span>
                        </div>
                    ))}

                    {/* Streaming Message */}
                    {currentTaskId && !isResponseEnded && (
                        <div className="flex flex-col space-y-1 items-start">
                            <div className="px-3 py-2 rounded-lg max-w-[85%] text-sm bg-muted animate-pulse">
                                {streamingText || "Thinking..."}
                            </div>
                            <span className="text-[10px] text-muted-foreground">Assistant</span>
                        </div>
                    )}
                </div>
            </ScrollArea>
            <div className="p-4 border-t space-y-2">
                <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type a message..."
                    className="min-h-[80px] resize-none"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                />
                <Button className="w-full" onClick={handleSend} disabled={!modelId}>
                    <Send className="w-4 h-4 mr-2" />
                    Send
                </Button>
            </div>
        </Card>
    );
};

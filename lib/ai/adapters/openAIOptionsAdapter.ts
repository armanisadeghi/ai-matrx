// lib/ai/adapters/openAIOptionsAdapter.ts

import OpenAI from 'openai';

type Role = 'system' | 'user' | 'assistant';

interface Message {
    role: Role;
    content: string;
}

interface BaseOptionsAdapter {
    streamResponse(message: string, onChunk: (chunk: string) => void): Promise<void>;
    streamResponse(message: Message, onChunk: (chunk: string) => void): Promise<void>;
    streamResponse(
        messageHistory: Message[],
        userMessage: Message,
        onChunk: (chunk: string) => void
    ): Promise<void>;
}

export default class OpenAIOptionsAdapter implements BaseOptionsAdapter {
    private client: OpenAI;

    constructor() {
        this.client = new OpenAI({
            apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY as string,
            dangerouslyAllowBrowser: true,
        });
    }

    async streamResponse(message: string, onChunk: (chunk: string) => void): Promise<void>;
    async streamResponse(message: Message, onChunk: (chunk: string) => void): Promise<void>;
    async streamResponse(messageHistory: Message[], userMessage: Message, onChunk: (chunk: string) => void): Promise<void>;
    async streamResponse(
        messageOrHistory: string | Message | Message[],
        onChunkOrUserMessage: ((chunk: string) => void) | Message,
        onChunk?: (chunk: string) => void
    ): Promise<void> {
        let messages: Message[];

        if (typeof messageOrHistory === 'string') {
            messages = [{ role: 'user', content: messageOrHistory }];
        } else if (Array.isArray(messageOrHistory)) {
            messages = [...messageOrHistory, onChunkOrUserMessage as Message];
        } else {
            messages = [messageOrHistory];
        }

        const stream = await this.client.chat.completions.create({
            model: 'gpt-4',
            messages,
            stream: true,
        });

        for await (const part of stream) {
            const chunk = part.choices[0]?.delta?.content;
            if (chunk) {
                if (typeof onChunkOrUserMessage === 'function') {
                    onChunkOrUserMessage(chunk);
                } else if (onChunk) {
                    onChunk(chunk);
                }
            }
        }
    }
}

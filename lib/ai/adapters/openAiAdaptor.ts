// File: lib/ai/adapters/openAIAdapter.ts

import OpenAI from 'openai';

type Role = 'system' | 'user' | 'assistant';

interface Message {
    role: Role;
    content: string;
}

interface BaseAdapter {
    streamResponse(message: string, onChunk: (chunk: string) => void): Promise<void>;
    streamResponseByMessageObject(message: Message, onChunk: (chunk: string) => void): Promise<void>;
    streamResponseByMessageHistory(messageHistory: Message[], userMessage: Message, onChunk: (chunk: string) => void): Promise<void>;
}

export default class OpenAIAdapter implements BaseAdapter {
    private client: OpenAI;

    constructor() {
        this.client = new OpenAI({
            apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY as string,
            dangerouslyAllowBrowser: true,
        });
    }

    async streamResponse(message: string, onChunk: (chunk: string) => void): Promise<void> {
        const stream = await this.client.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "user", content: message }],
            stream: true,
        });

        for await (const part of stream) {
            const chunk = part.choices[0]?.delta?.content;
            if (chunk) onChunk(chunk);
        }
    }

    async streamResponseByMessageObject(message: Message, onChunk: (chunk: string) => void): Promise<void> {
        const stream = await this.client.chat.completions.create({
            model: "gpt-4",
            messages: [message],
            stream: true,
        });

        for await (const part of stream) {
            const chunk = part.choices[0]?.delta?.content;
            if (chunk) onChunk(chunk);
        }
    }

    async streamResponseByMessageHistory(messageHistory: Message[], userMessage: Message, onChunk: (chunk: string) => void): Promise<void> {
        const updatedHistory = [...messageHistory, userMessage];

        const stream = await this.client.chat.completions.create({
            model: "gpt-4",
            messages: updatedHistory,
            stream: true,
        });

        for await (const part of stream) {
            const chunk = part.choices[0]?.delta?.content;
            if (chunk) onChunk(chunk);
        }
    }
}

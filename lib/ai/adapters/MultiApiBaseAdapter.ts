// File: lib/ai/adapters/multiApiBaseAdapter.ts

import Anthropic from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages.mjs";
import OpenAI from 'openai';



type SupportedAPI = 'anthropic' | 'openai';

export type ContentBlock = {
    type: 'text';
    text: string;
};

export type Message = {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
};

export type StreamOptions = {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    stop?: string | string[];
    responseFormat?: 'text' | 'json_object';
    seed?: number;
    logitBias?: Record<string, number>;
    user?: string;
    systemPrompt?: string;
    messageHistory?: Message[];
    functions?: any[];
    functionCall?: string | { name: string };
    [key: string]: any;
};

type OnChunkFunction = (chunk: string) => void;

class MultiApiBaseAdapter {
    private client: Anthropic | OpenAI;
    private apiType: SupportedAPI;

    constructor(apiType: SupportedAPI) {
        this.apiType = apiType;
        this.client = this.initializeClient();
    }

    private initializeClient(): Anthropic | OpenAI {
        switch (this.apiType) {
            case 'anthropic':
                return new Anthropic({apiKey: process.env.ANTHROPIC_API_KEY});
            case 'openai':
                return new OpenAI({apiKey: process.env.OPENAI_API_KEY});
            default:
                throw new Error(`Unsupported API type: ${this.apiType}`);
        }
    }

    async streamResponse(
        messages: Message[],
        onChunk: (chunk: string) => void | Promise<void>,
        options: StreamOptions
    ): Promise<void> {
        switch (this.apiType) {
            case 'anthropic':
                await this.streamAnthropicResponse(messages, onChunk, options);
                break;
            case 'openai':
                await this.streamOpenAIResponse(messages, onChunk, options);
                break;
            default:
                throw new Error(`Unsupported API type: ${this.apiType}`);
        }
    }

    private async streamAnthropicResponse(
        messages: Message[],
        onChunk: OnChunkFunction,
        options: StreamOptions
    ): Promise<void> {
        const anthropicClient = this.client as Anthropic;
        const anthropicMessages: MessageParam[] = messages.map(msg => ({
            role: msg.role,
            content: typeof msg.content === 'string' ? msg.content : msg.content[0].text
        }));

        const stream = await anthropicClient.messages.stream({
            model: options.model || 'claude-3-sonnet-20240229',
            max_tokens: options.maxTokens ?? 4096,
            temperature: options.temperature,
            top_p: options.topP,
            top_k: options.topK,
            system: options.systemPrompt,
            messages: anthropicMessages,
        });

        for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta') {
                if (chunk.delta.type === 'text_delta') {
                    onChunk(chunk.delta.text);
                }
                // Handle other delta types if needed
            }
            // Handle other chunk types if needed
        }
    }

    private async streamOpenAIResponse(
        messages: Message[],
        onChunk: OnChunkFunction,
        options: StreamOptions
    ): Promise<void> {
        const openaiClient = this.client as OpenAI;
        const stream = await openaiClient.chat.completions.create({
            model: options.model || 'gpt-4',
            messages: messages.map(msg => ({
                role: msg.role,
                content: typeof msg.content === 'string' ? msg.content : msg.content[0].text
            })),
            stream: true,
            max_tokens: options.maxTokens,
            temperature: options.temperature,
            top_p: options.topP,
            presence_penalty: options.presencePenalty,
            frequency_penalty: options.frequencyPenalty,
            stop: options.stop,
            response_format: options.responseFormat === 'json_object' ? {type: 'json_object'} : undefined,
            seed: options.seed,
            logit_bias: options.logitBias,
            user: options.user,
        });

        for await (const chunk of stream) {
            if (chunk.choices[0]?.delta?.content) {
                onChunk(chunk.choices[0].delta.content);
            }
        }
    }

    extractVariablesFromRecipe(recipe: Message[]): string[] {
        const variableRegex = /\{([^}]+)\}/g;
        const variables: string[] = [];

        recipe.forEach(message => {
            const content = Array.isArray(message.content) ? message.content : [{ text: message.content }];
            content.forEach(contentPart => {
                let match;
                while ((match = variableRegex.exec(contentPart.text)) !== null) {
                    variables.push(match[1]);
                }
            });
        });

        return Array.from(new Set(variables)); // Return unique variables
    }

    replaceVariablesInRecipe(recipe: Message[], variableValues: { [key: string]: string }): Message[] {
        return recipe.map(message => {
            const newMessage = { ...message };
            const content = Array.isArray(message.content) ? message.content : [{ text: message.content }];
            newMessage.content = content.map(contentPart => {
                let newText = contentPart.text;
                Object.keys(variableValues).forEach(variable => {
                    const variablePlaceholder = `{${variable}}`;
                    newText = newText.replace(new RegExp(variablePlaceholder, 'g'), variableValues[variable]);
                });
                return { ...contentPart, text: newText };
            });
            return newMessage;
        });
    }
}

export default MultiApiBaseAdapter;


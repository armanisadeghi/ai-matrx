// hooks/useAiChat.ts

import { useState, useCallback } from 'react';
import { useAppSelector, useAppDispatch } from '@/lib/redux/hooks';
import { Flashcard, ChatMessage } from "@/types/flashcards.types";
import { flashcardQuestionOne, systemContentOne } from "@/constants/flashcard-constants";

import { defaultAiModel } from "../utils/chatSettings";
import { openai } from "@/lib/ai/openAiBrowserClient";
import { addMessage } from '@/lib/redux/slices/flashcardChatSlice';
import { selectActiveFlashcardChat } from '@/lib/redux/selectors/flashcardSelectors';
import { ChatCompletionMessageParam } from 'openai/resources/chat/index.mjs';

export const useAiChat = () => {
    const dispatch = useAppDispatch();
    const [isLoading, setIsLoading] = useState(false);
    const [streamingMessage, setStreamingMessage] = useState('');

    const currentChat = useAppSelector(selectActiveFlashcardChat);

    const sendInitialMessage = useCallback(async (
        flashcard: Flashcard,
        firstName: string
    ) => {
        if (isLoading || currentChat.length > 0) return;

        setIsLoading(true);
        setStreamingMessage('');

        const aIFlashcardContext = `
            Topic: ${flashcard.topic || 'Unknown'}
            Lesson: ${flashcard.lesson || 'Unknown'}
            Grade Level: ${flashcard.gradeLevel || 'Unknown'}
            Front: ${flashcard.front || 'Unknown'}
            Back: ${flashcard.back || 'Unknown'}
            Example: ${flashcard.example || 'Unknown'}
            Detailed Explanation: ${flashcard.detailedExplanation || 'Unknown'}
            Audio Explanation: ${flashcard.audioExplanation || 'Unknown'}
        `;

        const initialMessages: ChatCompletionMessageParam[] = [
            { role: 'system', content: systemContentOne },
            { role: 'user', content: flashcardQuestionOne(firstName, aIFlashcardContext) },
        ];

        try {
            const stream = await openai.chat.completions.create({
                model: defaultAiModel,
                messages: initialMessages,
                stream: true,
            });

            let aiResponse = '';
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                aiResponse += content;
                setStreamingMessage(aiResponse);
            }

            dispatch(addMessage({ flashcardId: flashcard.id, message: { role: 'assistant', content: aiResponse } }));
        } catch (error) {
            console.error('Error fetching AI response:', error);
        } finally {
            setIsLoading(false);
            setStreamingMessage('');
        }
    }, [dispatch, isLoading, currentChat]);

    const sendMessage = useCallback(async (
        message: string,
        flashcardId: string,
        chatHistory: ChatMessage[]
    ) => {
        if (isLoading) return;
        setIsLoading(true);
        setStreamingMessage('');

        try {
            const messages: ChatCompletionMessageParam[] = [
                { role: 'system', content: systemContentOne },
                ...chatHistory.map(msg => ({ role: msg.role, content: msg.content } as ChatCompletionMessageParam)),
                { role: 'user', content: message }
            ];

            const stream = await openai.chat.completions.create({
                model: defaultAiModel,
                messages: messages,
                stream: true,
            });

            let aiResponse = '';
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                aiResponse += content;
                setStreamingMessage(aiResponse);
            }

            dispatch(addMessage({ flashcardId, message: { role: 'assistant', content: aiResponse } }));
        } catch (error) {
            console.error('Error fetching AI response:', error);
        } finally {
            setIsLoading(false);
            setStreamingMessage('');
        }
    }, [dispatch, isLoading]);

    return {
        isLoading,
        streamingMessage,
        sendInitialMessage,
        sendMessage,
    };
};

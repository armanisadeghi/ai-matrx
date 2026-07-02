'use client';

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { usePlayerSafe } from "./usePlayerSafe";
import { useMicVAD, utils } from "@ricky0123/vad-react";
import { nanoid } from 'nanoid';
import { processAiRequest } from "@/actions/ai-actions/assistant-modular";
import {
    ProcessState,
    Message,
    Conversation,
    ApiName,
    InputType,
    ServersideMessage, AiCallParams, ResponseType, AvailableAssistants, PartialBroker, Assistant
} from "@/types/voice/voiceAssistantTypes";
import {assistantOptions, getAssistant} from "@/constants/voice-assistants";

const DEFAULT_AI_REQUEST = {
    apiName: 'groq' as ApiName,
    responseType: 'audio' as InputType,
    voiceId: '79a125e8-cd45-4c13-8a67-188112f4dd22',
    assistant: getAssistant("defaultVoiceAssistant"),
    partialBrokers: [] as PartialBroker[],
    aiCallParams: {} as AiCallParams,
};

function truncateTitle(content: string): string {
    return content.split(' ').slice(0, 6).join(' ') +
        (content.split(' ').length > 6 ? '...' : '');
}

interface ActivityTiming {
    lastUserActivity: number;      // Timestamp of last user speech or text input
    lastAssistantActivity: number; // Timestamp of last assistant response completion
    lastAnyActivity: number;       // Most recent of either activity
    isActive: boolean;             // Whether any activity is currently ongoing
}

export const useVoiceChatCdn = () => {
    const [input, setInput] = useState<string>("");
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [currentConversationId, setCurrentConversationId] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [assistant, setAssistant] = useState<Assistant>(DEFAULT_AI_REQUEST.assistant);
    const [voiceId, setVoiceId] = useState<string>(DEFAULT_AI_REQUEST.voiceId);
    const [apiName, setApiName] = useState<ApiName>(DEFAULT_AI_REQUEST.apiName);
    const [aiCallParams, setAiCallParams] = useState<AiCallParams>(DEFAULT_AI_REQUEST.aiCallParams);
    const [partialBrokers, setPartialBrokers] = useState<PartialBroker[]>([]);
    const [responseType, setResponseType] = useState<ResponseType>(DEFAULT_AI_REQUEST.responseType);
    const [processState, setProcessState] = useState<ProcessState>({
        recording: false,
        processing: false,
        transcribing: false,
        generating: false,
        speaking: false,
    });
    const [currentTranscript, setCurrentTranscript] = useState<string>("");
    const [activityTiming, setActivityTiming] = useState<ActivityTiming>({
        lastUserActivity: Date.now(),
        lastAssistantActivity: Date.now(),
        lastAnyActivity: Date.now(),
        isActive: false
    });

    const player = usePlayerSafe();

    // Update activity timing when process state changes
    const updateActivityTiming = useCallback((isUserActivity: boolean) => {
        const currentTime = Date.now();
        setActivityTiming(prev => {
            const newTiming = {
                lastUserActivity: isUserActivity ? currentTime : prev.lastUserActivity,
                lastAssistantActivity: isUserActivity ? prev.lastAssistantActivity : currentTime,
                lastAnyActivity: currentTime,
                isActive: true
            };
            return newTiming;
        });
    }, []);

    // Initialize VAD
    const vad = useMicVAD({
        startOnLoad: true,
        onSpeechStart: () => {
            setProcessState(prev => ({ ...prev, recording: true }));
            updateActivityTiming(true);
        },
        onSpeechEnd: async (audio) => {
            try {
                setProcessState(prev => ({
                    ...prev,
                    recording: false,
                    processing: true
                }));

                const wav = utils.encodeWAV(audio);
                const audioBlob = new Blob([wav], { type: "audio/wav" });
                await submit(audioBlob);

                // Handle Firefox-specific behavior
                const isFirefox = navigator.userAgent.includes("Firefox");
                if (isFirefox) vad.pause();
            } catch (error) {
                console.error('Speech processing error:', error);
                toast.error("Failed to process speech");
                setProcessState(prev => ({
                    ...prev,
                    recording: false,
                    processing: false
                }));
                setActivityTiming(prev => ({ ...prev, isActive: false }));
            }
        },
        onVADMisfire: () => {
            console.log("VAD misfire");
            toast.warning("Speech detection was too short");
            setProcessState(prev => ({
                ...prev,
                recording: false,
                processing: false
            }));
            setActivityTiming(prev => ({ ...prev, isActive: false }));
        },
        positiveSpeechThreshold: 0.6,
        minSpeechMs: 4, // TODO: Verify correct value conversion from frames to ms
        redemptionMs: 8,
        preSpeechPadMs: 1, // NOTE: was `preSpeechPadFrames` (not a real vad-web option) — renamed only, value unchanged
        baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.22/dist/",
        onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/",
    });

    // Load conversations from localStorage
    useEffect(() => {
        const loadConversations = async () => {
            try {
                const savedConversations = await localStorage.getItem('voice-conversations');
                const parsedConversations: Conversation[] = savedConversations
                                                            ? JSON.parse(savedConversations)
                                                            : [];

                setConversations(parsedConversations);

                if (parsedConversations.length > 0) {
                    setCurrentConversationId(parsedConversations[0].id);
                } else {
                    createNewConversation();
                }
            } catch (error) {
                console.error('Error loading conversations:', error);
                createNewConversation();
            } finally {
                setIsLoading(false);
            }
        };

        loadConversations();
    }, []);

    // Save conversations to localStorage
    useEffect(() => {
        if (!isLoading) {
            localStorage.setItem('voice-conversations', JSON.stringify(conversations));
        }
    }, [conversations, isLoading]);

    // VAD error handling
    useEffect(() => {
        if (vad.errored) {
            console.error('VAD Error:', vad.errored);
            toast.error("Failed to initialize voice detection");
            setActivityTiming(prev => ({ ...prev, isActive: false }));
        }
    }, [vad.errored]);

    const createNewConversation = () => {
        const newConversation: Conversation = {
            id: nanoid(),
            title: `Conversation ${conversations.length + 1}`,
            messages: [],
            timestamp: Date.now(),
            structuredData: [],
            audioFeedback: [],
        };
        setConversations(prev => [newConversation, ...prev]);
        setCurrentConversationId(newConversation.id);
    };

    const deleteConversation = (id: string) => {
        setConversations(prev => prev.filter(conv => conv.id !== id));
        if (currentConversationId === id) {
            const remaining = conversations.filter(conv => conv.id !== id);
            if (remaining.length > 0) {
                setCurrentConversationId(remaining[0].id);
            } else {
                createNewConversation();
            }
        }
    };

    const addMessage = (userMessage: Message, assistantMessage: Message) => {
        setConversations(prev => prev.map(conv => {
            if (conv.id === currentConversationId) {
                return {
                    ...conv,
                    messages: [...conv.messages, userMessage, assistantMessage],
                    title: conv.messages.length === 0 ?
                           truncateTitle(userMessage.content) : conv.title
                };
            }
            return conv;
        }));
    };

    const handlePlaybackComplete = useCallback(() => {
        const isFirefox = navigator.userAgent.includes("Firefox");
        if (isFirefox) vad.start();
        setProcessState(prev => ({ ...prev, speaking: false }));
        updateActivityTiming(false);
        setActivityTiming(prev => ({ ...prev, isActive: false }));
    }, [vad, updateActivityTiming]);

    const submit = async (data: string | Blob) => {
        try {
            setProcessState(prev => ({
                ...prev,
                transcribing: data instanceof Blob,
                processing: true
            }));
            updateActivityTiming(true);

            const currentConversation = conversations.find(c => c.id === currentConversationId);
            const previousMessages = currentConversation?.messages.map(msg => ({
                role: msg.role,
                content: msg.content
            })) ?? [];

            const input = data instanceof Blob
                          ? new File([data], 'audio.wav', { type: 'audio/wav' })
                          : data;

            const result = await processAiRequest({
                apiName,
                input,
                inputType: data instanceof Blob ? 'audio' : 'text',
                responseType,
                voiceId,
                assistant: assistant.id,
                previousMessages,
                aiCallParams,
                partialBrokers,
            });

            setCurrentTranscript(result.transcript || '');
            setProcessState(prev => ({
                ...prev,
                transcribing: false,
                generating: true
            }));

            const latency = Date.now() - new Date().getTime();
            setProcessState(prev => ({
                ...prev,
                generating: false,
                speaking: true
            }));

            if (result.responseType === 'audio' && result.voiceStream) {
                player.play(result.voiceStream, handlePlaybackComplete);
            }

            const userMessage: Message = {
                id: nanoid(),
                role: "user",
                content: result.transcript || (typeof data === 'string' ? data : ''),
                timestamp: Date.now()
            };

            const assistantMessage: Message = {
                id: nanoid(),
                role: "assistant",
                content: typeof result.response === 'string' ? result.response : '[Stream]',
                latency,
                timestamp: Date.now()
            };

            addMessage(userMessage, assistantMessage);

            if (data instanceof Blob) {
                setInput('');
            }

        } catch (error) {
            console.error('Error in submit:', error);
            const message = error instanceof Error ? error.message : "An error occurred.";
            toast.error(message);
            setProcessState({
                recording: false,
                processing: false,
                transcribing: false,
                generating: false,
                speaking: false,
            });
            setActivityTiming(prev => ({ ...prev, isActive: false }));
        }
    };

    const handleSubmit = () => {
        if (!input.trim()) return;
        submit(input);
        setInput("");
    };

    const addPartialBroker = (id: string, value: string) => {
        setPartialBrokers((prev) => {
            if (prev.some((broker) => broker.id === id)) {
                return prev;
            }
            return [...prev, { id, value }];
        });
    };

    return {
        input,
        setInput,
        conversations,
        currentConversationId,
        currentTranscript,
        processState,
        activityTiming,
        vad,
        createNewConversation,
        deleteConversation,
        setCurrentConversationId,
        handleSubmit,
        getCurrentConversation: () => conversations.find(c => c.id === currentConversationId),
        assistant,
        setAssistant,
        voiceId,
        setVoiceId,
        apiName,
        setApiName,
        aiCallParams,
        setAiCallParams,
        partialBrokers,
        addPartialBroker,
        setPartialBrokers,
        responseType,
        setResponseType,
        isLoading,
        player,
    };
};
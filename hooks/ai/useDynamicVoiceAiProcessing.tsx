import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { nanoid } from 'nanoid';
import { processAiRequest } from "@/actions/ai-actions/assistant-modular";
import {
    ProcessState,
    Message,
    Conversation,
    ApiName,
    InputType,
    ServersideMessage,
    AiCallParams,
    ResponseType,
    Assistant,
    PartialBroker,
    StructuredResponse,
    AudioFeedbackItem
} from "@/types/voice/voiceAssistantTypes";
import TextToSpeechPlayer from "@/components/voice/TextToSpeechPlayer";

interface ProcessingState extends ProcessState {
    processing: boolean;
    generating: boolean;
}

interface ActivityTiming {
    lastUserActivity: number;
    lastAssistantActivity: number;
    lastAnyActivity: number;
    isActive: boolean;
}

interface DynamicResponse<T = StructuredResponse> {
    textResponse: string;
    structuredResponse?: T;
}

const DEFAULT_AI_REQUEST = {
    apiName: 'groq' as ApiName,
    responseType: 'text' as ResponseType,
    assistant: null as Assistant | null,
    partialBrokers: [] as PartialBroker[],
    aiCallParams: {} as AiCallParams,
};

export const useDynamicVoiceAiProcessing = (initialAssistant?: Assistant) => {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [currentConversationId, setCurrentConversationIdState] = useState<string>("");
    const [structuredResponses, setStructuredResponses] = useState<StructuredResponse[]>([]);
    const [audioFeedbackQueue, setAudioFeedbackQueue] = useState<AudioFeedbackItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [currentAudioIndex, setCurrentAudioIndex] = useState<number>(-1);
    const [input, setInput] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [assistant, setAssistant] = useState<Assistant | null>(initialAssistant || DEFAULT_AI_REQUEST.assistant);
    const [apiName, setApiName] = useState<ApiName>(DEFAULT_AI_REQUEST.apiName);
    const [aiCallParams, setAiCallParams] = useState<AiCallParams>(() => ({
        ...DEFAULT_AI_REQUEST.aiCallParams,
        responseFormat: assistant?.responseFormat
    }));
    const [partialBrokers, setPartialBrokers] = useState<PartialBroker[]>([]);
    const [responseType, setResponseType] = useState<ResponseType>(DEFAULT_AI_REQUEST.responseType);
    const [processState, setProcessState] = useState<ProcessingState>({
        recording: false,
        processing: false,
        transcribing: false,
        generating: false,
        speaking: false,
    });


    const [activityTiming, setActivityTiming] = useState<ActivityTiming>({
        lastUserActivity: Date.now(),
        lastAssistantActivity: Date.now(),
        lastAnyActivity: Date.now(),
        isActive: false
    });

    const audioPlayerRef = useRef<ReactNode>(null);

    const processStructuredResponse = useCallback((response: string | ReadableStream): StructuredResponse => {
        try {
            const parsed: StructuredResponse = typeof response === 'string' ? JSON.parse(response) : response;

            // Extract audio feedback if it exists
            if (typeof parsed.audioFeedback === 'string') {
                const feedbackItem: AudioFeedbackItem = {
                    id: nanoid(),
                    feedback: parsed.audioFeedback,
                    metadata: {
                        correct: parsed.correct,
                        score: parsed.score,
                        // Store any other relevant metadata
                        timestamp: Date.now()
                    },
                    timestamp: Date.now()
                };

                setAudioFeedbackQueue(prev => [...prev, feedbackItem]);
            }

            return parsed;
        } catch (error) {
            console.error('Error processing structured response:', error);
            return typeof response === 'string' ? { raw: response } : {};
        }
    }, []);

    const setCurrentConversationId = useCallback((id: string) => {
        setCurrentConversationIdState(id);
        setCurrentAudioIndex(-1);
        setAudioFeedbackQueue([]);
        audioPlayerRef.current = null;

        const conversation = conversations.find(c => c.id === id);
        if (conversation) {
            setStructuredResponses(conversation.structuredData || []);
            setAudioFeedbackQueue(conversation.audioFeedback || []);
        }
    }, [conversations]);


    const addStructuredResponse = useCallback((response: StructuredResponse) => {
        setStructuredResponses(prev => [...prev, response]);

        // Update conversation with structured data
        setConversations(prev => prev.map(conv => {
            if (conv.id === currentConversationId) {
                return {
                    ...conv,
                    structuredData: [...(conv.structuredData || []), response],
                    audioFeedback: [...(conv.audioFeedback || []),
                        ...(response.audioFeedback ? [{
                            id: nanoid(),
                            feedback: response.audioFeedback,
                            metadata: {
                                correct: response.correct,
                                score: response.score
                            },
                            timestamp: Date.now()
                        }] : [])
                    ]
                };
            }
            return conv;
        }));
    }, [currentConversationId]);

    // Update aiCallParams when assistant changes
    useEffect(() => {
        if (assistant?.responseFormat) {
            setAiCallParams(prev => ({
                ...prev,
                responseFormat: assistant.responseFormat
            }));
        }
    }, [assistant]);

    // Load conversations from localStorage
    useEffect(() => {
        const loadConversations = async () => {
            try {
                const savedConversations = localStorage.getItem('dynamic-conversations');
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
            localStorage.setItem('dynamic-conversations', JSON.stringify(conversations));
        }
    }, [conversations, isLoading]);

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

        setStructuredResponses([]);
        setAudioFeedbackQueue([]);
        setCurrentAudioIndex(-1);
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

    const addMessage = (userMessage: Message, assistantMessage: Message, structuredData?: StructuredResponse) => {
        setConversations(prev => prev.map(conv => {
            if (conv.id === currentConversationId) {
                const updatedMessages = [...conv.messages, userMessage, assistantMessage];
                return {
                    ...conv,
                    messages: updatedMessages,
                    title: conv.messages.length === 0 ?
                           userMessage.content.split(' ').slice(0, 6).join(' ') +
                               (userMessage.content.split(' ').length > 6 ? '...' : '') :
                           conv.title,
                    structuredData: structuredData ? [...(conv.structuredData || []), structuredData] : conv.structuredData
                };
            }
            return conv;
        }));
    };

    const updateActivityTiming = useCallback((isUserActivity: boolean) => {
        const currentTime = Date.now();
        setActivityTiming(prev => ({
            lastUserActivity: isUserActivity ? currentTime : prev.lastUserActivity,
            lastAssistantActivity: isUserActivity ? prev.lastAssistantActivity : currentTime,
            lastAnyActivity: currentTime,
            isActive: true
        }));
    }, []);

    const processResponse = (response: string | ReadableStream): DynamicResponse => {
        if (typeof response === 'string') {
            if (assistant?.responseFormat) {
                try {
                    const parsedResponse: StructuredResponse = JSON.parse(response);
                    const message = parsedResponse.message;
                    const text = parsedResponse.text;
                    return {
                        textResponse: typeof message === 'string' ? message : typeof text === 'string' ? text : response,
                        structuredResponse: parsedResponse
                    };
                } catch (error) {
                    console.error('Error parsing structured response:', error);
                    return { textResponse: response };
                }
            }
            return { textResponse: response };
        }

        return { textResponse: String(response) };
    };

    const playAllAudioFeedback = useCallback(async () => {
        setIsPlayingFiltered(false);
        setFilteredAudioQueue([]);
        if (currentAudioIndex === -1 && audioFeedbackQueue.length > 0) {
            setCurrentAudioIndex(0);
        }
    }, [currentAudioIndex, audioFeedbackQueue.length]);

    const [filteredAudioQueue, setFilteredAudioQueue] = useState<AudioFeedbackItem[]>([]);
    const [isPlayingFiltered, setIsPlayingFiltered] = useState(false);

    const playFilteredAudioFeedback = useCallback((filterFn: (item: AudioFeedbackItem) => boolean) => {
        const filteredQueue = audioFeedbackQueue.filter(filterFn);
        setFilteredAudioQueue(filteredQueue);
        setIsPlayingFiltered(true);
        if (filteredQueue.length > 0) {
            setCurrentAudioIndex(0);
        }
    }, [audioFeedbackQueue]);

    // Example filter functions
    const playCorrectAnswersOnly = useCallback(() => {
        playFilteredAudioFeedback(item => item.metadata.correct === true);
    }, [playFilteredAudioFeedback]);

    const playHighScoresOnly = useCallback((minScore: number) => {
        playFilteredAudioFeedback(item => item.metadata.score >= minScore);
    }, [playFilteredAudioFeedback]);

    // Get the active queue (filtered or full)
    const activeQueue = isPlayingFiltered && filteredAudioQueue.length > 0 ? filteredAudioQueue : audioFeedbackQueue;

    // Handle audio playback completion
    const handleAudioComplete = useCallback(() => {
        const queue = isPlayingFiltered && filteredAudioQueue.length > 0 ? filteredAudioQueue : audioFeedbackQueue;
        if (currentAudioIndex < queue.length - 1) {
            setCurrentAudioIndex(prev => prev + 1);
        } else {
            setCurrentAudioIndex(-1);
            setIsPlayingFiltered(false);
        }
    }, [currentAudioIndex, audioFeedbackQueue, filteredAudioQueue, isPlayingFiltered]);

    useEffect(() => {
        const queue = isPlayingFiltered && filteredAudioQueue.length > 0 ? filteredAudioQueue : audioFeedbackQueue;
        if (currentAudioIndex >= 0 && queue[currentAudioIndex]) {
            const currentFeedback = queue[currentAudioIndex];
            audioPlayerRef.current = (
                <TextToSpeechPlayer
                    text={currentFeedback.feedback}
                    autoPlay={true}
                    onPlaybackEnd={handleAudioComplete}
                />
            );
        } else {
            audioPlayerRef.current = null;
        }
    }, [currentAudioIndex, audioFeedbackQueue, filteredAudioQueue, isPlayingFiltered, handleAudioComplete]);



    const submit = async (data: string | Blob) => {
        try {
            setProcessState(prev => ({
                ...prev,
                processing: true,
                generating: true
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
                assistant: assistant?.id,
                previousMessages,
                aiCallParams,
                partialBrokers,
            });

            // Process the structured response first
            const processedResponse = processStructuredResponse(result.response);
            addStructuredResponse(processedResponse);

            // Then get the text response for display
            const { textResponse } = processResponse(result.response);

            const userMessage: Message = {
                id: nanoid(),
                role: "user",
                content: typeof data === 'string' ? data : result.transcript || '',
                timestamp: Date.now()
            };

            const assistantMessage: Message = {
                id: nanoid(),
                role: "assistant",
                content: textResponse,
                latency: Date.now() - new Date().getTime(),
                timestamp: Date.now()
            };

            addMessage(userMessage, assistantMessage, processedResponse);

            setProcessState(prev => ({
                ...prev,
                processing: false,
                generating: false
            }));
            updateActivityTiming(false);
            setActivityTiming(prev => ({ ...prev, isActive: false }));

            if (data instanceof Blob) {
                setInput('');
            }

        } catch (error) {
            console.error('Error in submit:', error);
            toast.error(error instanceof Error ? error.message : "An error occurred");
            setProcessState(prev => ({
                ...prev,
                processing: false,
                generating: false
            }));
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

    useEffect(() => {
        return () => {
            // Clean up audio playback when component unmounts
            setCurrentAudioIndex(-1);
            setAudioFeedbackQueue([]);
            audioPlayerRef.current = null;
        };
    }, []);



    return {
        input,
        setInput,
        conversations,
        currentConversationId,
        processState,
        activityTiming,
        createNewConversation,
        deleteConversation,
        setCurrentConversationId,
        handleSubmit,
        submit,
        getCurrentConversation: () => conversations.find(c => c.id === currentConversationId),
        assistant,
        setAssistant,
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

        audioFeedbackQueue,
        currentAudioIndex,
        audioPlayer: audioPlayerRef.current,
        playAllAudioFeedback,
        playFilteredAudioFeedback,
        playCorrectAnswersOnly,
        playHighScoresOnly,
        structuredResponses,
        isProcessing,

    };
};

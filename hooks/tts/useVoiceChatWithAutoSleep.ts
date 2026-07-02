'use client';

import {useState, useEffect, useCallback, useRef} from "react";
import {toast} from "sonner";
import {usePlayer} from "@/hooks/tts/usePlayer";
import {useMicVAD, utils} from "@ricky0123/vad-react";
import {nanoid} from 'nanoid';
import {processAiRequest} from "@/actions/ai-actions/assistant-modular";
import {ProcessState, Message, Conversation} from "@/types/voice/voiceAssistantTypes";
import {assistantOptions} from "@/constants/voice-assistants";

// Constants
const DEFAULT_AUTO_SLEEP_TIMEOUT = 60000; // 60 seconds
const NEVER_SLEEP_TIMEOUT = Number.MAX_SAFE_INTEGER;

interface ActivityTiming {
    lastUserActivity: number;
    lastAssistantActivity: number;
    lastAnyActivity: number;
    isActive: boolean;
}

interface AutoSleepConfig {
    enabled: boolean;
    timeout: number;
}

function truncateTitle(content: string): string {
    return content.split(' ').slice(0, 6).join(' ') +
        (content.split(' ').length > 6 ? '...' : '');
}

export const useVoiceChatWithAutoSleep = (initialAutoSleepConfig?: Partial<AutoSleepConfig>) => {
    // State Management
    const [input, setInput] = useState<string>("");
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [currentConversationId, setCurrentConversationId] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [selectedAssistant, setSelectedAssistant] = useState(assistantOptions[0]);
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

    // Sleep Management
    const [autoSleepConfig, setAutoSleepConfig] = useState<AutoSleepConfig>({
        enabled: initialAutoSleepConfig?.enabled ?? true,
        timeout: initialAutoSleepConfig?.timeout ?? DEFAULT_AUTO_SLEEP_TIMEOUT
    });
    const [isAsleep, setIsAsleep] = useState(false);

    // Refs for timers and state tracking
    const sleepTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const player = usePlayer();

    // Clear existing sleep timeout
    const clearSleepTimeout = useCallback(() => {
        if (sleepTimeoutRef.current) {
            clearTimeout(sleepTimeoutRef.current);
            sleepTimeoutRef.current = null;
        }
    }, []);

    // Set up new sleep timeout
    const setupSleepTimeout = useCallback(() => {
        clearSleepTimeout();

        if (autoSleepConfig.enabled && autoSleepConfig.timeout !== NEVER_SLEEP_TIMEOUT) {
            sleepTimeoutRef.current = setTimeout(() => {
                if (!activityTiming.isActive) {
                    setIsAsleep(true);
                    vad.pause();
                }
            }, autoSleepConfig.timeout);
        }
    }, [autoSleepConfig, activityTiming.isActive]);

    // Update activity timing and manage sleep state
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

        if (isAsleep) {
            setIsAsleep(false);
        }

        setupSleepTimeout();
    }, [isAsleep, setupSleepTimeout]);

    // External control methods
    const resetSleepTimer = useCallback(() => {
        updateActivityTiming(true);
    }, [updateActivityTiming]);

    const updateAutoSleepConfig = useCallback((newConfig: Partial<AutoSleepConfig>) => {
        setAutoSleepConfig(prev => {
            const updated = {
                ...prev,
                ...newConfig
            };

            if (!updated.enabled || updated.timeout === NEVER_SLEEP_TIMEOUT) {
                clearSleepTimeout();
                setIsAsleep(false);
            }

            return updated;
        });
    }, [clearSleepTimeout]);

    const wakeUp = useCallback(() => {
        if (isAsleep) {
            setIsAsleep(false);
            vad.start();
            resetSleepTimer();
        }
    }, [isAsleep, resetSleepTimer]);

    // Initialize VAD
    const vad = useMicVAD({
        startOnLoad: true,
        onSpeechStart: () => {
            setProcessState(prev => ({...prev, recording: true}));
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
                const audioBlob = new Blob([wav], {type: "audio/wav"});
                await submit(audioBlob);

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
                setActivityTiming(prev => ({...prev, isActive: false}));
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
            setActivityTiming(prev => ({...prev, isActive: false}));
        },
        positiveSpeechThreshold: 0.6,
        minSpeechMs: 4, // TODO: Verify correct value conversion from frames to ms
        redemptionMs: 8,
        preSpeechPadMs: 1, // NOTE: was `preSpeechPadFrames` (not a real vad-web option) — renamed only, value unchanged
        baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.22/dist/",
        onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/",
    });

    const createNewConversation = useCallback(() => {
        const newConversation: Conversation = {
            id: nanoid(),
            title: `Conversation ${conversations.length + 1}`,
            messages: [],
            timestamp: Date.now()
        };
        setConversations(prev => [newConversation, ...prev]);
        setCurrentConversationId(newConversation.id);
    }, [conversations.length]);

    const deleteConversation = useCallback((id: string) => {
        setConversations(prev => prev.filter(conv => conv.id !== id));
        if (currentConversationId === id) {
            const remaining = conversations.filter(conv => conv.id !== id);
            if (remaining.length > 0) {
                setCurrentConversationId(remaining[0].id);
            } else {
                createNewConversation();
            }
        }
    }, [currentConversationId, conversations, createNewConversation]);

    const addMessage = useCallback((userMessage: Message, assistantMessage: Message) => {
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
    }, [currentConversationId]);

    const handlePlaybackComplete = useCallback(() => {
        const isFirefox = navigator.userAgent.includes("Firefox");
        if (isFirefox) vad.start();
        setProcessState(prev => ({...prev, speaking: false}));
        updateActivityTiming(false);
        setActivityTiming(prev => ({...prev, isActive: false}));
    }, [vad, updateActivityTiming]);

    const submit = useCallback(async (data: string | Blob) => {
        try {
            if (isAsleep) {
                wakeUp();
                return;
            }

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
                          ? new File([data], 'audio.wav', {type: 'audio/wav'})
                          : data;

            const result = await processAiRequest({
                input,
                inputType: data instanceof Blob ? 'audio' : 'text',
                responseType: 'audio',
                assistant: selectedAssistant.id,
                previousMessages,
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
            setActivityTiming(prev => ({...prev, isActive: false}));
        }
    }, [isAsleep, wakeUp, currentConversationId, conversations, selectedAssistant.id, handlePlaybackComplete, addMessage]);

    const handleSubmit = useCallback(() => {
        if (!input.trim()) return;
        submit(input);
        setInput("");
    }, [input, submit]);

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
    }, [createNewConversation]);

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
            setActivityTiming(prev => ({...prev, isActive: false}));
        }
    }, [vad.errored]);

    // Clean up on unmount
    useEffect(() => {
        return () => {
            clearSleepTimeout();
        };
    }, [clearSleepTimeout]);

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
        selectedAssistant,
        setSelectedAssistant,
        isLoading,
        isAsleep,
        autoSleepConfig,
        updateAutoSleepConfig,
        resetSleepTimer,
        wakeUp,
        NEVER_SLEEP_TIMEOUT,
    };
};

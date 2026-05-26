import {useState, useCallback, useRef, useEffect} from 'react';
import {useToast} from "@/components/ui/use-toast";
import {FlashcardData} from "@/types/flashcards.types";
import {useDynamicVoiceAiProcessing} from "@/hooks/ai/useDynamicVoiceAiProcessing";
import {ApiName, Assistant} from "@/types/voice/voiceAssistantTypes";
import {getFlashcardSet} from '@/app/(transitional)/flashcard/app-data';
import {getAssistant} from "@/constants/voice-assistants";

interface SessionState {
    isActive: boolean;
    isPaused: boolean;
    isRecording: boolean;
    currentCardIndex: number;
    isProcessing: boolean;
    isInInitialCountdown: boolean;
}

export interface FlashcardResult {
    correct: boolean;
    score: number;
    audioFeedback: string;
    timestamp: number;
    cardId: string;
}

export interface FastFireSettings {
    secondsPerCard: number;
    numberOfCards: number;
}

interface UseFastFireSessionReturn {
    isActive: boolean;
    isPaused: boolean;
    isProcessing: boolean;
    isRecording: boolean;
    currentCardIndex: number;
    currentCard?: FlashcardData;
    results: FlashcardResult[];
    audioPlayer: HTMLAudioElement | null;
    timeLeft: number;
    isInInitialCountdown: boolean;
    initialCountdownLeft: number;
    audioLevel: number;
    processingCount: number;
    settings: FastFireSettings;
    availableCardsCount: number;
    startSession: (customSettings?: Partial<FastFireSettings>) => void;
    pauseSession: () => void;
    resumeSession: () => void;
    stopSession: (preserveResults?: boolean) => Promise<void>;
    startRecording: () => Promise<void>;
    stopRecording: () => Promise<void>;
    playAllAudioFeedback: () => void;
    playCorrectAnswersOnly: () => void;
    playHighScoresOnly: (minScore: number) => void;
    processState: any;
    totalCards: number;
}

// Centralized configuration for fast-fire session
export const FAST_FIRE_CONFIG = {
    // Timer settings
    answerTimerSeconds: 10,
    bufferTimerSeconds: 3,
    initialCountdownSeconds: 3,
    
    // Voice AI settings
    voiceConfig: {
        apiName: 'openai' as ApiName,
        voiceId: '79a125e8-cd45-4c13-8a67-188112f4dd22',
        responseType: 'audio' as const,
        temperature: 0.5,
        maxTokens: 2000
    },
    
    // Audio settings
    startSoundPath: '/sounds/2-second-start-beep-sound.mp3',
    endSoundPath: '/sounds/end-buzzer-sound.mp3',
    
    // Flashcard settings
    flashcardSet: 'historyFlashcards' as const,
} as const;

const assistant = getAssistant('flashcardGrader');

export const useFastFireSession = (): UseFastFireSessionReturn => {
    const {toast} = useToast();

    // Fetch all available flashcards
    const allFlashcards = getFlashcardSet(FAST_FIRE_CONFIG.flashcardSet).map((card, index) => ({
        ...card,
        id: card.id || `flashcard-${Date.now()}-${index}`
    }));
    const allFlashcardsRef = useRef<FlashcardData[]>(allFlashcards);
    const sessionFlashcardsRef = useRef<FlashcardData[]>([]);

    const [sessionState, setSessionState] = useState<SessionState>({
        isActive: false,
        isPaused: false,
        isProcessing: false,
        isRecording: false,
        currentCardIndex: -1,
        isInInitialCountdown: false
    });

    const [settings, setSettings] = useState<FastFireSettings>({
        secondsPerCard: FAST_FIRE_CONFIG.answerTimerSeconds,
        numberOfCards: allFlashcards.length
    });
    const [results, setResults] = useState<FlashcardResult[]>([]);
    const [timeLeft, setTimeLeft] = useState<number>(settings.secondsPerCard);
    const [initialCountdownLeft, setInitialCountdownLeft] = useState<number>(FAST_FIRE_CONFIG.initialCountdownSeconds);
    const [audioLevel, setAudioLevel] = useState(0);
    const [processingCount, setProcessingCount] = useState(0); // Track background processing

    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const audioChunks = useRef<Blob[]>([]);
    const startSound = useRef<HTMLAudioElement | undefined>(undefined);
    const endSound = useRef<HTMLAudioElement | undefined>(undefined);
    const audioContext = useRef<AudioContext | null>(null);
    const analyser = useRef<AnalyserNode | null>(null);
    const animationFrame = useRef<number | undefined>(undefined);
    const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);

    const {
        submit,
        audioPlayer,
        playAllAudioFeedback,
        playCorrectAnswersOnly,
        playHighScoresOnly,
        processState,
        getCurrentConversation,
        createNewConversation,
        setApiName,
        setAiCallParams,
        setPartialBrokers
    } = useDynamicVoiceAiProcessing(assistant);

    const cleanup = useCallback(async () => {
        try {
            // Clear timers
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = undefined;
            }
            
            // Clear animation frames
            if (animationFrame.current) {
                cancelAnimationFrame(animationFrame.current);
                animationFrame.current = undefined;
            }
            
            // Close audio context
            if (audioContext.current && audioContext.current.state !== 'closed') {
                await audioContext.current.close().catch(err => {
                    console.warn('Error closing audio context:', err);
                });
            }
            
            // Stop media recorder and tracks
            if (mediaRecorder.current) {
                if (mediaRecorder.current.state === 'recording') {
                    mediaRecorder.current.stop();
                }
                if (mediaRecorder.current.stream) {
                    mediaRecorder.current.stream.getTracks().forEach(track => {
                        try {
                            track.stop();
                        } catch (err) {
                            console.warn('Error stopping track:', err);
                        }
                    });
                }
                mediaRecorder.current = null;
            }
            
            // Reset refs and state
            audioContext.current = null;
            analyser.current = null;
            audioChunks.current = [];
            setAudioLevel(0);
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }, []);

    const stopSession = useCallback(async (preserveResults: boolean = true) => {
        try {
            await cleanup();
            setSessionState({
                isActive: false,
                isPaused: false,
                isProcessing: false,
                isRecording: false,
                currentCardIndex: -1,
                isInInitialCountdown: false
            });
            setTimeLeft(settings.secondsPerCard);
            setInitialCountdownLeft(FAST_FIRE_CONFIG.initialCountdownSeconds);
            
            // Only clear results if explicitly requested
            if (!preserveResults) {
                setResults([]);
                setProcessingCount(0);
            }
            
            // Show what we have so far
            if (preserveResults && results.length > 0) {
                setTimeout(() => {
                    toast({
                        title: "Session Stopped",
                        description: `Saved progress for ${results.length} card${results.length !== 1 ? 's' : ''}. You can review your results below.`,
                        variant: "default"
                    });
                }, 300);
            }
        } catch (error) {
            console.error('Error stopping session:', error);
            toast({
                title: "Error",
                description: "There was an error stopping the session. The page may need to be refreshed.",
                variant: "destructive"
            });
        }
    }, [cleanup, toast, settings.secondsPerCard, results.length]);

    const moveToNextCard = useCallback(async () => {
        const currentIndex = sessionState.currentCardIndex;
        
        // Check if we've completed all cards
        if (currentIndex >= sessionFlashcardsRef.current.length - 1) {
            await stopSession(true); // Preserve results
            
            // Wait a moment for any background processing to finish
            setTimeout(() => {
                toast({
                    title: "Session Complete!",
                    description: `You've completed all ${sessionFlashcardsRef.current.length} flashcards! Review your results below.`,
                    variant: "default"
                });
            }, 500);
            return false;
        }
        
        // Immediately move to next card - no waiting
        setSessionState(prev => ({
            ...prev,
            currentCardIndex: prev.currentCardIndex + 1,
            isRecording: false
        }));
        setTimeLeft(settings.secondsPerCard);
        return true;
    }, [sessionState.currentCardIndex, settings.secondsPerCard, stopSession, toast]);

    const handleRecordingComplete = useCallback(async (audioBlob: Blob, cardIndex: number) => {
        const currentFlashcard = sessionFlashcardsRef.current[cardIndex];
        if (!currentFlashcard) {
            return;
        }

        // Increment processing count
        setProcessingCount(prev => prev + 1);
        
        try {
            // Set flashcard context for AI grading
            setPartialBrokers([
                { id: 'flashcardFront', value: currentFlashcard.front },
                { id: 'flashcardBack', value: currentFlashcard.back }
            ]);
            
            // Process in background - don't block UI
            await submit(audioBlob);
            
            const conversation = getCurrentConversation();
            const lastResult = conversation?.structuredData?.[conversation.structuredData.length - 1];
            
            if (lastResult) {
                // Add result when it comes back
                setResults(prev => {
                    // Make sure we don't duplicate results
                    const exists = prev.find(r => r.cardId === currentFlashcard.id);
                    if (exists) return prev;
                    
                    return [...prev, {
                        correct: lastResult.correct,
                        score: lastResult.score,
                        audioFeedback: lastResult.audioFeedback,
                        cardId: currentFlashcard.id || `card-${cardIndex}`,
                        timestamp: Date.now()
                    }];
                });
            }
        } catch (error: any) {
            console.error('Error processing flashcard:', error);
            // Add a failed result
            setResults(prev => {
                const exists = prev.find(r => r.cardId === currentFlashcard.id);
                if (exists) return prev;
                
                return [...prev, {
                    correct: false,
                    score: 0,
                    audioFeedback: 'Processing failed',
                    cardId: currentFlashcard.id || `card-${cardIndex}`,
                    timestamp: Date.now()
                }];
            });
        } finally {
            // Decrement processing count
            setProcessingCount(prev => Math.max(0, prev - 1));
        }
    }, [submit, getCurrentConversation, setPartialBrokers]);

    const startRecording = useCallback(async () => {
        // Check browser support
        if (!navigator.mediaDevices?.getUserMedia) {
            toast({
                title: "Browser Not Supported",
                description: "Audio recording is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.",
                variant: "destructive"
            });
            await stopSession();
            return;
        }
        
        try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            // Set up audio context for visualization
            if (!audioContext.current || audioContext.current.state === 'closed') {
                audioContext.current = new AudioContext();
                analyser.current = audioContext.current.createAnalyser();
                analyser.current.fftSize = 256;
                const source = audioContext.current.createMediaStreamSource(stream);
                source.connect(analyser.current);
            }
            
            // Create media recorder with best available format
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                             ? 'audio/webm;codecs=opus'
                             : MediaRecorder.isTypeSupported('audio/webm')
                             ? 'audio/webm'
                             : 'audio/mp4'; // Fallback for Safari
            
            const recorder = new MediaRecorder(stream, { mimeType });
            
            // Handle data chunks
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    audioChunks.current.push(e.data);
                }
            };
            
            // Handle recording completion
            recorder.onstop = async () => {
                const recordedCardIndex = sessionState.currentCardIndex;
                
                try {
                    if (audioChunks.current.length === 0) {
                        throw new Error('No audio data recorded');
                    }
                    const audioBlob = new Blob(audioChunks.current, {type: mimeType});
                    
                    // Process in background - don't await
                    handleRecordingComplete(audioBlob, recordedCardIndex);
                    
                } catch (error) {
                    console.error('Error processing recording:', error);
                }
                
                // Always clear chunks and move on
                audioChunks.current = [];
            };
            
            // Handle recording errors
            recorder.onerror = (event) => {
                console.error('MediaRecorder error:', event);
                toast({
                    title: "Recording Error",
                    description: "An error occurred during recording. Please try again.",
                    variant: "destructive"
                });
                stopSession();
            };
            
            mediaRecorder.current = recorder;
            
            // Play start sound
            try {
                await startSound.current?.play();
            } catch (err) {
                console.warn('Could not play start sound:', err);
            }
            
            // Start recording
            recorder.start();
            
            // Set up audio visualization
            const updateAudio = () => {
                if (!analyser.current) return;
                const dataArray = new Uint8Array(analyser.current.frequencyBinCount);
                analyser.current.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                setAudioLevel(average);
                animationFrame.current = requestAnimationFrame(updateAudio);
            };
            updateAudio();
            
            // Update state
            setSessionState(prev => ({...prev, isRecording: true}));
            
        } catch (error: any) {
            console.error('Error starting recording:', error);
            
            let errorMessage = "Unable to access microphone. ";
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                errorMessage += "Please grant microphone permissions and try again.";
            } else if (error.name === 'NotFoundError') {
                errorMessage += "No microphone found. Please connect a microphone.";
            } else if (error.name === 'NotReadableError') {
                errorMessage += "Microphone is already in use by another application.";
            } else {
                errorMessage += "Please check your microphone settings and try again.";
            }
            
            toast({
                title: "Microphone Error",
                description: errorMessage,
                variant: "destructive"
            });
            
            await stopSession();
        }
    }, [handleRecordingComplete, stopSession, toast]);

    const stopRecording = useCallback(async () => {
        if (mediaRecorder.current?.state === 'recording') {
            // Play buzzer
            endSound.current?.play().catch(() => {});
            
            // Stop recording
            mediaRecorder.current.stop();
            
            // Stop all tracks
            if (mediaRecorder.current.stream) {
                mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
            }
            
            setSessionState(prev => ({...prev, isRecording: false}));
            
            // Immediately move to next card (don't wait for processing)
            await moveToNextCard();
        }
    }, [moveToNextCard]);

    const startSession = useCallback((customSettings?: Partial<FastFireSettings>) => {
        if (allFlashcardsRef.current.length === 0) {
            toast({
                title: "No Flashcards",
                description: "There are no flashcards to practice.",
                variant: "destructive"
            });
            return;
        }
        
        // Update settings if provided
        const newSettings = {
            ...settings,
            ...customSettings
        };
        setSettings(newSettings);
        
        // Select flashcards based on settings
        let selectedCards: FlashcardData[];
        if (newSettings.numberOfCards >= allFlashcardsRef.current.length) {
            // Use all cards
            selectedCards = [...allFlashcardsRef.current];
        } else {
            // Randomly select the specified number of cards
            const shuffled = [...allFlashcardsRef.current].sort(() => Math.random() - 0.5);
            selectedCards = shuffled.slice(0, newSettings.numberOfCards);
        }
        
        sessionFlashcardsRef.current = selectedCards;
        
        createNewConversation();
        setSessionState({
            isActive: true,
            isPaused: false,
            isProcessing: false,
            isRecording: false,
            currentCardIndex: -1, // Stay at -1 during initial countdown
            isInInitialCountdown: true
        });
        
        // Clear results when starting fresh
        setResults([]);
        setTimeLeft(newSettings.secondsPerCard);
        setInitialCountdownLeft(FAST_FIRE_CONFIG.initialCountdownSeconds);
        setProcessingCount(0);
        
        toast({
            title: "Session Starting",
            description: `Practicing ${selectedCards.length} card${selectedCards.length !== 1 ? 's' : ''} at ${newSettings.secondsPerCard} seconds each.`,
            variant: "default"
        });
    }, [createNewConversation, toast, settings]);

    const pauseSession = useCallback(() => {
        // Save current state before pausing
        setSessionState(prev => ({...prev, isPaused: true}));
        
        // Stop recording if active
        if (mediaRecorder.current?.state === 'recording') {
            mediaRecorder.current.stop();
            mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
        }
        
        // Timer cleanup happens in useEffect
    }, []);

    const resumeSession = useCallback(() => {
        // Resume with current timer values preserved
        setSessionState(prev => ({
            ...prev,
            isPaused: false,
            isRecording: false // Reset recording state on resume
        }));
        // Timer will restart automatically via useEffect
    }, []);

    useEffect(() => {
        setApiName(FAST_FIRE_CONFIG.voiceConfig.apiName);
        setAiCallParams({
            temperature: FAST_FIRE_CONFIG.voiceConfig.temperature,
            maxTokens: FAST_FIRE_CONFIG.voiceConfig.maxTokens,
            responseFormat: assistant.responseFormat,
        });
    }, [setApiName, setAiCallParams]);

    useEffect(() => {
        startSound.current = new Audio(FAST_FIRE_CONFIG.startSoundPath);
        endSound.current = new Audio(FAST_FIRE_CONFIG.endSoundPath);
        startSound.current.load();
        endSound.current.load();
        return () => {
            startSound.current = undefined;
            endSound.current = undefined;
        };
    }, []);

    // Timer management - simplified and reliable
    useEffect(() => {
        // Clear any existing timer
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = undefined;
        }

        // Only run timer if session is active and not paused
        if (!sessionState.isActive || sessionState.isPaused) {
            return;
        }

        // Phase 1: Initial countdown (before showing any cards)
        if (sessionState.isInInitialCountdown) {
            timerRef.current = setInterval(() => {
                setInitialCountdownLeft(prev => {
                    const newValue = prev - 1;
                    if (newValue <= 0) {
                        // Initial countdown complete, show first card and start recording
                        clearInterval(timerRef.current!);
                        timerRef.current = undefined;
                        
                        setSessionState(prevState => ({
                            ...prevState,
                            isInInitialCountdown: false,
                            currentCardIndex: 0
                        }));
                        
                        // Start recording immediately after a brief moment
                        setTimeout(() => {
                            startRecording().catch(error => {
                                console.error('Failed to start recording:', error);
                                toast({
                                    title: "Recording Error",
                                    description: "Failed to start recording. Please try again.",
                                    variant: "destructive"
                                });
                            });
                        }, 100);
                        
                        return FAST_FIRE_CONFIG.initialCountdownSeconds;
                    }
                    return newValue;
                });
            }, 1000);
        }
        // Phase 2: Card recording timer
        else if (sessionState.isRecording && sessionState.currentCardIndex >= 0) {
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    const newValue = prev - 1;
                    if (newValue <= 0) {
                        // Time's up - stop recording and move to next card
                        clearInterval(timerRef.current!);
                        timerRef.current = undefined;
                        
                        stopRecording().catch(error => {
                            console.error('Failed to stop recording:', error);
                        });
                        
                        return settings.secondsPerCard;
                    }
                    return newValue;
                });
            }, 1000);
        }
        // Phase 3: Waiting to start recording for a new card
        else if (!sessionState.isRecording && sessionState.currentCardIndex >= 0 && !sessionState.isInInitialCountdown) {
            // Start recording for this card
            startRecording().catch(error => {
                console.error('Failed to start recording:', error);
            });
        }

        // Cleanup
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = undefined;
            }
        };
    }, [
        sessionState.isActive,
        sessionState.isPaused,
        sessionState.isRecording,
        sessionState.isInInitialCountdown,
        sessionState.currentCardIndex,
        startRecording,
        stopRecording,
        toast
    ]);

    const currentCard = sessionState.currentCardIndex >= 0 
        ? sessionFlashcardsRef.current[sessionState.currentCardIndex] 
        : undefined;
    
    const totalCards = sessionFlashcardsRef.current.length;

    return {
        isActive: sessionState.isActive,
        isPaused: sessionState.isPaused,
        isProcessing: sessionState.isProcessing,
        isRecording: sessionState.isRecording,
        currentCardIndex: sessionState.currentCardIndex,
        currentCard,
        results,
        audioPlayer,
        timeLeft,
        isInInitialCountdown: sessionState.isInInitialCountdown,
        initialCountdownLeft,
        audioLevel,
        processingCount,
        settings,
        availableCardsCount: allFlashcardsRef.current.length,
        startSession,
        pauseSession,
        resumeSession,
        stopSession,
        startRecording,
        stopRecording,
        playAllAudioFeedback,
        playCorrectAnswersOnly,
        playHighScoresOnly,
        processState,
        totalCards
    };
};

import {useState, useCallback, useRef, useEffect, useId} from 'react';
import {useToast} from "@/components/ui/use-toast";
import {FlashcardData} from "@/types/flashcards.types";
import {useDynamicVoiceAiProcessing} from "@/hooks/ai/useDynamicVoiceAiProcessing";
import {ApiName, Assistant} from "@/types/voice/voiceAssistantTypes";
import {getFlashcardSet} from '@/app/(transitional)/flashcard/app-data';
import {getAssistant} from "@/constants/voice-assistants";
import {acquireMicStream, releaseMicStream} from "@/features/audio/micStream";
import {getSharedAudioContext, resumeSharedAudioContext} from "@/features/audio/audioContext";
import {claimCapture, releaseCapture} from "@/features/audio/captureLock";

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
    // Analyser lives on the SHARED AudioContext (never created/closed here — iOS
    // caps live contexts, so the whole app shares one). We only own the analyser
    // + the source node we connect into it, and disconnect those.
    const analyser = useRef<AnalyserNode | null>(null);
    const analyserSource = useRef<MediaStreamAudioSourceNode | null>(null);
    const animationFrame = useRef<number | undefined>(undefined);
    const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);
    // Whether we hold a ref on the shared mic singleton — keeps acquire/release
    // balanced exactly once across stop / pause / cleanup / takeover.
    const micHeldRef = useRef(false);
    // Stable id for the app-wide capture lock (one live capture, anywhere).
    const captureId = useId();
    // Latest stopSession — the capture lock ends the whole fast-fire session
    // cleanly when another recorder takes the mic (no broken half-state).
    const stopSessionRef = useRef<(preserveResults?: boolean) => Promise<void>>(
        async () => {}
    );

    /** Release our hold on the shared mic singleton (NEVER stop its tracks — the
     *  singleton owns the device) and disconnect the analyser source. */
    const releaseMic = useCallback(() => {
        if (analyserSource.current) {
            try { analyserSource.current.disconnect(); } catch { /* ignore */ }
            analyserSource.current = null;
        }
        if (micHeldRef.current) {
            releaseMicStream();
            micHeldRef.current = false;
        }
    }, []);

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

            // Stop media recorder — but NEVER stop the device tracks (they belong
            // to the shared mic singleton; stopping them kills every other holder
            // and defeats the warm-grant keepalive).
            if (mediaRecorder.current) {
                if (mediaRecorder.current.state === 'recording') {
                    mediaRecorder.current.stop();
                }
                mediaRecorder.current = null;
            }

            // Disconnect (don't close — the context is shared) the analyser.
            if (analyser.current) {
                try { analyser.current.disconnect(); } catch { /* ignore */ }
                analyser.current = null;
            }
            // Release our singleton hold + the capture lock.
            releaseMic();
            releaseCapture(captureId);

            // Reset refs and state
            audioChunks.current = [];
            setAudioLevel(0);
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }, [releaseMic, captureId]);

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
    // Keep the capture-lock takeover handle pointed at the latest stopSession.
    stopSessionRef.current = stopSession;

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
            // Claim the app-wide capture lock (start-always-wins). If anything
            // else holds the mic — a dictation session, a voice message — it is
            // stopped first; if WE get taken over, end the fast-fire session
            // cleanly rather than leaving a broken half-state.
            claimCapture({
                id: captureId,
                label: "Flashcard practice",
                stop: () => { void stopSessionRef.current(true); },
            });

            // Shared mic singleton (chosen device + warm grant; never stopped here).
            const stream = await acquireMicStream({
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            });
            micHeldRef.current = true;

            // Audio-level meter on the SHARED AudioContext (never closed; only
            // resumed). Rebuild the analyser source each card.
            await resumeSharedAudioContext();
            const ctx = getSharedAudioContext();
            if (ctx) {
                if (!analyser.current) {
                    analyser.current = ctx.createAnalyser();
                    analyser.current.fftSize = 256;
                }
                if (analyserSource.current) {
                    try { analyserSource.current.disconnect(); } catch { /* ignore */ }
                }
                analyserSource.current = ctx.createMediaStreamSource(stream);
                analyserSource.current.connect(analyser.current);
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
    }, [handleRecordingComplete, stopSession, toast, captureId]);

    const stopRecording = useCallback(async () => {
        if (mediaRecorder.current?.state === 'recording') {
            // Play buzzer
            endSound.current?.play().catch(() => {});
            
            // Stop recording
            mediaRecorder.current.stop();

            // Release our hold on the shared mic (NEVER stop its tracks).
            releaseMic();

            setSessionState(prev => ({...prev, isRecording: false}));
            
            // Immediately move to next card (don't wait for processing)
            await moveToNextCard();
        }
    }, [moveToNextCard, releaseMic]);

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
        
        // Stop recording if active — release the singleton, never stop tracks.
        if (mediaRecorder.current?.state === 'recording') {
            mediaRecorder.current.stop();
            releaseMic();
        }
        
        // Timer cleanup happens in useEffect
    }, [releaseMic]);

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

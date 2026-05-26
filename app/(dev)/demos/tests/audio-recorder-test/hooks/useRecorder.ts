import {useState, useCallback, useRef, useEffect} from 'react';
import {useAudioStore} from '@/hooks/idb/useAudioStore';
import {Recording} from '@/types/audioRecording.types';
import {useToast} from '@/components/ui/use-toast';

const format = require('format-duration');

interface UseRecorderProps {
    onRecordingStart?: () => void;
    onRecordingStop?: (recording: Recording) => void;
    audioConstraints?: MediaTrackConstraints;
}

export function useRecorder(
    {
        onRecordingStart,
        onRecordingStop,
        audioConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
        }
    }: UseRecorderProps = {}) {
    const {toast} = useToast();
    const {
        createRecording,
        getRecording,
        saveChunk,
        updateRecordingStatus,
        isLoading: isStoreLoading
    } = useAudioStore();

    // Core state
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
    const [currentRecording, setCurrentRecording] = useState<Recording | null>(null);
    const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isInitializing, setIsInitializing] = useState(false);

    // Refs
    const durationInterval = useRef<NodeJS.Timeout | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);

    const cleanup = useCallback(() => {
        console.log('[Cleanup] Starting cleanup');

        if (durationInterval.current) {
            clearInterval(durationInterval.current);
            durationInterval.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                console.log('[Cleanup] Stopping track:', track.kind);
                track.stop();
            });
            streamRef.current = null;
            setStream(null);
        }

        if (recorderRef.current) {
            if (recorderRef.current.state !== 'inactive') {
                recorderRef.current.stop();
            }
            recorderRef.current = null;
            setRecorder(null);
        }

        setAudioChunks([]);
        setDuration(0);
        console.log('[Cleanup] Cleanup completed');
    }, []);

    useEffect(() => {
        return () => {
            cleanup();
        };
    }, [cleanup]);

    const getStream = async () => {
        try {
            console.log('[Stream] Requesting microphone stream');
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: audioConstraints
            });
            console.log('[Stream] Stream obtained with tracks:', mediaStream.getAudioTracks().length);
            streamRef.current = mediaStream;
            setStream(mediaStream);
            return mediaStream;
        } catch (err) {
            console.error('[Stream] Error getting stream:', err);
            throw new Error('Failed to get media stream');
        }
    };

    const createRecorder = (mediaStream: MediaStream) => {
        try {
            console.log('[Recorder] Creating MediaRecorder');
            const mimeType = 'audio/webm;codecs=opus';

            if (!MediaRecorder.isTypeSupported(mimeType)) {
                throw new Error('Unsupported MIME type: audio/webm;codecs=opus');
            }

            const mediaRecorder = new MediaRecorder(mediaStream, {
                mimeType,
                audioBitsPerSecond: 128000
            });

            mediaRecorder.ondataavailable = async (event) => {
                console.log('[Recorder] Data available:', event.data.size, 'bytes');
                if (event.data.size > 0) {
                    setAudioChunks(prev => [...prev, event.data]);

                    if (currentRecording?.id) {
                        try {
                            const chunk = {
                                recording_id: currentRecording.id,
                                chunk_index: Date.now(),
                                blob: event.data,
                                timestamp: new Date()
                            };
                            await saveChunk(chunk);
                        } catch (err) {
                            console.error('[Recorder] Error saving chunk:', err);
                        }
                    }
                }
            };

            mediaRecorder.onstart = () => {
                console.log('[Recorder] Recording started');
                onRecordingStart?.();
            };

            mediaRecorder.onstop = async () => {
                console.log('[Recorder] Recording stopped');
                if (currentRecording?.id) {
                    try {
                        await updateRecordingStatus(currentRecording.id, 'completed', {
                            duration,
                            updated_at: new Date()
                        });
                        onRecordingStop?.(currentRecording);
                    } catch (err) {
                        console.error('[Recorder] Error updating recording status:', err);
                    }
                }
            };

            recorderRef.current = mediaRecorder;
            setRecorder(mediaRecorder);
            return mediaRecorder;
        } catch (err) {
            console.error('[Recorder] Error creating recorder:', err);
            throw err;
        }
    };

    const startRecording = async () => {
        try {
            console.log('[Start] Initializing recording process');
            setIsInitializing(true);
            setError(null);

            const mediaStream = await getStream();
            const mediaRecorder = createRecorder(mediaStream);

            const newRecording: Partial<Recording> = {
                filename: `recording-${Date.now()}`,
                title: `Recording ${new Date().toLocaleString()}`,
                duration: 0,
                status: 'recording',
                created_at: new Date(),
                updated_at: new Date(),
                size: 0,
                recording_quality: {
                    sampleRate: 48000,
                    bitDepth: 16,
                    channels: 1
                }
            };

            console.log('[Start] Creating recording in store');
            const createResult = await createRecording(newRecording);
            if (createResult.error) throw new Error(createResult.error);

            const recordingResult = await getRecording(Number(createResult.data));
            if (recordingResult.error) throw new Error(recordingResult.error);

            setCurrentRecording(recordingResult.data);
            setAudioChunks([]);

            console.log('[Start] Starting MediaRecorder');
            mediaRecorder.start(1000);

            durationInterval.current = setInterval(() => {
                setDuration(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.error('[Start] Error in startRecording:', err);
            setError(err instanceof Error ? err.message : 'Failed to start recording');
            cleanup();
            toast({
                variant: 'destructive',
                title: 'Recording Error',
                description: err instanceof Error ? err.message : 'Failed to start recording'
            });
        } finally {
            setIsInitializing(false);
        }
    };

    const stopRecording = async () => {
        try {
            console.log('[Stop] Stopping recording');
            if (recorderRef.current && recorderRef.current.state !== 'inactive') {
                recorderRef.current.stop();
                cleanup();
            }
        } catch (err) {
            console.error('[Stop] Error in stopRecording:', err);
            setError(err instanceof Error ? err.message : 'Failed to stop recording');
        }
    };

    const pauseRecording = async () => {
        try {
            console.log('[Pause] Pausing recording');
            if (recorderRef.current && recorderRef.current.state === 'recording') {
                recorderRef.current.pause();
                if (currentRecording?.id) {
                    await updateRecordingStatus(currentRecording.id, 'paused');
                }
            }
        } catch (err) {
            console.error('[Pause] Error in pauseRecording:', err);
            setError(err instanceof Error ? err.message : 'Failed to pause recording');
        }
    };

    const resumeRecording = async () => {
        try {
            console.log('[Resume] Resuming recording');
            if (recorderRef.current && recorderRef.current.state === 'paused') {
                recorderRef.current.resume();
                if (currentRecording?.id) {
                    await updateRecordingStatus(currentRecording.id, 'recording');
                }
            }
        } catch (err) {
            console.error('[Resume] Error in resumeRecording:', err);
            setError(err instanceof Error ? err.message : 'Failed to resume recording');
        }
    };

    return {
        isRecording: recorder?.state === 'recording',
        isPaused: recorder?.state === 'paused',
        duration,
        formattedDuration: format(duration * 1000),
        error,
        startRecording,
        stopRecording,
        pauseRecording,
        resumeRecording,
        currentRecording,
        previewStream: stream,
        loading: isInitializing || isStoreLoading()
    };
}
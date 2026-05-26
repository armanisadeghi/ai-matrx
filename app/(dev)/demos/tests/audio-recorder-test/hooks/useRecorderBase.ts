import {useState, useCallback, useRef, useEffect} from 'react';

interface RecorderOptions {
    onDataAvailable?: (blob: Blob) => void;
    onRecordingStart?: () => void;
    onRecordingStop?: (finalBlob: Blob) => void;
    audioConstraints?: MediaTrackConstraints;
}

interface RecorderState {
    isRecording: boolean;
    isPaused: boolean;
    duration: number;
    error: string | null;
    mediaStream: MediaStream | null;
    audioChunks: Blob[];
}

export function useRecorderBase(
    {
        onDataAvailable,
        onRecordingStart,
        onRecordingStop,
        audioConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
        }
    }: RecorderOptions = {}) {
    const [state, setState] = useState<RecorderState>({
        isRecording: false,
        isPaused: false,
        duration: 0,
        error: null,
        mediaStream: null,
        audioChunks: []
    });

    const recorderRef = useRef<MediaRecorder | null>(null);
    const durationInterval = useRef<NodeJS.Timeout | null>(null);

    const cleanup = useCallback(() => {
        if (durationInterval.current) {
            clearInterval(durationInterval.current);
            durationInterval.current = null;
        }

        if (state.mediaStream) {
            state.mediaStream.getTracks().forEach(track => track.stop());
        }

        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop();
        }

        setState(prev => ({
            ...prev,
            isRecording: false,
            isPaused: false,
            duration: 0,
            mediaStream: null,
            audioChunks: []
        }));

        recorderRef.current = null;
    }, [state.mediaStream]);

    useEffect(() => {
        return () => {
            cleanup();
        };
    }, [cleanup]);

    const getStream = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: audioConstraints
            });

            setState(prev => ({
                ...prev,
                mediaStream: stream,
                error: null
            }));

            return stream;
        } catch (err) {
            const error = err instanceof Error ? err.message : 'Failed to get media stream';
            setState(prev => ({...prev, error}));
            throw new Error(error);
        }
    };

    const createRecorder = (stream: MediaStream) => {
        try {
            if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                throw new Error('Unsupported MIME type: audio/webm;codecs=opus');
            }

            const recorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 128000
            });

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    setState(prev => ({
                        ...prev,
                        audioChunks: [...prev.audioChunks, event.data]
                    }));
                    onDataAvailable?.(event.data);
                }
            };

            recorder.onstart = () => {
                setState(prev => ({...prev, isRecording: true, isPaused: false}));
                onRecordingStart?.();

                durationInterval.current = setInterval(() => {
                    setState(prev => ({...prev, duration: prev.duration + 1}));
                }, 1000);
            };

            recorder.onpause = () => {
                setState(prev => ({...prev, isPaused: true}));
                if (durationInterval.current) {
                    clearInterval(durationInterval.current);
                }
            };

            recorder.onresume = () => {
                setState(prev => ({...prev, isPaused: false}));
                durationInterval.current = setInterval(() => {
                    setState(prev => ({...prev, duration: prev.duration + 1}));
                }, 1000);
            };

            recorder.onstop = () => {
                const finalBlob = new Blob(state.audioChunks, {type: 'audio/webm;codecs=opus'});
                onRecordingStop?.(finalBlob);
                cleanup();
            };

            recorderRef.current = recorder;
            return recorder;
        } catch (err) {
            const error = err instanceof Error ? err.message : 'Failed to create MediaRecorder';
            setState(prev => ({...prev, error}));
            throw new Error(error);
        }
    };

    const startRecording = async () => {
        try {
            setState(prev => ({...prev, error: null}));
            const stream = await getStream();
            const recorder = createRecorder(stream);
            recorder.start(1000); // Capture in 1-second chunks
        } catch (err) {
            cleanup();
            throw err;
        }
    };

    const stopRecording = () => {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop();
        }
    };

    const pauseRecording = () => {
        if (recorderRef.current && recorderRef.current.state === 'recording') {
            recorderRef.current.pause();
        }
    };

    const resumeRecording = () => {
        if (recorderRef.current && recorderRef.current.state === 'paused') {
            recorderRef.current.resume();
        }
    };

    return {
        isRecording: state.isRecording,
        isPaused: state.isPaused,
        duration: state.duration,
        error: state.error,
        mediaStream: state.mediaStream,
        startRecording,
        stopRecording,
        pauseRecording,
        resumeRecording
    };
}
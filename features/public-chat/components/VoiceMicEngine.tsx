'use client';

import { useRecordAndTranscribe } from "@/features/audio/hooks/useRecordAndTranscribe";
import { useEffect, useRef, useCallback, type MutableRefObject } from 'react';
import { VoiceTroubleshootingModal } from '@/features/audio/components/VoiceTroubleshootingModal';
import { useState } from 'react';
import { toast } from "@/lib/toast";
import type { TranscriptionResult } from '@/features/audio/types';

// ============================================================================
// VOICE MIC ENGINE — lazy-loaded, manages recording + transcription lifecycle
// ============================================================================

interface VoiceMicEngineProps {
    startRef: MutableRefObject<(() => Promise<void>) | null>;
    stopRef: MutableRefObject<(() => void) | null>;
    onRecordingChange: (recording: boolean) => void;
    onTranscribingChange: (transcribing: boolean) => void;
    onAudioLevelChange: (level: number) => void;
    onDurationChange: (duration: number) => void;
    onTranscriptionComplete: (text: string, duration?: number) => void;
    /** Start recording immediately on mount (first click) */
    autoStart?: boolean;
}

export function VoiceMicEngine({
    startRef,
    stopRef,
    onRecordingChange,
    onTranscribingChange,
    onAudioLevelChange,
    onDurationChange,
    onTranscriptionComplete,
    autoStart = false,
}: VoiceMicEngineProps) {
    const [showTroubleshooting, setShowTroubleshooting] = useState(false);
    const [lastError, setLastError] = useState<{ message: string; code: string } | null>(null);
    const autoStarted = useRef(false);

    const handleTranscriptionComplete = useCallback(
        (result: TranscriptionResult) => {
            if (result.success && result.text) {
                onTranscriptionComplete(result.text, result.duration);
            }
        },
        [onTranscriptionComplete]
    );

    const handleError = useCallback(
        (error: string, errorCode?: string) => {
            console.error('Voice input error:', error, errorCode);
            setLastError({ message: error, code: errorCode || 'UNKNOWN_ERROR' });
            toast.error('Voice input failed', {
                description: error,
                duration: 10000,
                action: {
                    label: 'Get Help',
                    onClick: () => setShowTroubleshooting(true),
                },
            });
        },
        []
    );

    const {
        isRecording,
        isTranscribing,
        duration,
        audioLevel,
        startRecording,
        stopRecording,
    } = useRecordAndTranscribe({
        onTranscriptionComplete: handleTranscriptionComplete,
        onError: handleError,
        autoTranscribe: true,
    });

    // Expose control functions to parent via refs
    useEffect(() => {
        startRef.current = startRecording;
        stopRef.current = stopRecording;
    }, [startRecording, stopRecording, startRef, stopRef]);

    // Sync state up to parent
    useEffect(() => { onRecordingChange(isRecording); }, [isRecording, onRecordingChange]);
    useEffect(() => { onTranscribingChange(isTranscribing); }, [isTranscribing, onTranscribingChange]);
    useEffect(() => { onAudioLevelChange(audioLevel); }, [audioLevel, onAudioLevelChange]);
    useEffect(() => { onDurationChange(duration); }, [duration, onDurationChange]);

    // Auto-start on mount (first click triggers engine load → auto start)
    useEffect(() => {
        if (autoStart && !autoStarted.current) {
            autoStarted.current = true;
            startRecording();
        }
    }, [autoStart, startRecording]);

    return (
        <VoiceTroubleshootingModal
            isOpen={showTroubleshooting}
            onClose={() => setShowTroubleshooting(false)}
            error={lastError?.message}
            errorCode={lastError?.code}
        />
    );
}

export default VoiceMicEngine;

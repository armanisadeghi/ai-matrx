'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { acquireMicStream, releaseMicStream } from '@/features/audio/micStream';
import {
  getSharedAudioContext,
  resumeSharedAudioContext,
} from '@/features/audio/audioContext';

/**
 * Multi-stream flashcard recorder, keyed by `key` so several cards can record
 * concurrently. Refactored to route through the canonical mic singleton
 * (`acquireMicStream`/`releaseMicStream`) instead of calling `getUserMedia`
 * directly and `track.stop()`-ing the stream — the old version (a) re-prompted
 * on every record (iOS) and (b) leaked the mic indicator on unmount (it had NO
 * cleanup effect). It now holds a singleton ref PER active key and releases each
 * on stop AND on unmount/error.
 */
export function useAudioRecorder() {
    const [isRecording, setIsRecording] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    // `recordings` is exposed as STATE (not a ref read during render — that
    // tripped react-hooks/refs); it mirrors completed blobs keyed by `key`.
    const [recordings, setRecordings] = useState<Record<string, Blob>>({});
    const analyserRef = useRef<AnalyserNode | null>(null);
    const analyserSourcesRef = useRef<Record<string, MediaStreamAudioSourceNode>>({});
    const animationFrameRef = useRef<number | undefined>(undefined);
    const mediaRecordersRef = useRef<Record<string, MediaRecorder>>({});
    const audioChunksRef = useRef<Record<string, Blob[]>>({});
    // Keys for which we currently hold a singleton ref — so release is balanced
    // exactly once per acquire across stop / unmount.
    const heldKeysRef = useRef<Set<string>>(new Set());

    const releaseKey = useCallback((key: string) => {
        const src = analyserSourcesRef.current[key];
        if (src) {
            try { src.disconnect(); } catch { /* ignore */ }
            delete analyserSourcesRef.current[key];
        }
        if (heldKeysRef.current.has(key)) {
            releaseMicStream();
            heldKeysRef.current.delete(key);
        }
    }, []);

    // Release EVERY outstanding hold on unmount — the whole-session
    // mic-indicator-leak guard the old hook was missing entirely.
    useEffect(() => {
        return () => {
            if (animationFrameRef.current !== undefined) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            if (analyserRef.current) {
                try { analyserRef.current.disconnect(); } catch { /* ignore */ }
                analyserRef.current = null;
            }
            for (const key of Array.from(heldKeysRef.current)) {
                releaseKey(key);
            }
        };
    }, [releaseKey]);

    const startRecording = useCallback(async (key: string) => {
        if (!navigator.mediaDevices?.getUserMedia) return;
        try {
            // Shared mic stream (chosen device + warm grant). Never stopped here.
            const stream = await acquireMicStream({ channelCount: 1 });
            heldKeysRef.current.add(key);

            // Shared AudioContext for the level meter — never closed, only resumed.
            await resumeSharedAudioContext();
            const audioContext = getSharedAudioContext();
            if (audioContext) {
                if (!analyserRef.current) {
                    analyserRef.current = audioContext.createAnalyser();
                    analyserRef.current.fftSize = 256;
                }
                const source = audioContext.createMediaStreamSource(stream);
                source.connect(analyserRef.current);
                analyserSourcesRef.current[key] = source;
            }

            audioChunksRef.current[key] = [];
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                             ? 'audio/webm;codecs=opus'
                             : 'audio/webm';
            const recorder = new MediaRecorder(stream, { mimeType });
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    audioChunksRef.current[key].push(e.data);
                }
            };
            mediaRecordersRef.current[key] = recorder;
            recorder.start();
            const updateAudio = () => {
                if (!analyserRef.current) return;
                const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                setAudioLevel(average);
                animationFrameRef.current = requestAnimationFrame(updateAudio);
            };
            updateAudio();
            setIsRecording(true);
        } catch (err) {
            // Release any partial hold so a failed start never leaks the mic.
            releaseKey(key);
            setIsRecording(false);
            // Don't silently swallow — surface for diagnostics.
            console.error('[useAudioRecorder] startRecording failed:', err);
        }
    }, [releaseKey]);

    const stopRecording = useCallback(async (key: string) => {
        const recorder = mediaRecordersRef.current[key];
        if (recorder && recorder.state === 'recording') {
            return new Promise<Blob | undefined>((resolve) => {
                recorder.onstop = async () => {
                    const audioBlob = new Blob(audioChunksRef.current[key], {type: 'audio/webm'});
                    setRecordings(prev => ({ ...prev, [key]: audioBlob }));
                    delete mediaRecordersRef.current[key];
                    if (animationFrameRef.current !== undefined) {
                        cancelAnimationFrame(animationFrameRef.current);
                        animationFrameRef.current = undefined;
                    }
                    // Release the singleton hold for this key (NEVER stop tracks).
                    releaseKey(key);
                    // Drop the shared analyser only when no other key is active.
                    if (heldKeysRef.current.size === 0 && analyserRef.current) {
                        try { analyserRef.current.disconnect(); } catch { /* ignore */ }
                        analyserRef.current = null;
                        setAudioLevel(0);
                    }
                    setIsRecording(heldKeysRef.current.size > 0);
                    resolve(audioBlob);
                };
                recorder.stop();
            });
        }
        return undefined;
    }, [releaseKey]);

    return {
        isRecording,
        audioLevel,
        startRecording,
        stopRecording,
        recordings
    };
}

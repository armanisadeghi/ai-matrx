/**
 * Simple Audio Recorder Hook
 * 
 * Lightweight hook for recording audio without IndexedDB storage
 * Optimized for quick transcription use cases
 */

'use client';

import { useState, useRef, useCallback, useEffect, useId } from 'react';
import { getErrorSolution } from '../utils/microphone-diagnostics';
import { acquireMicStream, releaseMicStream } from '@/features/audio/micStream';
import {
  getSharedAudioContext,
  resumeSharedAudioContext,
} from '@/features/audio/audioContext';
import { claimCapture, releaseCapture } from '@/features/audio/captureLock';

export interface UseSimpleRecorderProps {
  onRecordingComplete?: (blob: Blob) => void;
  onError?: (error: string, errorCode?: string) => void;
}

export function useSimpleRecorder({
  onRecordingComplete,
  onError,
}: UseSimpleRecorderProps = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  // Stable id for the app-wide capture lock (one live capture, anywhere).
  const captureId = useId();
  // Set when another recorder takes over via the lock — the imminent
  // MediaRecorder.onstop must DISCARD (never auto-deliver a half-recorded blob).
  const takenOverRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Whether we hold a ref on the shared mic stream — keeps acquire/release
  // balanced exactly once across the cleanup / stop / unmount paths.
  const micHeldRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  // The shared AudioContext is never closed (only resumed); we only own the
  // analyser + the source node we connect into it, and disconnect those.
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Disconnect (don't close — the context is shared) the analyser graph.
    if (analyserSourceRef.current) {
      try {
        analyserSourceRef.current.disconnect();
      } catch {
        /* ignore */
      }
      analyserSourceRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        /* ignore */
      }
      analyserRef.current = null;
    }

    // Release our hold on the shared mic stream — NEVER stop its tracks (that
    // would defeat the singleton's keepalive and kill other holders). The
    // singleton clears the mic light on its short keepalive once nobody holds.
    streamRef.current = null;
    if (micHeldRef.current) {
      releaseMicStream();
      micHeldRef.current = false;
    }

    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }

    chunksRef.current = [];
    setAudioLevel(0);
    // Drop the capture lock (id-guarded — a no-op if we were already taken over).
    releaseCapture(captureId);
  }, [captureId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    try {
      // Claim the app-wide capture lock (start-always-wins). If anything else is
      // capturing — a dictation session, another raw recorder — it is stopped
      // first so two captures can never overlap. Our `stop` discards: a takeover
      // means the user deliberately started something else, so we never
      // auto-deliver this recorder's half-finished blob.
      takenOverRef.current = false;
      claimCapture({
        id: captureId,
        label: 'Audio recorder',
        stop: () => {
          takenOverRef.current = true;
          if (
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state !== 'inactive'
          ) {
            mediaRecorderRef.current.stop();
          }
          setIsRecording(false);
          setIsPaused(false);
        },
      });
      // Acquire the SHARED mic stream (applies the user's chosen device + keeps
      // the OS grant warm — no per-recording re-prompt). Never stop its tracks.
      const stream = await acquireMicStream({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000, // Optimal for Whisper (will be downsampled to 16KHz anyway)
      });
      micHeldRef.current = true;

      streamRef.current = stream;
      chunksRef.current = [];

      // Setup audio analysis for visual feedback on the SHARED context (never
      // closed — only resumed). iOS caps live AudioContexts; sharing one avoids
      // exhaustion.
      await resumeSharedAudioContext();
      const audioContext = getSharedAudioContext();
      if (audioContext) {
        analyserRef.current = audioContext.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.smoothingTimeConstant = 0.8;
        analyserSourceRef.current =
          audioContext.createMediaStreamSource(stream);
        analyserSourceRef.current.connect(analyserRef.current);
      }

      // Start audio level monitoring
      const updateAudioLevel = () => {
        if (!analyserRef.current) return;

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate average audio level (0-100)
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalizedLevel = Math.min(100, (average / 255) * 150); // Scale up for better visibility
        
        setAudioLevel(normalizedLevel);
        animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
      };
      updateAudioLevel();

      // Determine best MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      // Handle data available
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = () => {
        // Discard on takeover — don't deliver a half-recorded blob the user
        // abandoned by starting another capture.
        if (takenOverRef.current) {
          takenOverRef.current = false;
          cleanup();
          return;
        }
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        onRecordingComplete?.(blob);
        cleanup();
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setIsPaused(false);
      startTimeRef.current = Date.now();
      pausedTimeRef.current = 0;

      // Start duration counter
      durationIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000;
        setDuration(Math.floor(elapsed));
      }, 100);

    } catch (err) {
      const errorSolution = getErrorSolution(err);
      console.error('Recording error:', err, errorSolution);
      onError?.(errorSolution.message, errorSolution.code);
      cleanup();
    }
  }, [cleanup, onRecordingComplete, onError, captureId]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }
  }, []);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      
      const pauseDuration = Date.now() - startTimeRef.current - pausedTimeRef.current;
      pausedTimeRef.current += pauseDuration;
      
      durationIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000;
        setDuration(Math.floor(elapsed));
      }, 100);
    }
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setIsRecording(false);
    setIsPaused(false);
    setDuration(0);
    setAudioBlob(null);
  }, [cleanup]);

  return {
    isRecording,
    isPaused,
    duration,
    audioBlob,
    audioLevel,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    reset,
  };
}


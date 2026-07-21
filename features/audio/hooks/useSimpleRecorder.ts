/**
 * Simple Audio Recorder Hook
 *
 * Lightweight hook for recording audio without IndexedDB storage —
 * optimized for quick transcription use cases (voice messages, quick
 * transcripts). The raw MediaRecorder mechanics (MIME ladder confirmation,
 * lifecycle, pause-aware elapsed time, chunk emission) live in the ONE
 * canonical controller — `features/media-capture/recording/
 * media-recorder-controller.ts` — this hook only composes the audio-system
 * discipline around it: captureLock claim/release, the shared mic singleton,
 * the audio session registry row, and the analyser level meter.
 *
 * Public API is unchanged: { isRecording, isPaused, duration, audioBlob,
 * audioLevel, startRecording, stopRecording, pauseRecording,
 * resumeRecording, reset }.
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
import { beginRecordingSession } from '@/features/audio/session/audioSessionRegistry';
import type { PlaybackSessionHandle } from '@/features/audio/session/types';
import {
  createMediaRecorderController,
  type MediaRecorderController,
} from '@/features/media-capture/recording/media-recorder-controller';

export interface UseSimpleRecorderProps {
  onRecordingComplete?: (blob: Blob) => void;
  onError?: (error: string, errorCode?: string) => void;
  /** Label for the Audio panel's recording row (e.g. "Voice message"). */
  label?: string;
}

export function useSimpleRecorder({
  onRecordingComplete,
  onError,
  label = 'Voice recording',
}: UseSimpleRecorderProps = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  // Stable id for the app-wide capture lock (one live capture, anywhere).
  const captureId = useId();
  // Set when another recorder takes over via the lock — the controller's
  // terminal must DISCARD (never auto-deliver a half-recorded blob).
  const takenOverRef = useRef(false);

  const controllerRef = useRef<MediaRecorderController | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Whether we hold a ref on the shared mic stream — keeps acquire/release
  // balanced exactly once across the cleanup / stop / unmount paths.
  const micHeldRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // The shared AudioContext is never closed (only resumed); we only own the
  // analyser + the source node we connect into it, and disconnect those.
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  // This recording's session in the unified audio registry (Audio panel
  // visibility, live → history). Ended in cleanup (the single exit for every
  // path: normal stop, takeover, error, reset, unmount).
  const recordingSessionRef = useRef<PlaybackSessionHandle | null>(null);

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

    if (controllerRef.current) {
      if (controllerRef.current.getState() !== 'ended') {
        controllerRef.current.cancel();
      }
      controllerRef.current = null;
    }

    chunksRef.current = [];
    setAudioLevel(0);
    // End the registry session (single exit point — no-op if already ended).
    if (recordingSessionRef.current) {
      recordingSessionRef.current.end('done');
      recordingSessionRef.current = null;
    }
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
          controllerRef.current?.stop();
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

      // The canonical controller owns the MIME ladder (constructor-confirmed
      // fallthrough), the lifecycle, and pause-aware elapsed time.
      const controller = createMediaRecorderController({
        stream,
        kind: 'audio',
        timesliceMs: 100, // Collect data every 100ms (unchanged cadence)
        onChunk: (chunk) => {
          chunksRef.current.push(chunk);
        },
        onTerminal: (terminal) => {
          // Keep state in sync no matter how the stop was triggered (the
          // panel's session control stops the controller directly).
          setIsRecording(false);
          setIsPaused(false);
          // Discard on takeover — don't deliver a half-recorded blob the user
          // abandoned by starting another capture.
          if (takenOverRef.current || terminal.reason === 'cancelled') {
            takenOverRef.current = false;
            cleanup();
            return;
          }
          if (terminal.reason === 'unsupported-codec' || terminal.reason === 'recorder-error') {
            const errorSolution = getErrorSolution(terminal.error);
            onError?.(errorSolution.message, errorSolution.code);
            cleanup();
            return;
          }
          // The emitted/controller MIME is authoritative for the final blob.
          const mime = terminal.mime ?? chunksRef.current[0]?.type ?? 'audio/webm';
          const blob = new Blob(chunksRef.current, { type: mime });
          setAudioBlob(blob);
          onRecordingComplete?.(blob);
          cleanup();
        },
      });
      controllerRef.current = controller;
      await controller.start();
      setIsRecording(true);
      setIsPaused(false);
      // Surface in the unified Audio panel; stop control ends this recorder
      // (the controller's terminal drives state + cleanup).
      recordingSessionRef.current = beginRecordingSession({
        label,
        controls: {
          stop: () => controllerRef.current?.stop(),
        },
      });

      // Duration counter — the controller's pause-aware monotonic clock is
      // the single source of truth.
      durationIntervalRef.current = setInterval(() => {
        const c = controllerRef.current;
        if (c) setDuration(Math.floor(c.getElapsedMs() / 1000));
      }, 100);
    } catch (err) {
      const errorSolution = getErrorSolution(err);
      console.error('Recording error:', err, errorSolution);
      onError?.(errorSolution.message, errorSolution.code);
      cleanup();
    }
  }, [cleanup, onRecordingComplete, onError, captureId, label]);

  const stopRecording = useCallback(() => {
    const c = controllerRef.current;
    if (c && c.getState() !== 'ended') {
      c.stop();
      setIsRecording(false);
      setIsPaused(false);

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }
  }, []);

  const pauseRecording = useCallback(() => {
    const c = controllerRef.current;
    if (c && c.getState() === 'recording') {
      c.pause();
      setIsPaused(true);

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }
  }, []);

  const resumeRecording = useCallback(() => {
    const c = controllerRef.current;
    if (c && c.getState() === 'paused') {
      c.resume();
      setIsPaused(false);

      durationIntervalRef.current = setInterval(() => {
        const ctrl = controllerRef.current;
        if (ctrl) setDuration(Math.floor(ctrl.getElapsedMs() / 1000));
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

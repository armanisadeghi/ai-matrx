/**
 * useChunkedRecordAndTranscribe
 *
 * Production-grade streaming transcription hook.
 *
 * Architecture:
 *   - Every `chunkDurationMs` (default 10 s) the MediaRecorder rotates: the
 *     current recording snaps off as a complete audio blob, a fresh recorder
 *     starts on the same live stream, and the blob is sent to the API.
 *   - Each chunk is ~160 KB (webm/opus 16 kHz) — well under Vercel's 4.5 MB limit.
 *   - Results accumulate in order into `liveTranscript`, re-rendering on every
 *     chunk so the UI shows text as the user speaks.
 *   - All audio chunks + text are persisted to IndexedDB via audioSafetyStore.
 *   - Failed chunks are tracked; on stop, if any failed, the full audio blob is
 *     uploaded to cld_files via the universal file handler and transcribed via
 *     the URL-based fallback (Groq fetches the cld_files signed URL).
 *   - On clean completion, the IndexedDB entry is marked 'complete'.
 *   - On crash, the AudioRecoveryProvider detects orphaned entries on next load.
 */

"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { TranscriptionOptions, TranscriptionResult } from "../types";
import { AUDIO_LIMITS, AUDIO_API_ROUTES } from "../constants";
import { getErrorSolution } from "../utils/microphone-diagnostics";
import { audioSafetyStore } from "../services/audioSafetyStore";
import {
  uploadAndTranscribeFull,
  logClientError,
} from "../services/audioFallbackUpload";
import {
  acquireMicStream,
  releaseMicStream,
  subscribeMicInterruption,
} from "../micStream";
import {
  getSharedAudioContext,
  resumeSharedAudioContext,
} from "../audioContext";
import { toAudioFile } from "../utils/audio-mime";

/**
 * Per-chunk timing + content payload. Fires once per chunk after a successful
 * transcription. `tStart` / `tEnd` are session-relative seconds (paused time
 * excluded), measured from the most recent `startRecording()` call.
 *
 * Consumers that need to anchor downstream content to the audio timeline
 * (transcript-studio's Column 1, sync-scroll, etc.) subscribe via
 * `onChunkComplete`. Plain text consumers can keep using `onChunkTranscribed`.
 */
export interface ChunkCompleteInfo {
  chunkIndex: number;
  tStart: number;
  tEnd: number;
  /**
   * Crash-safe IndexedDB entry id for the in-flight recording cycle. Stable
   * for the whole start→stop cycle; lets a subscriber reassemble the cycle's
   * audio later via `audioSafetyStore.getAudioBlob(safetyId)`.
   */
  safetyId: string;
  text: string;
  accumulatedText: string;
}

export interface UseChunkedRecordAndTranscribeProps {
  /**
   * Fires once when the recording stops and the final transcript is ready.
   * `audioBlob` is the full assembled recording (all chunks) captured in
   * memory at completion — deterministic, no IndexedDB round-trip — so
   * subscribers can upload/persist it directly. Null when no audio was captured.
   */
  onTranscriptionComplete?: (
    result: TranscriptionResult,
    audioBlob?: Blob | null,
  ) => void;
  onChunkTranscribed?: (chunkText: string, accumulatedText: string) => void;
  onChunkComplete?: (info: ChunkCompleteInfo) => void;
  onChunkError?: (chunkIndex: number, error: string) => void;
  onError?: (error: string, errorCode?: string) => void;
  chunkDurationMs?: number;
  transcriptionOptions?: TranscriptionOptions;
}

export function useChunkedRecordAndTranscribe({
  onTranscriptionComplete,
  onChunkTranscribed,
  onChunkComplete,
  onChunkError,
  onError,
  chunkDurationMs = AUDIO_LIMITS.CHUNK_DURATION_MS,
  transcriptionOptions,
}: UseChunkedRecordAndTranscribeProps = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [failedChunkCount, setFailedChunkCount] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  // Whether we hold a ref on the shared mic stream — keeps acquire/release
  // balanced exactly once across the cleanup / stop / pagehide paths.
  const micHeldRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const accumulatedRef = useRef("");
  const pendingRef = useRef(0);
  const isStoppingRef = useRef(false);
  const mimeTypeRef = useRef("audio/webm");
  const rotationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const pausedAtRef = useRef(0);
  const pausedDurationRef = useRef(0);
  // Points at the SHARED AudioContext (not owned/closed here) — the analyser is
  // only the cosmetic level meter; capture runs off the MediaStream directly.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const safetyIdRef = useRef<string>("");
  const isPageHidingRef = useRef(false);
  const chunkIndexRef = useRef(0);
  const failedIndicesRef = useRef<number[]>([]);
  const allChunkBlobsRef = useRef<Blob[]>([]);
  const userIdRef = useRef<string>("");
  const transcriptsMapRef = useRef<Map<number, string>>(new Map());
  const chunkTimingsRef = useRef<Map<number, { tStart: number; tEnd: number }>>(
    new Map(),
  );
  const scheduleNextRotationRef = useRef<(() => void) | null>(null);

  const onTranscriptionCompleteRef = useRef(onTranscriptionComplete);
  const onChunkTranscribedRef = useRef(onChunkTranscribed);
  const onChunkCompleteRef = useRef(onChunkComplete);
  const onChunkErrorRef = useRef(onChunkError);
  const onErrorRef = useRef(onError);
  const transcriptionOptionsRef = useRef(transcriptionOptions);
  useEffect(() => {
    onTranscriptionCompleteRef.current = onTranscriptionComplete;
  }, [onTranscriptionComplete]);
  useEffect(() => {
    onChunkTranscribedRef.current = onChunkTranscribed;
  }, [onChunkTranscribed]);
  useEffect(() => {
    onChunkCompleteRef.current = onChunkComplete;
  }, [onChunkComplete]);
  useEffect(() => {
    onChunkErrorRef.current = onChunkError;
  }, [onChunkError]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    transcriptionOptionsRef.current = transcriptionOptions;
  }, [transcriptionOptions]);

  // Custom Dictionary keyterm biasing: resolved once per recording start when a
  // surface opts in via `dictionarySurfaceKey`. Applied per chunk when the
  // caller hasn't passed an explicit `prompt`.
  const dictPromptRef = useRef<string>("");

  const sessionRelativeSec = useCallback(() => {
    if (!startTimeRef.current) return 0;
    const elapsed =
      Date.now() - startTimeRef.current - pausedDurationRef.current;
    return Math.max(0, elapsed) / 1000;
  }, []);

  // Tear down the analyser graph WITHOUT closing the shared AudioContext (it's
  // reused by the next recording + other surfaces). Disconnect the source +
  // analyser nodes so they're collected; the context stays warm.
  const disconnectAnalyser = useCallback(() => {
    try {
      sourceNodeRef.current?.disconnect();
    } catch {}
    try {
      analyserRef.current?.disconnect();
    } catch {}
    sourceNodeRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
    if (rotationTimerRef.current) {
      clearTimeout(rotationTimerRef.current as any);
      rotationTimerRef.current = null;
    }
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    disconnectAnalyser();
    streamRef.current = null;
    if (micHeldRef.current) {
      releaseMicStream();
      micHeldRef.current = false;
    }
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    mediaRecorderRef.current = null;
    setAudioLevel(0);
    setIsPaused(false);
    pausedAtRef.current = 0;
    pausedDurationRef.current = 0;
    isStoppingRef.current = false;
  }, [disconnectAnalyser]);

  useEffect(
    () => () => {
      cleanup();
    },
    [cleanup],
  );

  // Bug 4 fix: flush the active recorder to IndexedDB when the page unloads.
  // `pagehide` fires on navigation, refresh, and tab close (more reliable than
  // `beforeunload`, and supported on iOS Safari). When it fires we immediately
  // stop the recorder so `onstop` triggers → transcribeBlob saves the chunk to
  // IndexedDB (see Bug 3 fix above) before the browser tears down the page.
  // We set `isPageHidingRef` so transcribeBlob skips the network call and only
  // does the save — a fetch starting during page unload would be cancelled anyway.
  useEffect(() => {
    const handleUnload = () => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state !== "recording") return;
      if (isStoppingRef.current) return; // already stopping, nothing to do

      isPageHidingRef.current = true;
      isStoppingRef.current = true;

      // Cancel pending timers so rotateChunk doesn't fire again after us.
      if (rotationTimerRef.current) {
        clearTimeout(rotationTimerRef.current as ReturnType<typeof setTimeout>);
        rotationTimerRef.current = null;
      }
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      // Release the microphone (shared manager keeps the grant warm so a
      // bfcache restore won't re-prompt; a real unload tears everything down).
      streamRef.current = null;
      if (micHeldRef.current) {
        releaseMicStream();
        micHeldRef.current = false;
      }

      // Stopping the recorder flushes its internal buffer → onstop fires →
      // transcribeBlob saves the chunk to IndexedDB.
      try {
        mr.stop();
      } catch {}
      mediaRecorderRef.current = null;
    };

    window.addEventListener("pagehide", handleUnload);
    return () => {
      window.removeEventListener("pagehide", handleUnload);
    };
  }, []); // refs only — no reactive deps needed

  const persistText = useCallback(async (text: string) => {
    if (safetyIdRef.current) {
      try {
        await audioSafetyStore.saveText(safetyIdRef.current, text);
      } catch {}
    }
  }, []);

  const runFallbackTranscription =
    useCallback(async (): Promise<TranscriptionResult | null> => {
      if (allChunkBlobsRef.current.length === 0) return null;

      const fullBlob = new Blob(allChunkBlobsRef.current, {
        type: mimeTypeRef.current,
      });
      if (fullBlob.size < AUDIO_LIMITS.MIN_CHUNK_BYTES) return null;

      try {
        const baseOpts = transcriptionOptionsRef.current;
        const result = await uploadAndTranscribeFull(
          fullBlob,
          userIdRef.current || "anonymous",
          baseOpts?.prompt || !dictPromptRef.current
            ? baseOpts
            : { ...baseOpts, prompt: dictPromptRef.current },
        );
        return result;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Fallback transcription failed";
        console.error("[chunked-transcription] Fallback failed:", msg);
        return { success: false, text: "", error: msg };
      }
    }, []);

  const maybeFireFinal = useCallback(async () => {
    if (!isStoppingRef.current || pendingRef.current > 0) return;

    const hasFailures = failedIndicesRef.current.length > 0;
    let finalText = accumulatedRef.current.trim();

    if (hasFailures && allChunkBlobsRef.current.length > 0) {
      const fallbackResult = await runFallbackTranscription();
      if (fallbackResult?.success && fallbackResult.text.trim()) {
        finalText = fallbackResult.text.trim();
        accumulatedRef.current = finalText;
        setLiveTranscript(finalText);
        await persistText(finalText);
      }
    }

    setIsTranscribing(false);

    if (safetyIdRef.current) {
      try {
        await audioSafetyStore.markComplete(safetyIdRef.current);
      } catch {}
    }

    // Assemble the full recording from the in-memory chunk blobs and hand it
    // to the subscriber directly — deterministic, avoids any IndexedDB read
    // race in consumers that need to upload the per-recording audio.
    const finalAudioBlob =
      allChunkBlobsRef.current.length > 0
        ? new Blob(allChunkBlobsRef.current, { type: mimeTypeRef.current })
        : null;

    onTranscriptionCompleteRef.current?.(
      { success: true, text: finalText },
      finalAudioBlob,
    );

    // Auto-persist into transcripts system silently (skip on page unload).
    if (finalText && !isPageHidingRef.current) {
      import("@/utils/auth/getUserId").then(({ getUserId }) => {
        const userId = getUserId();
        if (userId) {
          import("@/features/transcripts/service/transcriptsService").then(
            ({ saveDraftTranscript }) => {
              const finalBlob = new Blob(allChunkBlobsRef.current, {
                type: mimeTypeRef.current,
              });
              import("@/features/transcripts/service/audioStorageService").then(
                ({ saveAudioToStorage }) => {
                  saveAudioToStorage(finalBlob, userId, undefined, 3)
                    .then((uploadResult) => {
                      saveDraftTranscript({
                        title: "Voice Pad Recording",
                        segments: [
                          {
                            id: Date.now().toString(),
                            text: finalText,
                            seconds: duration,
                            timecode: "0:00",
                          },
                        ],
                        source_type: "audio",
                        folder_name: "Recordings",
                        audio_file_path: uploadResult.fileId,
                      }).catch((err) => {
                        console.warn(
                          "[chunked-transcription] Failed to auto-persist transcript with audio:",
                          err,
                        );
                      });
                    })
                    .catch((uploadErr) => {
                      console.warn(
                        "[chunked-transcription] Failed to save audio file to storage:",
                        uploadErr,
                      );
                      // Fallback to saving draft transcript without audio
                      saveDraftTranscript({
                        title: "Voice Pad Recording",
                        segments: [
                          {
                            id: Date.now().toString(),
                            text: finalText,
                            seconds: duration,
                            timecode: "0:00",
                          },
                        ],
                        source_type: "audio",
                        folder_name: "Recordings",
                      }).catch((err) => {
                        console.warn(
                          "[chunked-transcription] Failed to auto-persist transcript:",
                          err,
                        );
                      });
                    });
                },
              );
            },
          );
        }
      });
    }
  }, [runFallbackTranscription, persistText, duration]);

  const transcribeBlob = useCallback(
    async (blob: Blob, idx: number) => {
      // Always persist to the safety net first — before any size check or API call.
      // Even a tiny or silent chunk is real audio the user produced. The transcription
      // API can skip it, but the safety store must never lose it.
      allChunkBlobsRef.current.push(blob);
      if (safetyIdRef.current) {
        try {
          await audioSafetyStore.saveChunk(safetyIdRef.current, blob);
        } catch {}
      }

      // Skip transcription for tiny chunks (not enough audio) or when the page is
      // unloading — in that case we just want the save above to complete, not start
      // a network request that will be cancelled mid-flight.
      if (blob.size < AUDIO_LIMITS.MIN_CHUNK_BYTES || isPageHidingRef.current) {
        maybeFireFinal();
        return;
      }

      let blobToSend = blob;
      let isCombo = false;

      // At idx 2 (the 6-10s mark), we combine clumps 0, 1, and 2 into a single full 10-second chunk
      if (idx === 2) {
        blobToSend = new Blob(allChunkBlobsRef.current.slice(0, 3), {
          type: mimeTypeRef.current,
        });
        isCombo = true;
      }

      pendingRef.current += 1;
      setIsTranscribing(true);

      try {
        const opts = transcriptionOptionsRef.current;
        const form = new FormData();
        // Clean `audio/*` type + matching extension so the server classifies
        // the chunk as audio, not video (recorder blobs carry `;codecs=opus`
        // or an empty type, both of which sniff to `video/webm`).
        form.append("file", toAudioFile(blobToSend, { prefix: "chunk" }));
        if (opts?.language) form.append("language", opts.language);
        const effectivePrompt = opts?.prompt || dictPromptRef.current;
        if (effectivePrompt) form.append("prompt", effectivePrompt);

        // Bound the request: on bad networks a chunk fetch can hang
        // indefinitely, leaving `pendingRef` > 0 forever so `maybeFireFinal`
        // never fires and the recording is never finalized (card stuck
        // "Saving…"). An abort surfaces as a normal failed chunk — its audio is
        // already in IndexedDB and the stop-time fallback re-transcribes it.
        const ctrl = new AbortController();
        const timeoutId = setTimeout(
          () => ctrl.abort(),
          AUDIO_LIMITS.CHUNK_FETCH_TIMEOUT_MS,
        );
        let res: Response;
        try {
          res = await fetch(AUDIO_API_ROUTES.TRANSCRIBE, {
            method: "POST",
            body: form,
            signal: ctrl.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || data.details || `HTTP ${res.status}`);
        }

        if (data.success && data.text?.trim()) {
          const snippet = (data.text as string).trim();

          if (isCombo) {
            transcriptsMapRef.current.set(0, "");
            transcriptsMapRef.current.set(1, "");
            transcriptsMapRef.current.set(2, snippet);
          } else {
            // If we receive late responses for 0 or 1 after 2 has already eclipsed them, ignore them
            if ((idx === 0 || idx === 1) && transcriptsMapRef.current.has(2)) {
              // Ignored
            } else {
              transcriptsMapRef.current.set(idx, snippet);
            }
          }

          const full = Array.from(transcriptsMapRef.current.entries())
            .sort((a, b) => a[0] - b[0])
            .map((e) => e[1])
            .filter(Boolean)
            .join(" ");

          accumulatedRef.current = full;
          setLiveTranscript(full);
          await persistText(full);
          onChunkTranscribedRef.current?.(snippet, full);

          // Per-chunk timing payload for timeline-anchored consumers
          // (transcript-studio Column 1). The combo-chunk at idx 2 covers the
          // span from idx 0's start to idx 2's end; emit one event spanning
          // that whole window so Column 1 stays append-only without overlap.
          const cb = onChunkCompleteRef.current;
          if (cb) {
            if (isCombo) {
              const t0 = chunkTimingsRef.current.get(0);
              const t2 = chunkTimingsRef.current.get(2);
              if (t0 && t2) {
                cb({
                  chunkIndex: 2,
                  tStart: t0.tStart,
                  tEnd: t2.tEnd,
                  text: snippet,
                  accumulatedText: full,
                  safetyId: safetyIdRef.current,
                });
              }
            } else {
              const timing = chunkTimingsRef.current.get(idx);
              if (timing) {
                cb({
                  chunkIndex: idx,
                  tStart: timing.tStart,
                  tEnd: timing.tEnd,
                  text: snippet,
                  accumulatedText: full,
                  safetyId: safetyIdRef.current,
                });
              }
            }
          }
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Chunk transcription failed";
        console.error(`[chunked-transcription] chunk ${idx} failed:`, msg);

        failedIndicesRef.current.push(idx);
        setFailedChunkCount(failedIndicesRef.current.length);

        if (safetyIdRef.current) {
          try {
            await audioSafetyStore.addFailedChunk(safetyIdRef.current, idx);
          } catch {}
        }

        await logClientError({
          errorCode: "CHUNK_FAILED",
          errorMessage: msg,
          fileSizeBytes: blobToSend.size,
          chunkIndex: idx,
          apiRoute: AUDIO_API_ROUTES.TRANSCRIBE,
        });

        onChunkErrorRef.current?.(idx, msg);
      } finally {
        pendingRef.current -= 1;
        maybeFireFinal();
      }
    },
    [maybeFireFinal, persistText],
  );

  const createRecorder = useCallback(
    (stream: MediaStream): MediaRecorder => {
      const mime = mimeTypeRef.current;
      const chunks: Blob[] = [];
      const idx = chunkIndexRef.current++;
      // Voice-optimized: mono Opus at 32 kbps is transparent for speech and
      // Whisper, and ~4x smaller than the browser default (~128 kbps), which
      // makes the post-recording upload far quicker.
      const mr = new MediaRecorder(stream, {
        mimeType: mime,
        audioBitsPerSecond: 32_000,
      });

      // Anchor this chunk's session-relative window so downstream consumers
      // (transcript-studio Column 1) can place text on the audio timeline.
      chunkTimingsRef.current.set(idx, {
        tStart: sessionRelativeSec(),
        tEnd: 0,
      });

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mr.onstop = () => {
        const timing = chunkTimingsRef.current.get(idx);
        if (timing) timing.tEnd = sessionRelativeSec();
        const blob = new Blob(chunks, { type: mime });
        transcribeBlob(blob, idx);
      };

      mr.start(100);
      return mr;
    },
    [transcribeBlob, sessionRelativeSec],
  );

  const rotateChunk = useCallback(() => {
    if (!streamRef.current || !mediaRecorderRef.current) return;
    if (mediaRecorderRef.current.state !== "recording") return;

    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = createRecorder(streamRef.current);
  }, [createRecorder]);

  const startAudioAnalysis = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const tick = () => {
      if (!analyserRef.current) return;
      const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(buf);
      const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
      setAudioLevel(Math.min(100, (avg / 255) * 150));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const startDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    durationTimerRef.current = setInterval(() => {
      setDuration(
        Math.floor(
          (Date.now() - startTimeRef.current - pausedDurationRef.current) /
            1000,
        ),
      );
    }, 100);
  }, []);

  scheduleNextRotationRef.current = () => {
    if (isStoppingRef.current) return;
    const currentIdx = chunkIndexRef.current;
    let delay = 10000;
    if (currentIdx === 1) delay = 3000;
    else if (currentIdx === 2) delay = 3000;
    else if (currentIdx === 3) delay = 4000;

    rotationTimerRef.current = setTimeout(() => {
      rotateChunk();
      scheduleNextRotationRef.current?.();
    }, delay) as any;
  };

  const startRecording = useCallback(async () => {
    try {
      isStoppingRef.current = false;
      accumulatedRef.current = "";
      pendingRef.current = 0;
      chunkIndexRef.current = 0;
      failedIndicesRef.current = [];
      allChunkBlobsRef.current = [];
      transcriptsMapRef.current.clear();
      chunkTimingsRef.current.clear();
      setLiveTranscript("");
      setFailedChunkCount(0);

      // Resolve dictionary keyterm biasing for surfaces that opted in. Best-
      // effort + non-blocking: fire it off; chunks fall back to "" until it
      // lands (first chunk is ~3 s out, the RPC is faster). Never await here.
      const dictSurfaceKey =
        transcriptionOptionsRef.current?.dictionarySurfaceKey;
      dictPromptRef.current = "";
      if (dictSurfaceKey && !transcriptionOptionsRef.current?.prompt) {
        void import("@/features/dictionary/sttBridge").then(
          ({ resolveDictionarySttPrompt }) =>
            resolveDictionarySttPrompt(dictSurfaceKey).then((p) => {
              dictPromptRef.current = p;
            }),
        );
      }

      // Shared mic manager: reuses a warm grant so mobile doesn't re-prompt
      // on every recording. Released (not hard-stopped) on teardown.
      const stream = await acquireMicStream({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16_000,
        channelCount: 1,
      });
      micHeldRef.current = true;
      streamRef.current = stream;

      // Level meter taps the SHARED, resumable AudioContext (never per-instance
      // `new AudioContext()` — that churned contexts and risked iOS exhaustion).
      // resume() here rides the record-button gesture so iOS un-suspends it.
      // Capture is independent of this; if Web Audio is unavailable the meter
      // just stays flat and recording proceeds normally.
      const sharedCtx = getSharedAudioContext();
      if (sharedCtx) {
        await resumeSharedAudioContext();
        audioCtxRef.current = sharedCtx;
        analyserRef.current = sharedCtx.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.smoothingTimeConstant = 0.8;
        const source = sharedCtx.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        sourceNodeRef.current = source;
        startAudioAnalysis();
      }

      mimeTypeRef.current = MediaRecorder.isTypeSupported(
        "audio/webm;codecs=opus",
      )
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const safetyId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      safetyIdRef.current = safetyId;

      try {
        await audioSafetyStore.createEntry(
          safetyId,
          sessionId,
          mimeTypeRef.current,
        );
      } catch (err) {
        console.warn(
          "[chunked-transcription] IndexedDB init failed, continuing without persistence:",
          err,
        );
        safetyIdRef.current = "";
      }

      // Reset the recording clock BEFORE creating the first recorder. createRecorder
      // stamps chunk 0's tStart = sessionRelativeSec(), which reads startTimeRef —
      // so if we create the recorder first, chunk 0 (and the combo that inherits
      // its tStart) gets timed against the PREVIOUS recording's start. The first
      // recording escapes this only because startTimeRef is initially 0 (and
      // sessionRelativeSec returns 0 for a falsy ref); every SECOND+ recording got
      // chunk 0 stamped at the session's elapsed seconds (the "consistently 0:07"
      // bug — those out-of-range chunks then corrupted the card's duration sort).
      startTimeRef.current = Date.now();
      pausedDurationRef.current = 0;
      setIsRecording(true);

      mediaRecorderRef.current = createRecorder(stream);

      startDurationTimer();

      scheduleNextRotationRef.current?.();
    } catch (err) {
      const sol = getErrorSolution(err);
      onErrorRef.current?.(sol.message, sol.code);
      cleanup();
    }
  }, [
    cleanup,
    startAudioAnalysis,
    startDurationTimer,
    createRecorder,
    rotateChunk,
  ]);

  const stopRecording = useCallback(() => {
    isStoppingRef.current = true;

    if (rotationTimerRef.current) {
      clearTimeout(rotationTimerRef.current as any);
      rotationTimerRef.current = null;
    }
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    disconnectAnalyser();
    streamRef.current = null;
    if (micHeldRef.current) {
      releaseMicStream();
      micHeldRef.current = false;
    }

    setIsRecording(false);
    setIsPaused(false);
    setAudioLevel(0);
    pausedDurationRef.current = 0;

    if (safetyIdRef.current) {
      audioSafetyStore
        .setStatus(safetyIdRef.current, "transcribing")
        .catch(() => {});
    }

    if (
      !mediaRecorderRef.current ||
      mediaRecorderRef.current.state === "inactive"
    ) {
      mediaRecorderRef.current = null;
      if (pendingRef.current === 0) {
        maybeFireFinal();
      }
      return;
    }

    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
  }, [maybeFireFinal, disconnectAnalyser]);

  // Surface OS-level mic interruptions LOUDLY while recording. A hard `ended`
  // (iOS lock / call / app switch) or a permission revoke kills capture — the
  // user must see it, not discover a silently dropped recording later. The
  // chunks captured so far are already safe in IndexedDB; this just makes the
  // failure visible. Transient mute/unmute is logged by the manager, not raised.
  useEffect(() => {
    return subscribeMicInterruption((reason) => {
      if (reason !== "ended" && reason !== "permission-revoked") return;
      if (!mediaRecorderRef.current && !isStoppingRef.current) return;
      const message =
        reason === "permission-revoked"
          ? "Microphone permission was revoked mid-recording. Audio captured so far is saved; re-enable mic access to continue."
          : "The microphone was interrupted (a call, screen lock, or app switch). Audio up to that point is saved; tap record to resume.";
      onErrorRef.current?.(message, "MIC_INTERRUPTED");
    });
  }, []);

  const pauseRecording = useCallback(() => {
    if (
      !mediaRecorderRef.current ||
      mediaRecorderRef.current.state !== "recording"
    )
      return;

    if (rotationTimerRef.current) {
      clearTimeout(rotationTimerRef.current as any);
      rotationTimerRef.current = null;
    }
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;

    pausedAtRef.current = Date.now();
    setAudioLevel(0);
    setIsPaused(true);
  }, []);

  const resumeRecording = useCallback(() => {
    if (!streamRef.current) return;
    pausedDurationRef.current += Date.now() - pausedAtRef.current;

    mediaRecorderRef.current = createRecorder(streamRef.current);

    startAudioAnalysis();
    startDurationTimer();
    scheduleNextRotationRef.current?.();
    setIsPaused(false);
  }, [createRecorder, startAudioAnalysis, startDurationTimer, rotateChunk]);

  const reset = useCallback(() => {
    cleanup();
    setIsRecording(false);
    setIsTranscribing(false);
    setDuration(0);
    setAudioLevel(0);
    setLiveTranscript("");
    setFailedChunkCount(0);
    accumulatedRef.current = "";
    pendingRef.current = 0;
    chunkIndexRef.current = 0;
    failedIndicesRef.current = [];
    allChunkBlobsRef.current = [];
    transcriptsMapRef.current.clear();
    chunkTimingsRef.current.clear();
  }, [cleanup]);

  return {
    isRecording,
    isTranscribing,
    isPaused,
    duration,
    audioLevel,
    liveTranscript,
    failedChunkCount,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    reset,
    /** Current crash-safe IndexedDB entry id, or "" when idle. */
    getSafetyId: () => safetyIdRef.current,
  };
}

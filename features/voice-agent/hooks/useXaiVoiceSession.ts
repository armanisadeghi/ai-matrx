// features/voice-agent/hooks/useXaiVoiceSession.ts
//
// The orchestrator hook — the only hook the pages mount. Owns the
// lifecycle of:
//
//   - tokenManager (pre-mints + refreshes the xAI client_secret)
//   - xaiClient (WebSocket)
//   - audioCapture (mic + AudioWorklet + pre-connect buffer)
//   - audioPlayback (PCM scheduler + interruption)
//
// And translates every server event into a slice action + an audio side
// effect. Returns a tiny API for the UI: `status`, `error`, `toggle`, `stop`.
//
// Latency invariants (encoded structurally here so they cannot regress):
//   1. Token is pre-minted on mount, not on click.
//   2. AudioContexts are created/resumed SYNCHRONOUSLY inside the click handler
//      (Safari) before any await.
//   3. Mic capture and WebSocket connect run in PARALLEL via Promise.all.
//   4. Mic frames captured before session.updated are buffered and flushed in
//      chronological order — the first 200–700ms of speech is preserved.
//   5. Interruption is synchronous: stop sources → send response.cancel in the
//      same speech_started handler microtask.

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  addLatencySample,
  appendAssistantTurn,
  appendUserTurn,
  completeAssistantTurn,
  completeUserTurn,
  markTurnInterrupted,
  setError,
  setSessionStartedAt,
  setStatus,
  updateAssistantTranscriptDelta,
  updateUserTranscriptDelta,
} from "../state/voiceAgentSlice";
import {
  selectVoiceError,
  selectVoiceInstructions,
  selectVoiceStatus,
  selectVoiceTools,
  selectVoiceVoiceId,
} from "../state/selectors";
import { createAudioCapture, type CaptureError } from "../audio/audioCapture";
import { createAudioPlayback } from "../audio/audioPlayback";
import { createTokenManager, type TokenError } from "../transport/tokenManager";
import { createXaiClient, type XaiClientError } from "../transport/xaiClient";
import type { XaiServerEvent } from "../transport/serverEvents";

interface UseXaiVoiceSessionOpts {
  instanceId: string;
  /** Dev-only: override token TTL for refresh testing. */
  devTokenTtlSeconds?: number;
}

export interface VoiceSessionApi {
  status: ReturnType<typeof selectVoiceStatus>;
  error: ReturnType<typeof selectVoiceError>;
  toggle: () => void;
  stop: () => Promise<void>;
}

function makeTurnId(): string {
  // crypto.randomUUID() everywhere we ship (Chrome 92+, Safari 15.4+, FF 95+, mobile Safari 15.4+).
  // The Math.random fallback is for the rare older test runner.
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function useXaiVoiceSession(
  opts: UseXaiVoiceSessionOpts,
): VoiceSessionApi {
  const { instanceId, devTokenTtlSeconds } = opts;
  const dispatch = useAppDispatch();

  const status = useAppSelector((s) => selectVoiceStatus(s, instanceId));
  const error = useAppSelector((s) => selectVoiceError(s, instanceId));
  // These three are read at click-time via the store; we keep them in refs so
  // the toggle handler doesn't have stale closures.
  const voiceId = useAppSelector((s) => selectVoiceVoiceId(s, instanceId));
  const instructions = useAppSelector((s) =>
    selectVoiceInstructions(s, instanceId),
  );
  const tools = useAppSelector((s) => selectVoiceTools(s, instanceId));

  const voiceIdRef = useRef(voiceId);
  const instructionsRef = useRef(instructions);
  const toolsRef = useRef(tools);
  voiceIdRef.current = voiceId;
  instructionsRef.current = instructions;
  toolsRef.current = tools;

  // Module singletons — created lazily on first use, never re-created.
  const tokenManagerRef = useRef<ReturnType<typeof createTokenManager> | null>(
    null,
  );
  const xaiClientRef = useRef<ReturnType<typeof createXaiClient> | null>(null);
  const captureRef = useRef<ReturnType<typeof createAudioCapture> | null>(null);
  const playbackRef = useRef<ReturnType<typeof createAudioPlayback> | null>(
    null,
  );

  // Per-turn refs — managed across the event stream, not via React state.
  const pendingUserTurnIdRef = useRef<string | null>(null);
  const pendingAssistantTurnIdRef = useRef<string | null>(null);
  const speechEndedAtMsRef = useRef<number | null>(null);
  const assistantTurnStartedAtMsRef = useRef<number | null>(null);
  const firstAudioReceivedRef = useRef(false);

  // Active xaiClient subscriptions for the current session. Tracked so a clean
  // `stop()` can tear them down — otherwise every restart layers a new set on
  // top of the old, producing duplicate transcripts and status flapping.
  const sessionUnsubsRef = useRef<Array<() => void>>([]);
  function clearSessionSubscriptions(): void {
    for (const u of sessionUnsubsRef.current) {
      try {
        u();
      } catch {
        // ignore
      }
    }
    sessionUnsubsRef.current = [];
  }

  // ─── Module construction (idempotent) ──────────────────────────────────
  const ensureModules = useCallback(() => {
    if (!tokenManagerRef.current) {
      tokenManagerRef.current = createTokenManager({
        devTtlSeconds: devTokenTtlSeconds,
      });
      tokenManagerRef.current.onError((err: TokenError) => {
        dispatch(
          setError({
            instanceId,
            error: { code: `token-${err.code}`, message: err.message },
          }),
        );
      });
    }
    if (!xaiClientRef.current) {
      xaiClientRef.current = createXaiClient();
    }
    if (!captureRef.current) {
      captureRef.current = createAudioCapture();
      captureRef.current.onError((err: CaptureError) => {
        dispatch(
          setError({
            instanceId,
            error: { code: `mic-${err.code}`, message: err.message },
          }),
        );
      });
    }
    if (!playbackRef.current) {
      playbackRef.current = createAudioPlayback();
    }
  }, [dispatch, instanceId, devTokenTtlSeconds]);

  // ─── Pre-mint token on mount (parallel with hydration) ─────────────────
  useEffect(() => {
    ensureModules();
    void tokenManagerRef.current?.prime().catch(() => {
      // Errors surface via onError → setError dispatch. Don't re-throw here.
    });
    // No cleanup on token prime — the manager persists until full unmount.
  }, [ensureModules]);

  // ─── Wire xaiClient event stream → slice + audio ───────────────────────
  const handleServerEvent = useCallback(
    (event: XaiServerEvent) => {
      switch (event.type) {
        case "session.created":
          // Wait for session.updated — sending audio now would race.
          break;

        case "session.updated": {
          dispatch(setStatus({ instanceId, status: "listening" }));
          dispatch(
            setSessionStartedAt({ instanceId, startedAtMs: Date.now() }),
          );
          // Flush the pre-connect buffer and route subsequent frames live.
          const send = (frame: ArrayBuffer) => {
            xaiClientRef.current?.sendInputAudio(frame);
          };
          captureRef.current?.setLive(send);
          break;
        }

        case "conversation.created":
          break;

        case "conversation.item.added":
        case "conversation.item.created": {
          // Attach the server-issued item.id to whichever pending turn matches the role.
          const role = event.item.role;
          if (role === "user" && pendingUserTurnIdRef.current) {
            // We complete the user turn here with item.id; the transcription
            // delta stream may still arrive after, but the metadata is set.
            // Leaving ended_at_ms to be set on speech_stopped below.
          }
          break;
        }

        case "input_audio_buffer.speech_started": {
          const now = Date.now();
          // If the assistant is mid-utterance, interrupt synchronously.
          if (pendingAssistantTurnIdRef.current && playbackRef.current) {
            const playedMs = playbackRef.current.interrupt();
            xaiClientRef.current?.cancelResponse();
            dispatch(
              markTurnInterrupted({
                instanceId,
                turnId: pendingAssistantTurnIdRef.current,
                endedAtMs: now,
                audioDurationMs: playedMs,
              }),
            );
            pendingAssistantTurnIdRef.current = null;
            assistantTurnStartedAtMsRef.current = null;
            // Brief flash state; we go straight back to listening below.
            dispatch(setStatus({ instanceId, status: "interrupting" }));
          }

          // Begin a new user turn.
          const turnId = makeTurnId();
          pendingUserTurnIdRef.current = turnId;
          dispatch(appendUserTurn({ instanceId, turnId, startedAtMs: now }));
          dispatch(setStatus({ instanceId, status: "listening" }));
          break;
        }

        case "input_audio_buffer.speech_stopped": {
          speechEndedAtMsRef.current = Date.now();
          dispatch(setStatus({ instanceId, status: "thinking" }));
          break;
        }

        case "input_audio_buffer.committed": {
          // Nothing to do — server has accepted the audio.
          break;
        }

        case "conversation.item.input_audio_transcription.delta": {
          if (!pendingUserTurnIdRef.current) break;
          dispatch(
            updateUserTranscriptDelta({
              instanceId,
              turnId: pendingUserTurnIdRef.current,
              deltaText: event.delta,
            }),
          );
          break;
        }

        case "conversation.item.input_audio_transcription.completed": {
          if (!pendingUserTurnIdRef.current) break;
          dispatch(
            completeUserTurn({
              instanceId,
              turnId: pendingUserTurnIdRef.current,
              itemId: event.item_id,
              endedAtMs: Date.now(),
            }),
          );
          pendingUserTurnIdRef.current = null;
          break;
        }

        case "response.created": {
          const turnId = makeTurnId();
          pendingAssistantTurnIdRef.current = turnId;
          assistantTurnStartedAtMsRef.current = Date.now();
          firstAudioReceivedRef.current = false;
          dispatch(
            appendAssistantTurn({
              instanceId,
              turnId,
              startedAtMs: assistantTurnStartedAtMsRef.current,
            }),
          );
          break;
        }

        case "response.output_item.added":
        case "response.output_item.done":
        case "response.content_part.added":
        case "response.content_part.done": {
          // Reserved for v1.1 tool-call breadcrumbs.
          break;
        }

        case "response.output_audio_transcript.delta":
        case "response.audio_transcript.delta": {
          if (!pendingAssistantTurnIdRef.current) break;
          dispatch(
            updateAssistantTranscriptDelta({
              instanceId,
              turnId: pendingAssistantTurnIdRef.current,
              deltaText: event.delta,
            }),
          );
          break;
        }

        case "response.output_audio_transcript.done":
        case "response.audio_transcript.done": {
          // Text complete; audio may still be playing.
          break;
        }

        case "response.output_audio.delta":
        case "response.audio.delta": {
          if (!playbackRef.current) break;
          playbackRef.current.enqueue(event.delta);
          if (!firstAudioReceivedRef.current) {
            firstAudioReceivedRef.current = true;
            if (speechEndedAtMsRef.current !== null) {
              dispatch(
                addLatencySample({
                  instanceId,
                  ms: Date.now() - speechEndedAtMsRef.current,
                }),
              );
            }
            dispatch(setStatus({ instanceId, status: "speaking" }));
          }
          break;
        }

        case "response.output_audio.done":
        case "response.audio.done": {
          // Audio stream from server done; wait for playback.onIdle to flip status.
          break;
        }

        case "response.function_call.created":
        case "response.function_call_arguments.done":
        case "response.function_call.done": {
          // Built-in tools (web_search, x_search) execute server-side — no
          // client work needed. Custom function tools will route through here
          // in v1.1: receive args → execute locally → send function_call_output.
          break;
        }

        case "response.done": {
          if (!pendingAssistantTurnIdRef.current) break;
          const playedMs = playbackRef.current?.markTurnEnded() ?? 0;
          const speechTtfb =
            speechEndedAtMsRef.current !== null &&
            assistantTurnStartedAtMsRef.current !== null
              ? assistantTurnStartedAtMsRef.current - speechEndedAtMsRef.current
              : undefined;
          dispatch(
            completeAssistantTurn({
              instanceId,
              turnId: pendingAssistantTurnIdRef.current,
              responseId: event.response.id,
              endedAtMs: Date.now(),
              audioDurationMs: playedMs,
              speechTtfbMs: speechTtfb,
            }),
          );

          // Transition status back to listening once playback drains.
          const playback = playbackRef.current;
          if (playback) {
            const unsub = playback.onIdle(() => {
              unsub();
              dispatch(setStatus({ instanceId, status: "listening" }));
            });
          }

          pendingAssistantTurnIdRef.current = null;
          assistantTurnStartedAtMsRef.current = null;
          speechEndedAtMsRef.current = null;
          break;
        }

        case "response.cancelled": {
          // Server confirmed our response.cancel. The turn was already marked
          // interrupted in the speech_started handler.
          break;
        }

        case "rate_limits.updated": {
          if (process.env.NODE_ENV !== "production") {
            console.debug(
              "[useXaiVoiceSession] rate_limits.updated",
              event.rate_limits,
            );
          }
          break;
        }

        case "error": {
          // The xaiClient already surfaced this via onError; nothing extra.
          break;
        }

        case "unknown": {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "[useXaiVoiceSession] Unknown server event:",
              event.raw,
            );
          }
          break;
        }

        default: {
          // Exhaustiveness check — TypeScript will error if a new event type
          // is added to the union without a handler here.
          const _exhaustive: never = event;
          void _exhaustive;
        }
      }
    },
    [dispatch, instanceId],
  );

  const handleClientError = useCallback(
    (err: XaiClientError) => {
      dispatch(
        setError({
          instanceId,
          error: { code: `ws-${err.code}`, message: err.message },
        }),
      );
    },
    [dispatch, instanceId],
  );

  // ─── start / stop ──────────────────────────────────────────────────────
  const stop = useCallback(async (): Promise<void> => {
    pendingUserTurnIdRef.current = null;
    pendingAssistantTurnIdRef.current = null;
    speechEndedAtMsRef.current = null;
    assistantTurnStartedAtMsRef.current = null;
    firstAudioReceivedRef.current = false;

    xaiClientRef.current?.disconnect();
    clearSessionSubscriptions();
    await captureRef.current?.stop();
    await playbackRef.current?.stop();

    // xAI consumes the ephemeral `client_secret` when the WebSocket handshake
    // completes — presenting the same secret to a fresh connection within its
    // TTL fails with an opaque "WebSocket connection error". Drop the cached
    // token now and warm a fresh one in the background so the next start is
    // both correct AND fast.
    const tokens = tokenManagerRef.current;
    if (tokens) {
      tokens.invalidate();
      void tokens.prime().catch(() => {
        // Errors surface via onError → setError dispatch.
      });
    }

    dispatch(setStatus({ instanceId, status: "idle" }));
  }, [dispatch, instanceId]);

  const start = useCallback(async (): Promise<void> => {
    ensureModules();
    const client = xaiClientRef.current!;
    const capture = captureRef.current!;
    const playback = playbackRef.current!;
    const tokens = tokenManagerRef.current!;

    // CRITICAL: warmup BOTH AudioContexts synchronously inside the user
    // gesture. This is called from the click handler `toggle()` before any
    // await, so it runs in the same microtask as the click event.
    try {
      capture.warmupSync();
      playback.warmupSync();
    } catch (err) {
      dispatch(
        setError({
          instanceId,
          error: {
            code: "audio-unsupported",
            message:
              err instanceof Error
                ? err.message
                : "Browser does not support the audio APIs required for voice.",
          },
        }),
      );
      return;
    }

    // Clear any prior error explicitly on a fresh attempt — the slice no
    // longer auto-clears on status transitions (errors are sticky).
    dispatch(setError({ instanceId, error: null }));
    dispatch(setStatus({ instanceId, status: "requesting-mic" }));

    // Drop any subscriptions left over from a previous session before adding
    // the new set — defense in depth alongside stop()'s cleanup.
    clearSessionSubscriptions();

    // Subscribe BEFORE connect so we don't miss session.created.
    const unsubEvent = client.onEvent(handleServerEvent);
    const unsubError = client.onError(handleClientError);
    const unsubClose = client.onClose((info) => {
      if (info.intentional) return;
      // Network close mid-session — flip to idle so the mic button reads "start again".
      void stop();
    });
    sessionUnsubsRef.current.push(unsubEvent, unsubError, unsubClose);

    try {
      const token = await tokens.getCurrent();
      // After token fetch, briefly flip status to 'connecting' for the UI.
      dispatch(setStatus({ instanceId, status: "connecting" }));

      // PARALLEL: open WS and start mic at the same time.
      await Promise.all([
        client.connect(token, {
          voiceId: voiceIdRef.current,
          instructions: instructionsRef.current,
          tools: [...toolsRef.current],
        }),
        capture.start(),
      ]);
      // status flips to 'listening' from inside handleServerEvent on session.updated.
    } catch (err) {
      clearSessionSubscriptions();
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err && "message" in err
            ? String((err as { message: unknown }).message)
            : "Failed to start voice session.";
      const code =
        typeof err === "object" && err && "code" in err
          ? String((err as { code: unknown }).code)
          : "start-failed";
      dispatch(setError({ instanceId, error: { code, message } }));
      await stop();
    }
  }, [
    dispatch,
    ensureModules,
    handleClientError,
    handleServerEvent,
    instanceId,
    stop,
  ]);

  const toggle = useCallback(() => {
    // The click handler is intentionally synchronous up to the warmup;
    // start() handles its own async after the warmup.
    if (status === "idle" || status === "error") {
      void start();
    } else {
      void stop();
    }
  }, [status, start, stop]);

  // ─── Cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      void stop();
      tokenManagerRef.current?.dispose();
      tokenManagerRef.current = null;
      xaiClientRef.current = null;
      captureRef.current = null;
      playbackRef.current = null;
    };
    // Mount-once cleanup; `stop` is stable via useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, error, toggle, stop };
}

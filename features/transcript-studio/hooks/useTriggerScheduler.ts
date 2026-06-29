"use client";

/**
 * useTriggerScheduler
 *
 * Drives the per-column agent passes for an active studio session. Phase 5
 * implements the cleaning column (Column 2). Phases 6 and 7 will add
 * concepts (Column 3) and the Column 4 module on the same scheduler.
 *
 * Cadence:
 *   - Cleanup: every `cleaning_interval_ms` (default 30s) WHILE recording.
 *     A ±`silenceWindowMs` window lets the scheduler defer to a quiet
 *     moment when one's available; a hard ceiling at `interval + window`
 *     forces a flush regardless of audio level.
 *   - On `recording-start`: fire one immediate pass with cause
 *     `"session-start"` so Column 2 begins populating right away.
 *   - On `recording-stop`: fire one final pass with cause `"session-stop"`
 *     so any tail-end raw text gets cleaned up.
 *
 * Concurrency:
 *   At most one cleanup pass in flight at a time. New ticks while a pass
 *   is running set a `pendingFlush` flag, which causes the scheduler to
 *   re-fire immediately after the current pass resolves. Network failures
 *   are non-fatal — the next tick retries with a wider window.
 *
 * The scheduler runs only while the component holding it is mounted (the
 * studio session view). Recording lives in the global provider so it
 * survives navigation; agent passes do NOT — leaving the studio pauses
 * cleanup until you come back.
 */

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  CLEANING_INTERVAL_DEFAULT_MS,
  CLEANING_SILENCE_WINDOW_MS,
  CONCEPT_INTERVAL_DEFAULT_MS,
  MODULE_INTERVAL_DEFAULT_MS,
  SILENCE_LEVEL_THRESHOLD,
  TRIGGER_SCHEDULER_TICK_MS,
} from "../constants";
import { runCleaningPassThunk } from "../redux/runCleaningPass.thunk";
import { runConceptPassThunk } from "../redux/runConceptPass.thunk";
import { runModulePassThunk } from "../redux/runModulePass.thunk";

interface UseTriggerSchedulerOptions {
  sessionId: string | null;
  /** Per-session override; falls back to the global default. */
  cleaningIntervalMs?: number;
  /** Override the silence-detection window. Falls back to ±5s. */
  silenceWindowMs?: number;
  /** Per-session override for concept-extraction cadence. */
  conceptIntervalMs?: number;
  /** Per-session override for the active Column-4 module's cadence. */
  moduleIntervalMs?: number;
}

/**
 * Internal per-runner state. Mutable refs only — never trigger re-renders.
 */
interface RunnerState {
  inFlight: boolean;
  pendingFlush: boolean;
  lastFlushAtMs: number;
}

const NEW_RUNNER = (): RunnerState => ({
  inFlight: false,
  pendingFlush: false,
  lastFlushAtMs: 0,
});

export function useTriggerScheduler({
  sessionId,
  cleaningIntervalMs = CLEANING_INTERVAL_DEFAULT_MS,
  silenceWindowMs = CLEANING_SILENCE_WINDOW_MS,
  conceptIntervalMs = CONCEPT_INTERVAL_DEFAULT_MS,
  moduleIntervalMs = MODULE_INTERVAL_DEFAULT_MS,
}: UseTriggerSchedulerOptions): void {
  const dispatch = useAppDispatch();

  const isOwnedRecording = useAppSelector(
    (s) =>
      s.recordings.isRecording &&
      s.recordings.context?.kind === "studio" &&
      s.recordings.context.sessionId === sessionId,
  );
  const isPaused = useAppSelector((s) => s.recordings.isPaused);
  const audioLevel = useAppSelector((s) => s.recordings.audioLevel);

  // Refs: scheduler + runner state. Refs avoid effect-loops driven by
  // re-renders of audioLevel (~60 fps).
  const cleaningRef = useRef<RunnerState>(NEW_RUNNER());
  const conceptRef = useRef<RunnerState>(NEW_RUNNER());
  const moduleRef = useRef<RunnerState>(NEW_RUNNER());
  const audioLevelRef = useRef(audioLevel);
  audioLevelRef.current = audioLevel;
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  // ── Run a cleanup pass with the per-column mutex.
  const runCleanup = useRef<(cause: TriggerSchedulerCause) => void>(() => {});
  runCleanup.current = (cause) => {
    if (!sessionId) return;
    const r = cleaningRef.current;
    if (r.inFlight) {
      r.pendingFlush = true;
      return;
    }
    r.inFlight = true;
    r.lastFlushAtMs = Date.now();
    void dispatch(
      runCleaningPassThunk({ sessionId, triggerCause: cause }),
    ).finally(() => {
      r.inFlight = false;
      if (r.pendingFlush) {
        r.pendingFlush = false;
        setTimeout(() => runCleanup.current("interval"), 0);
      }
    });
  };

  // ── Run a concept pass. Same mutex pattern; no silence-detection window
  //    (concept extraction runs ~10x less often, the audio-level signal is
  //    much noisier across that interval).
  const runConcept = useRef<(cause: TriggerSchedulerCause) => void>(() => {});
  runConcept.current = (cause) => {
    if (!sessionId) return;
    const r = conceptRef.current;
    if (r.inFlight) {
      r.pendingFlush = true;
      return;
    }
    r.inFlight = true;
    r.lastFlushAtMs = Date.now();
    void dispatch(
      runConceptPassThunk({ sessionId, triggerCause: cause }),
    ).finally(() => {
      r.inFlight = false;
      if (r.pendingFlush) {
        r.pendingFlush = false;
        setTimeout(() => runConcept.current("interval"), 0);
      }
    });
  };

  // ── Run a module pass. Same mutex pattern; cadence is the active
  //    module's `defaultIntervalMs` overridden by `moduleIntervalMs`.
  const runModule = useRef<(cause: TriggerSchedulerCause) => void>(() => {});
  runModule.current = (cause) => {
    if (!sessionId) return;
    const r = moduleRef.current;
    if (r.inFlight) {
      r.pendingFlush = true;
      return;
    }
    r.inFlight = true;
    r.lastFlushAtMs = Date.now();
    void dispatch(
      runModulePassThunk({ sessionId, triggerCause: cause }),
    ).finally(() => {
      r.inFlight = false;
      if (r.pendingFlush) {
        r.pendingFlush = false;
        setTimeout(() => runModule.current("interval"), 0);
      }
    });
  };

  // ── Recording start / stop edges. All three columns flush on edges.
  const wasRecordingRef = useRef(false);
  useEffect(() => {
    const wasRecording = wasRecordingRef.current;
    wasRecordingRef.current = isOwnedRecording;
    if (!sessionId) return;
    if (!wasRecording && isOwnedRecording) {
      cleaningRef.current = NEW_RUNNER();
      cleaningRef.current.lastFlushAtMs = Date.now();
      conceptRef.current = NEW_RUNNER();
      conceptRef.current.lastFlushAtMs = Date.now();
      moduleRef.current = NEW_RUNNER();
      moduleRef.current.lastFlushAtMs = Date.now();
      runCleanup.current("session-start");
      runConcept.current("session-start");
      runModule.current("session-start");
    } else if (wasRecording && !isOwnedRecording) {
      runCleanup.current("session-stop");
      runConcept.current("session-stop");
      runModule.current("session-stop");
    }
  }, [isOwnedRecording, sessionId]);

  // ── Tick loop: cleanup with silence-detection window.
  useEffect(() => {
    if (!sessionId || !isOwnedRecording) return undefined;
    const id = setInterval(() => {
      if (isPausedRef.current) return;
      const r = cleaningRef.current;
      if (r.inFlight) return;
      const sinceLast = Date.now() - r.lastFlushAtMs;
      const earliest = cleaningIntervalMs - silenceWindowMs;
      const latest = cleaningIntervalMs + silenceWindowMs;
      if (sinceLast < earliest) return;
      if (sinceLast < latest) {
        if (audioLevelRef.current >= SILENCE_LEVEL_THRESHOLD) return;
      }
      runCleanup.current("interval");
    }, TRIGGER_SCHEDULER_TICK_MS);
    return () => clearInterval(id);
  }, [sessionId, isOwnedRecording, cleaningIntervalMs, silenceWindowMs]);

  // ── Tick loop: concept extraction. No silence window; just fire at
  //    `conceptIntervalMs` past the last flush. The thunk itself short-
  //    circuits when there's no new raw text since the last successful pass.
  useEffect(() => {
    if (!sessionId || !isOwnedRecording) return undefined;
    const id = setInterval(() => {
      if (isPausedRef.current) return;
      const r = conceptRef.current;
      if (r.inFlight) return;
      const sinceLast = Date.now() - r.lastFlushAtMs;
      if (sinceLast < conceptIntervalMs) return;
      runConcept.current("interval");
    }, TRIGGER_SCHEDULER_TICK_MS);
    return () => clearInterval(id);
  }, [sessionId, isOwnedRecording, conceptIntervalMs]);

  // ── Tick loop: Column 4 module. Same shape as the concept ticker.
  //    The module's default interval can be overridden via session settings.
  useEffect(() => {
    if (!sessionId || !isOwnedRecording) return undefined;
    const id = setInterval(() => {
      if (isPausedRef.current) return;
      const r = moduleRef.current;
      if (r.inFlight) return;
      const sinceLast = Date.now() - r.lastFlushAtMs;
      if (sinceLast < moduleIntervalMs) return;
      runModule.current("interval");
    }, TRIGGER_SCHEDULER_TICK_MS);
    return () => clearInterval(id);
  }, [sessionId, isOwnedRecording, moduleIntervalMs]);
}

type TriggerSchedulerCause =
  | "interval"
  | "session-start"
  | "session-stop"
  | "manual";

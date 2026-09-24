// components/markdown-studio/lab/useStreamSimulation.ts
//
// Drives a simulated stream: chunks text with the shared chunker and feeds
// each chunk to a caller callback on a timer, with progress / elapsed /
// chunk counters and a stop switch. Used by the Markdown Studio's
// "replay as stream" preview and the JSON-extraction simulator.

"use client";

import { useRef, useState } from "react";
import { generateChunks, type StreamSimSettings } from "./stream-chunks";

export interface StreamSimProgress {
  isRunning: boolean;
  /** 0–100 */
  progress: number;
  chunksProcessed: number;
  totalChunks: number;
  elapsedMs: number;
  /** Average wall-clock time per delivered chunk (render cost included). */
  msPerChunk: number;
  /** The delay the run was configured with. */
  targetDelayMs: number;
  /** The text this run streamed — stats describe ONLY this text. */
  text: string | null;
}

export interface StreamSimRunHandlers {
  /** Called once per chunk with the chunk and the text accumulated so far. */
  onChunk: (chunk: string, accumulated: string, index: number) => void;
  /** Called when every chunk was delivered (never on stop). */
  onComplete?: (fullText: string) => void;
  /** Called when the run was stopped before the last chunk. */
  onStopped?: (accumulated: string) => void;
}

const IDLE: StreamSimProgress = {
  isRunning: false,
  progress: 0,
  chunksProcessed: 0,
  totalChunks: 0,
  elapsedMs: 0,
  msPerChunk: 0,
  targetDelayMs: 0,
  text: null,
};

/** Idle stats for a buffer the last run did not stream — a readout never
 *  describes a previous buffer (RC-B1 verify D4). */
export function progressForText(
  progress: StreamSimProgress,
  text: string,
): StreamSimProgress {
  return progress.text === text ? progress : IDLE;
}

/**
 * How long to wait before delivering chunk `index` so chunk i lands at
 * t0 + (i+1) * delay on the wall clock. A fixed `setTimeout(delay)` after each
 * render adds the render cost to every chunk (30 ms configured ran ~79 ms);
 * scheduling against the clock absorbs it whenever rendering is faster than
 * the delay. When rendering is slower, the wait is 0 and the readout's
 * ms/chunk shows the real rate.
 */
export function waitBeforeChunk(
  index: number,
  delayMs: number,
  startedAt: number,
  now: number,
): number {
  return Math.max(0, startedAt + (index + 1) * delayMs - now);
}

export function useStreamSimulation() {
  const [state, setState] = useState<StreamSimProgress>(IDLE);
  const abortRef = useRef(false);
  const runIdRef = useRef(0);

  const run = async (
    text: string,
    settings: StreamSimSettings,
    handlers: StreamSimRunHandlers,
  ) => {
    abortRef.current = false;
    const runId = ++runIdRef.current;
    const chunks = generateChunks(text, settings);
    const t0 = performance.now();
    let acc = "";
    setState({
      ...IDLE,
      isRunning: true,
      totalChunks: chunks.length,
      targetDelayMs: settings.delayMs,
      text,
    });

    for (let i = 0; i < chunks.length; i++) {
      // A newer run or an explicit stop ends this loop.
      if (abortRef.current || runId !== runIdRef.current) {
        handlers.onStopped?.(acc);
        if (runId === runIdRef.current)
          setState((s) => ({ ...s, isRunning: false }));
        return;
      }
      acc += chunks[i];
      handlers.onChunk(chunks[i], acc, i);
      const elapsed = performance.now() - t0;
      setState({
        isRunning: true,
        progress: ((i + 1) / chunks.length) * 100,
        chunksProcessed: i + 1,
        totalChunks: chunks.length,
        elapsedMs: elapsed,
        msPerChunk: elapsed / (i + 1),
        targetDelayMs: settings.delayMs,
        text,
      });
      if (settings.delayMs > 0 && i < chunks.length - 1) {
        const wait = waitBeforeChunk(i + 1, settings.delayMs, t0, performance.now());
        await new Promise((r) => setTimeout(r, wait));
      }
    }

    if (runId !== runIdRef.current) return;
    handlers.onComplete?.(acc);
    setState((s) => {
      const elapsed = performance.now() - t0;
      return {
        ...s,
        isRunning: false,
        progress: 100,
        elapsedMs: elapsed,
        msPerChunk: chunks.length ? elapsed / chunks.length : 0,
      };
    });
  };

  const stop = () => {
    abortRef.current = true;
  };

  const reset = () => {
    abortRef.current = true;
    runIdRef.current++;
    setState(IDLE);
  };

  return { ...state, run, stop, reset };
}

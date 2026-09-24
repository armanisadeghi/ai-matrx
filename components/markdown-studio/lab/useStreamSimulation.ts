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
};

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
    setState({ ...IDLE, isRunning: true, totalChunks: chunks.length });

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
      setState({
        isRunning: true,
        progress: ((i + 1) / chunks.length) * 100,
        chunksProcessed: i + 1,
        totalChunks: chunks.length,
        elapsedMs: performance.now() - t0,
      });
      if (settings.delayMs > 0) {
        await new Promise((r) => setTimeout(r, settings.delayMs));
      }
    }

    if (runId !== runIdRef.current) return;
    handlers.onComplete?.(acc);
    setState((s) => ({
      ...s,
      isRunning: false,
      progress: 100,
      elapsedMs: performance.now() - t0,
    }));
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

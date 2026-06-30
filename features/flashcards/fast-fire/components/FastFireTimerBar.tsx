// features/flashcards/fast-fire/components/FastFireTimerBar.tsx
//
// The depleting timer bar + the live mic-level meter + the recording indicator.
// Both feeds are rAF-driven and pushed through subscriptions, NOT React state
// per frame — the component mutates DOM refs directly inside the callbacks, so a
// 60fps animation costs zero React re-renders (and never fights the deadline
// loop). This is the same discipline that kills the original timer churn bug.

"use client";

import { useEffect, useRef } from "react";
import { Mic } from "lucide-react";
import { subscribeLevel } from "../audio/continuousCapture";

interface FastFireTimerBarProps {
  /** From the drill hook — fires per frame with (remainingMs, progress 0..1). */
  subscribeProgress: (
    cb: (remainingMs: number, progress: number) => void,
  ) => () => void;
}

export function FastFireTimerBar({ subscribeProgress }: FastFireTimerBarProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const secondsRef = useRef<HTMLSpanElement | null>(null);
  const levelRef = useRef<HTMLDivElement | null>(null);

  // Timer bar: width shrinks from 100% → 0% as progress goes 0 → 1.
  useEffect(() => {
    return subscribeProgress((remainingMs, progress) => {
      if (barRef.current) {
        barRef.current.style.width = `${Math.max(0, (1 - progress) * 100)}%`;
        // Tint red in the last ~25%.
        barRef.current.style.backgroundColor =
          progress > 0.75 ? "rgb(239 68 68)" : "rgb(249 115 22)";
      }
      if (secondsRef.current) {
        secondsRef.current.textContent = `${Math.ceil(remainingMs / 1000)}s`;
      }
    });
  }, [subscribeProgress]);

  // Mic level meter: scaleX driven by the analyser level (0..1).
  useEffect(() => {
    return subscribeLevel((level) => {
      if (levelRef.current) {
        // Boost low levels so quiet speech still reads visibly.
        const v = Math.min(1, level * 2.2);
        levelRef.current.style.transform = `scaleX(${Math.max(0.02, v)})`;
      }
    });
  }, []);

  return (
    <div className="space-y-2">
      {/* Recording indicator + countdown seconds */}
      <div className="flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-red-600 dark:text-red-400">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
          </span>
          Recording
        </span>
        <span
          ref={secondsRef}
          className="tabular-nums font-semibold text-foreground"
        >
          —
        </span>
      </div>

      {/* Depleting timer bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          ref={barRef}
          className="h-full rounded-full transition-[background-color] duration-200"
          style={{ width: "100%", backgroundColor: "rgb(249 115 22)" }}
        />
      </div>

      {/* Mic level meter */}
      <div className="flex items-center gap-2">
        <Mic className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            ref={levelRef}
            className="h-full origin-left rounded-full bg-green-500"
            style={{ transform: "scaleX(0.02)" }}
          />
        </div>
      </div>
    </div>
  );
}

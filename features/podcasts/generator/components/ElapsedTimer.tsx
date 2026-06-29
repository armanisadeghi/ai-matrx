"use client";

// features/podcasts/generator/components/ElapsedTimer.tsx
// Ticks a mm:ss elapsed counter from a start epoch. Freezes once the run ends.

import { useEffect, useState } from "react";

interface ElapsedTimerProps {
  startedAt: number | null;
  /** When false, the timer freezes on its last value (run finished). */
  running: boolean;
  className?: string;
}

function format(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ElapsedTimer({ startedAt, running, className }: ElapsedTimerProps) {
  const [now, setNow] = useState<number>(() => startedAt ?? Date.now());

  useEffect(() => {
    if (!running || startedAt == null) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, startedAt]);

  if (startedAt == null) return null;
  return (
    <span className={className} aria-label="Elapsed time">
      {format((running ? now : Math.max(now, startedAt)) - startedAt)}
    </span>
  );
}

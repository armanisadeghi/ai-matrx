"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface AskCardCountdownProps {
  expiresAtMs: number;
  className?: string;
}

/**
 * Thin progress-bar countdown that runs along the bottom edge of an ask card.
 * Fills from full to empty over the remaining time. Updates at 100ms cadence
 * which is plenty for a perceptual countdown without burning CPU.
 */
export function AskCardCountdown({
  expiresAtMs,
  className,
}: AskCardCountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  const total = Math.max(0, expiresAtMs - now);
  const startedAtMs = useStableStart(expiresAtMs);
  const span = Math.max(1, expiresAtMs - startedAtMs);
  const pct = Math.max(0, Math.min(100, (total / span) * 100));

  useEffect(() => {
    if (Date.now() >= expiresAtMs) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [expiresAtMs]);

  return (
    <div
      className={cn(
        "h-0.5 w-full bg-border/40 rounded-full overflow-hidden",
        className,
      )}
    >
      <div
        className="h-full bg-primary/60 transition-[width] duration-100 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function useStableStart(expiresAtMs: number): number {
  const [start] = useState(() => Date.now());
  // Reset when the deadline jumps (rare — only if the same callId is updated).
  const [tracked, setTracked] = useState(expiresAtMs);
  useEffect(() => {
    setTracked(expiresAtMs);
  }, [expiresAtMs]);
  return tracked === expiresAtMs ? start : tracked - (tracked - start);
}

"use client";

// features/podcasts/generator/components/ElapsedTimer.tsx
//
// The podcast generator's name for THE elapsed clock. The implementation was
// promoted to `components/official-candidate/elapsed-time/ElapsedTime.tsx` when
// the workflow live-run surface needed the same clock — a second copy of a
// ticking timer is exactly the duplication the reuse ladder exists to prevent.
// This file stays as the compatibility name so every existing podcast callsite
// (and its `startedAt: number | null` prop shape) keeps working unchanged.

import { ElapsedTime } from "@/components/official-candidate/elapsed-time/ElapsedTime";

interface ElapsedTimerProps {
  startedAt: number | null;
  /** When false, the timer freezes on its last value (run finished). */
  running: boolean;
  className?: string;
}

export function ElapsedTimer({ startedAt, running, className }: ElapsedTimerProps) {
  return (
    <ElapsedTime startedAt={startedAt} running={running} className={className} />
  );
}

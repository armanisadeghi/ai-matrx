"use client";

// components/official-candidate/elapsed-time/ElapsedTime.tsx
//
// THE elapsed clock primitive: ticks mm:ss (h:mm:ss past an hour) from a start
// moment and FREEZES on its last value once the work ends. Promoted out of the
// podcast generator when the workflow live-run surface needed the same clock —
// one implementation, two consumers (features/podcasts/generator/components/
// ElapsedTimer.tsx re-exports this and is the compatibility name).
//
// Accepts an epoch (number) or an ISO string, so a caller holding a server
// timestamp never has to hand-parse one. `null` renders nothing — a run that
// has not started has no honest elapsed value, and "0:00" would be a lie.

import { useEffect, useState } from "react";

export interface ElapsedTimeProps {
  /** Epoch ms, an ISO timestamp, or null (renders nothing). */
  startedAt: number | string | null;
  /** When false the clock freezes on its last value (the work finished). */
  running: boolean;
  /** Freeze at this moment instead of "now" — the recorded end of the work. */
  endedAt?: number | string | null;
  className?: string;
}

function toEpoch(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** m:ss under an hour, h:mm:ss past it — never a bare millisecond count. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function ElapsedTime({
  startedAt,
  running,
  endedAt,
  className,
}: ElapsedTimeProps) {
  const start = toEpoch(startedAt);
  const end = toEpoch(endedAt);
  const [now, setNow] = useState<number>(() => start ?? Date.now());

  useEffect(() => {
    if (!running || start === null) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, start]);

  if (start === null) return null;
  const at = running ? now : (end ?? Math.max(now, start));
  return (
    <span className={className} aria-label="Elapsed time">
      {formatElapsed(at - start)}
    </span>
  );
}

export default ElapsedTime;

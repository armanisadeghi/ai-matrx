"use client";

// app/(core)/podcast/studio/run-a/_components/Elapsed.tsx
//
// A tiny self-contained elapsed timer (mm:ss) for the demo run page. Stops
// ticking once the run is no longer running.

import { useEffect, useState } from "react";

export function Elapsed({
  startedAt,
  running,
}: {
  startedAt: number | null;
  running: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || startedAt === null) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, startedAt]);

  if (startedAt === null) return <span className="tabular-nums">0:00</span>;
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return (
    <span className="tabular-nums">
      {m}:{s.toString().padStart(2, "0")}
    </span>
  );
}

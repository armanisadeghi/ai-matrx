"use client";

// app/(core)/podcast/studio/run-e/_components/Elapsed.tsx
//
// A live mm:ss elapsed clock. Ticks once a second off a fixed start.

import { useEffect, useState } from "react";

export function Elapsed({
  startedAt,
  stopped,
}: {
  startedAt: number | null;
  stopped?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (stopped) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [stopped]);

  if (!startedAt) return <span className="tabular-nums">0:00</span>;
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return (
    <span className="tabular-nums">
      {m}:{s.toString().padStart(2, "0")}
    </span>
  );
}

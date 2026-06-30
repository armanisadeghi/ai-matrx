"use client";

// features/flashcards/fast-fire/debug/AudioCaptureDebugPanel.tsx
//
// Admin-gated, real-time view of the audio capture core's internal state (owner
// direction 2026-06-30, Step 6: "surface internal state, don't hide it"). Reads
// the live snapshot from `subscribeDebug` — buffer size/duration, the sample
// clock, the per-card sample windows + computed durations, the live level, and
// which capture path (AudioWorklet vs ScriptProcessor) is active. Renders nothing
// for non-admins, so it's safe to drop anywhere (capture-test surface now, a live
// drill / window panel later). Temporary dev aid — removable.
//
// Gate: `selectIsAdmin` (admin sufficient, NOT super-admin) per owner.

import { useEffect, useState } from "react";
import { Activity, Mic, Waypoints } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import {
  subscribeDebug,
  type CaptureDebugSnapshot,
} from "../audio/continuousCapture";

function fmtSec(s: number): string {
  return `${s.toFixed(2)}s`;
}

export function AudioCaptureDebugPanel({ className }: { className?: string }) {
  const isAdmin = useAppSelector(selectIsAdmin);
  const [snap, setSnap] = useState<CaptureDebugSnapshot | null>(null);

  useEffect(() => {
    if (!isAdmin) return undefined;
    return subscribeDebug(setSnap);
  }, [isAdmin]);

  if (!isAdmin || !snap) return null;

  const levelPct = Math.round(snap.level * 100);

  return (
    <div
      className={`rounded-lg border border-border bg-card p-3 text-xs ${className ?? ""}`}
    >
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        <Activity className="h-3.5 w-3.5" />
        <span className="font-medium uppercase tracking-wide">
          Audio capture debug
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <Waypoints className="h-3 w-3" />
          {snap.capturePath ?? "idle"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <Stat label="Buffer" value={fmtSec(snap.durationSec)} />
        <Stat label="Samples" value={snap.sampleCount.toLocaleString()} />
        <Stat label="Rate" value={`${snap.sampleRate || 0} Hz`} />
        <Stat
          label="Memory"
          value={`${(snap.bufferBytes / 1024 / 1024).toFixed(1)} MB`}
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Mic className="h-3 w-3 text-muted-foreground" />
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-75"
            style={{ width: `${levelPct}%` }}
          />
        </div>
        <span className="w-8 text-right tabular-nums text-muted-foreground">
          {levelPct}
        </span>
      </div>

      <div className="mt-2 text-muted-foreground">
        Active card:{" "}
        <span className="font-mono text-foreground">
          {snap.activeCardId ?? "—"}
        </span>
        {snap.pendingCount > 0 && (
          <span className="ml-2">· {snap.pendingCount} clip(s) padding…</span>
        )}
      </div>

      {snap.cards.length > 0 && (
        <table className="mt-2 w-full table-fixed">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="font-normal">Card</th>
              <th className="font-normal">Start</th>
              <th className="font-normal">End</th>
              <th className="font-normal">Spoken</th>
              <th className="font-normal">Clip</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {snap.cards.map((c) => (
              <tr key={c.cardId} className="border-t border-border/50">
                <td className="truncate pr-1">{c.cardId}</td>
                <td>{c.startSample.toLocaleString()}</td>
                <td>{c.endSample?.toLocaleString() ?? "—"}</td>
                <td>{c.durationSec !== null ? fmtSec(c.durationSec) : "—"}</td>
                <td>{c.clipReady ? "ready" : "…"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono tabular-nums text-foreground">{value}</div>
    </div>
  );
}

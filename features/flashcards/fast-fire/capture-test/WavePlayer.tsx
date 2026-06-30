"use client";

// features/flashcards/fast-fire/capture-test/WavePlayer.tsx
//
// Proof-of-capture player: given a WAV blob, DECODE it (via the shared
// AudioContext) to get its REAL duration + a waveform, and play it back. This is
// how the capture core is proven correct BEFORE any AI — the owner can see each
// per-card segment is the right length, contains real speech (not silence/full-
// length), and plays back. No mock, no simulation: a real decode of the real blob.

import { useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { getSharedAudioContext } from "@/features/audio/audioContext";

interface WavePlayerProps {
  blob: Blob;
  label: string;
  /** Optional expected duration (s) to show alongside the measured one. */
  expectedSec?: number;
}

export function WavePlayer({ blob, label, expectedSec }: WavePlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [peak, setPeak] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derive the object URL (not setState-in-effect); revoke it on change/unmount.
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ctx = getSharedAudioContext();
        if (!ctx) throw new Error("no AudioContext");
        const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
        if (cancelled) return;
        setDurationSec(buf.duration);
        const data = buf.getChannelData(0);
        let max = 0;
        for (let i = 0; i < data.length; i++) {
          const a = Math.abs(data[i]);
          if (a > max) max = a;
        }
        setPeak(max);
        drawWaveform(canvasRef.current, data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "decode failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob]);

  const sizeKb = (blob.size / 1024).toFixed(0);

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-foreground">{label}</span>
        <a
          href={url}
          download={`${label.replace(/\s+/g, "-")}.wav`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" />
          download
        </a>
      </div>

      <canvas
        ref={canvasRef}
        width={480}
        height={56}
        className="h-14 w-full rounded bg-muted"
      />

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Measured:{" "}
          <span className="font-mono text-foreground">
            {durationSec !== null ? `${durationSec.toFixed(2)}s` : "decoding…"}
          </span>
        </span>
        {expectedSec !== undefined && (
          <span>
            Expected: <span className="font-mono">{expectedSec.toFixed(2)}s</span>
          </span>
        )}
        <span>
          Peak:{" "}
          <span className="font-mono text-foreground">
            {peak !== null ? peak.toFixed(3) : "—"}
          </span>
          {peak !== null && peak < 0.01 && (
            <span className="ml-1 text-destructive">(silent!)</span>
          )}
        </span>
        <span>{sizeKb} KB</span>
      </div>

      {error && <p className="mt-1 text-xs text-destructive">Decode error: {error}</p>}

      <audio controls src={url} className="mt-2 h-8 w-full">
        <track kind="captions" />
      </audio>
    </div>
  );
}

/** Draw a min/max peak waveform — proves real, varying audio content. */
function drawWaveform(canvas: HTMLCanvasElement | null, data: Float32Array): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const mid = height / 2;
  const samplesPerPx = Math.max(1, Math.floor(data.length / width));
  // Read the foreground color from the canvas's computed style for theme-fit.
  ctx.strokeStyle = getComputedStyle(canvas).color || "#888";
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for (let x = 0; x < width; x++) {
    const start = x * samplesPerPx;
    let min = 1;
    let max = -1;
    for (let i = 0; i < samplesPerPx; i++) {
      const v = data[start + i] ?? 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    ctx.moveTo(x + 0.5, mid + min * mid);
    ctx.lineTo(x + 0.5, mid + max * mid);
  }
  ctx.stroke();
}

"use client";

/**
 * components/mardown-display/blocks/audio/AudioOutputBlockSkeleton.tsx
 *
 * The loading twin of `<AudioOutputBlock>` (landscape layout). Same outer
 * card, same dimensions, same internal grid — so when generation finishes and
 * the real player mounts, NOTHING shifts. Use this anywhere an audio response
 * is being generated/resolved instead of a bare "Generating audio…" line.
 *
 * Purely presentational; no audio engine, no file actions.
 */

import React from "react";
import { Music } from "lucide-react";

export interface AudioOutputBlockSkeletonProps {
  /** Status line shown next to the shimmer. Default "Generating audio…". */
  label?: string;
}

function Bar({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-full bg-muted/70 animate-pulse ${className}`} />
  );
}

const AudioOutputBlockSkeleton: React.FC<AudioOutputBlockSkeletonProps> = ({
  label = "Generating audio…",
}) => {
  return (
    <div
      className="relative rounded-xl border border-border bg-card p-4 my-2 shadow-sm overflow-hidden"
      role="status"
      aria-label={label}
    >
      {/* Shimmer sweep across the whole card */}
      <div className="pointer-events-none absolute inset-0 animate-[audio-shimmer_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-primary/10 to-transparent" />

      <div className="relative flex gap-4 items-start">
        {/* Cover thumbnail (matches CoverArt size="small": 64×64 rounded-xl) */}
        <div className="w-16 h-16 rounded-xl flex-shrink-0 bg-gradient-to-br from-[hsl(var(--primary)/0.15)] to-[hsl(var(--secondary)/0.15)] border border-border flex items-center justify-center">
          <Music
            size={24}
            className="text-primary/60 animate-pulse"
            strokeWidth={1.5}
          />
        </div>

        {/* Right column */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center justify-between mb-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Bar className="h-3 w-2/3" />
              <Bar className="h-2.5 w-1/3" />
            </div>
            {/* Equalizer placeholder */}
            <div className="flex items-end gap-[2px] h-5 w-8" aria-hidden>
              {[60, 90, 45, 75].map((h, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-primary/50 animate-pulse"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>

          {/* Progress */}
          <div className="mb-2">
            <Bar className="h-1.5 w-full" />
            <div className="flex justify-between mt-1">
              <Bar className="h-2 w-8" />
              <Bar className="h-2 w-8" />
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Bar className="h-7 w-7 !rounded-full" />
              <Bar className="h-9 w-9 !rounded-full bg-primary/30" />
              <Bar className="h-7 w-7 !rounded-full" />
              <Bar className="h-7 w-7 !rounded-full" />
            </div>
            <div className="flex items-center gap-1.5 w-28">
              <Bar className="h-4 w-4 !rounded-full" />
              <Bar className="h-1.5 flex-1" />
            </div>
          </div>

          {/* File actions row */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
            <Bar className="h-4 w-20" />
            <Bar className="h-4 w-16" />
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Music size={11} className="text-primary/60" />
              {label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioOutputBlockSkeleton;

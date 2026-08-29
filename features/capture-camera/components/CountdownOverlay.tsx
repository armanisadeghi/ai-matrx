"use client";

/**
 * CountdownOverlay — the big centered timer digits (iPhone timer capture):
 * one large white numeral per second, scaling in as it changes.
 *
 * Package source (`@ai-matrx/capture`) — presentational only.
 */

import React from "react";

export function CountdownOverlay({ seconds }: { seconds: number | null }) {
  if (seconds === null || seconds <= 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <span
        key={seconds}
        className="text-[120px] font-light text-white drop-shadow-lg [@starting-style]:scale-125 [@starting-style]:opacity-0 transition-all duration-300"
      >
        {seconds}
      </span>
    </div>
  );
}

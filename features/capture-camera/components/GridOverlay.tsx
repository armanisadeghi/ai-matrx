"use client";

/**
 * GridOverlay — the rule-of-thirds composition grid over the viewfinder.
 * Genuinely supported (pure CSS), toggled from the options grid.
 *
 * Package source (`@ai-matrx/capture`) — presentational only.
 */

import React from "react";

export function GridOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
      <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
      <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
      <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
    </div>
  );
}
